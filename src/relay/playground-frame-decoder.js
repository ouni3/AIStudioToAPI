/**
 * File: src/relay/playground-frame-decoder.js
 * Description: Pure functions decoding AI Studio MakerSuite GenerateContent /
 *              CountTokens JSON+protobuf stream frames back into Gemini REST
 *              response chunks, including sparse-JSON (elided array slots) handling.
 *
 * Ported from the verified protocol of Mag1cFall/AIStudio2API (internal/aistudio:
 * decoder.go / event.go / tools.go decodeWireStruct).
 *
 * This file is dual-environment:
 *   - Node (unit tests): loaded via require(), exports via module.exports.
 *   - Browser: concatenated verbatim after playground-wire-encoder.js and before
 *     scripts/client/playground-relay.js.
 */

const RELAY_FINISH_REASONS = {
    0: "UNSPECIFIED",
    1: "STOP",
    2: "MAX_TOKENS",
    3: "SAFETY",
    4: "RECITATION",
    5: "OTHER",
    6: "LANGUAGE",
    7: "BLOCKLIST",
    8: "PROHIBITED_CONTENT",
    9: "SPII",
    10: "MALFORMED_FUNCTION_CALL",
    11: "IMAGE_SAFETY",
    12: "UNEXPECTED_TOOL_CALL",
    13: "TOO_MANY_TOOL_CALLS",
    14: "IMAGE_PROHIBITED_CONTENT",
    15: "IMAGE_OTHER",
    16: "NO_IMAGE",
    17: "IMAGE_RECITATION",
    18: "MISSING_THOUGHT_SIGNATURE",
};

const RELAY_PROMPT_BLOCK_REASONS = {
    0: "UNSPECIFIED",
    1: "SAFETY",
    2: "OTHER",
    3: "BLOCKLIST",
    4: "PROHIBITED_CONTENT",
    5: "IMAGE_SAFETY",
};

const RELAY_EXECUTABLE_LANGUAGES = { 0: "LANGUAGE_UNSPECIFIED", 1: "PYTHON" };

const RELAY_CODE_OUTCOMES = {
    0: "OUTCOME_UNSPECIFIED",
    1: "OUTCOME_OK",
    2: "OUTCOME_FAILED",
    3: "OUTCOME_DEADLINE_EXCEEDED",
};

function relayIsJsonNull(value) {
    return value === null || value === undefined;
}

/**
 * Normalize sparse JSON text ("[1,,3]" / "[1,]" style elided slots) by inserting
 * null placeholders, tracking string/escape state so strings are never rewritten.
 */
function parseSparseJson(text) {
    const source = String(text);
    let out = "";
    let inString = false;
    let escaped = false;
    let previousToken = "";
    for (let i = 0; i < source.length; i++) {
        const value = source[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (value === "\\") {
                escaped = true;
            } else if (value === '"') {
                inString = false;
            }
            out += value;
            continue;
        }
        if (value === '"') {
            inString = true;
            previousToken = value;
            out += value;
            continue;
        }
        if (value === "," && (previousToken === "[" || previousToken === ",")) {
            previousToken = value;
            out += "null,";
            continue;
        }
        if (value === "]" && previousToken === ",") {
            previousToken = value;
            out += "null]";
            continue;
        }
        if (value !== " " && value !== "\n" && value !== "\r" && value !== "\t") {
            previousToken = value;
        }
        out += value;
    }
    return JSON.parse(out);
}

/**
 * Incremental extractor for the repeated frame array carried in field 1 of the
 * response root. Feed text chunks via push(); each complete frame's raw (still
 * sparse) JSON text is emitted through the array returned by takeFrames().
 *
 * Stream shape: `[[<frame>,<frame>,...],<ignored top-level fields>...]`
 */
class RelayFrameExtractor {
    constructor() {
        this._buffer = "";
        this._phase = "expectRoot"; // expectRoot | expectField1 | value | afterField1
        this._frames = [];
    }

    _fail(detail) {
        const error = new Error(`GenerateContent stream protocol error: ${detail}`);
        error.name = "RelayDecodeError";
        return error;
    }

    push(text) {
        this._buffer += text;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (this._phase === "expectRoot") {
                if (!this._skipWhitespace()) break;
                if (this._buffer[0] !== "[") {
                    throw this._fail("response root is not an array");
                }
                this._buffer = this._buffer.slice(1);
                this._phase = "expectField1";
                continue;
            }
            if (this._phase === "expectField1") {
                if (!this._skipWhitespace()) break;
                const next = this._buffer[0];
                if (next === "]") {
                    // Root closed without frames; nothing more to extract.
                    this._buffer = this._buffer.slice(1);
                    this._phase = "afterField1";
                    continue;
                }
                if (next !== "[") {
                    throw this._fail("field 1 is not a repeated array");
                }
                this._buffer = this._buffer.slice(1);
                this._phase = "value";
                continue;
            }
            if (this._phase === "value") {
                if (!this._skipSeparators()) break;
                const next = this._buffer[0];
                if (next === "]") {
                    this._buffer = this._buffer.slice(1);
                    this._phase = "afterField1";
                    continue;
                }
                const frame = this._scanValue();
                if (frame === null) break;
                this._frames.push(frame);
                continue;
            }
            if (this._phase === "afterField1") {
                // Remaining top-level fields are ignored; drain the buffer.
                this._buffer = "";
                break;
            }
            break;
        }
    }

    /** Drop leading whitespace; false when the buffer is exhausted. */
    _skipWhitespace() {
        const match = this._buffer.match(/^\s+/);
        if (match) {
            this._buffer = this._buffer.slice(match[0].length);
        }
        return this._buffer.length > 0;
    }

    /** Drop leading whitespace and element separators; false when exhausted. */
    _skipSeparators() {
        const match = this._buffer.match(/^[\s,]+/);
        if (match) {
            this._buffer = this._buffer.slice(match[0].length);
        }
        return this._buffer.length > 0;
    }

    /**
     * Scan one complete JSON value from the buffer start. Consumes the value text
     * (not the following separator). Returns the raw text, or null when the value
     * is still incomplete and more stream data is required.
     */
    _scanValue() {
        const first = this._buffer[0];
        if (first === "[" || first === "{") {
            let depth = 0;
            let inString = false;
            let escaped = false;
            for (let i = 0; i < this._buffer.length; i++) {
                const char = this._buffer[i];
                if (inString) {
                    if (escaped) escaped = false;
                    else if (char === "\\") escaped = true;
                    else if (char === '"') inString = false;
                    continue;
                }
                if (char === '"') {
                    inString = true;
                } else if (char === "[" || char === "{") {
                    depth++;
                } else if (char === "]" || char === "}") {
                    depth--;
                    if (depth === 0) {
                        const raw = this._buffer.slice(0, i + 1);
                        this._buffer = this._buffer.slice(i + 1);
                        return raw;
                    }
                }
            }
            return null;
        }
        if (first === '"') {
            let escaped = false;
            for (let i = 1; i < this._buffer.length; i++) {
                const char = this._buffer[i];
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (char === "\\") {
                    escaped = true;
                    continue;
                }
                if (char === '"') {
                    const raw = this._buffer.slice(0, i + 1);
                    this._buffer = this._buffer.slice(i + 1);
                    return raw;
                }
            }
            return null;
        }
        // Primitive: number / true / false / null, terminated by ',' or ']'.
        const match = this._buffer.match(/^[^,\]\s]*/);
        const candidate = match ? match[0] : "";
        if (this._buffer.length === candidate.length) {
            return null; // Terminator not yet arrived.
        }
        this._buffer = this._buffer.slice(candidate.length);
        return candidate === "" ? null : candidate;
    }

    takeFrames() {
        const frames = this._frames;
        this._frames = [];
        return frames;
    }

    close() {
        if (this._phase !== "afterField1") {
            throw this._fail("stream ended before the frame array closed");
        }
    }
}

// ---------- Struct (protobuf Value) decoding ----------

function relayDecodeWireValue(fields) {
    let variant = -1;
    for (let index = 0; index < 6; index++) {
        if (!relayIsJsonNull(fields[index])) {
            if (variant >= 0) {
                throw RelayDecodeError("wire Value sets multiple oneof fields");
            }
            variant = index;
        }
    }
    switch (variant) {
        case 0:
            return null;
        case 1:
            return Number(fields[1]);
        case 2:
            return String(fields[2]);
        case 3:
            return fields[3] === true || fields[3] === 1;
        case 4:
            return relayDecodeWireStructObject(fields[4]);
        case 5: {
            const itemsRaw = Array.isArray(fields[5]) ? fields[5][0] : null;
            if (relayIsJsonNull(itemsRaw)) return [];
            const items = itemsRaw;
            return items.map(relayDecodeWireValue);
        }
        default:
            throw RelayDecodeError("wire Value is missing its oneof field");
    }
}

function relayDecodeWireStructObject(raw) {
    const object = {};
    if (relayIsJsonNull(raw)) return object;
    const entries = Array.isArray(raw[0]) ? raw[0] : null;
    if (relayIsJsonNull(entries)) return object;
    for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length < 2) {
            throw RelayDecodeError("wire Struct map entry is malformed");
        }
        object[String(entry[0])] = relayDecodeWireValue(entry[1]);
    }
    return object;
}

function RelayDecodeError(message) {
    const error = new Error(message);
    error.name = "RelayDecodeError";
    return error;
}

// ---------- Frame -> REST chunk translation ----------

function relayDecodePartToRest(part) {
    if (!Array.isArray(part)) {
        throw RelayDecodeError("response part is not an array");
    }
    const thought = part[12] === true;
    const signature = relayIsJsonNull(part[14]) ? undefined : String(part[14]);
    const restPart = {};

    if (!relayIsJsonNull(part[1])) {
        restPart.text = String(part[1]);
        if (thought) restPart.thought = true;
    }
    if (!relayIsJsonNull(part[2]) && !thought) {
        const media = part[2];
        restPart.inlineData = { data: String(media[1]), mimeType: String(media[0]) };
    }
    if (!relayIsJsonNull(part[7])) {
        const languageCode = Number(part[7][0]);
        const language = RELAY_EXECUTABLE_LANGUAGES[languageCode];
        if (language === undefined) {
            throw RelayDecodeError(`unknown executable code language: ${languageCode}`);
        }
        restPart.executableCode = { code: String(part[7][1] || ""), language };
    }
    if (!relayIsJsonNull(part[8])) {
        const outcomeCode = Number(part[8][0]);
        const outcome = RELAY_CODE_OUTCOMES[outcomeCode];
        if (outcome === undefined) {
            throw RelayDecodeError(`unknown code execution outcome: ${outcomeCode}`);
        }
        const result = { outcome };
        const value = relayIsJsonNull(part[8][1]) ? "" : String(part[8][1]);
        if (outcomeCode === 1) {
            result.output = value;
        } else {
            result.error = value;
        }
        restPart.codeExecutionResult = result;
    }
    if (!relayIsJsonNull(part[10])) {
        const call = part[10];
        if (relayIsJsonNull(call[0])) {
            throw RelayDecodeError("function call is missing its name");
        }
        const functionCall = { args: relayDecodeWireStructObject(call[1]), name: String(call[0]) };
        if (!relayIsJsonNull(call[2])) functionCall.id = String(call[2]);
        restPart.functionCall = functionCall;
    }
    if (signature !== undefined) {
        restPart.thoughtSignature = signature;
    }
    return restPart;
}

function relayDecodeUsageToRest(usageFields) {
    if (relayIsJsonNull(usageFields[0]) || relayIsJsonNull(usageFields[2])) {
        return null;
    }
    const usageMetadata = {
        candidatesTokenCount: relayIsJsonNull(usageFields[1]) ? 0 : Number(usageFields[1]),
        promptTokenCount: Number(usageFields[0]),
        totalTokenCount: Number(usageFields[2]),
    };
    if (!relayIsJsonNull(usageFields[3])) {
        usageMetadata.cachedContentTokenCount = Number(usageFields[3]);
    }
    if (!relayIsJsonNull(usageFields[7])) {
        usageMetadata.toolUsePromptTokenCount = Number(usageFields[7]);
    }
    if (!relayIsJsonNull(usageFields[9])) {
        usageMetadata.thoughtsTokenCount = Number(usageFields[9]);
    }
    return usageMetadata;
}

function relayDecodeCitationsToRest(citationsRaw) {
    const entries = Array.isArray(citationsRaw[0]) ? citationsRaw[0] : null;
    if (relayIsJsonNull(entries)) return null;
    const citations = entries.map(entry => {
        const citation = { uri: String(entry[2]) };
        if (!relayIsJsonNull(entry[3])) citation.title = String(entry[3]);
        return citation;
    });
    return { citations };
}

function relayDecodeGroundingToRest(groundingRaw) {
    const groundingMetadata = {};
    if (Array.isArray(groundingRaw)) {
        const queries = [];
        for (const fieldIndex of [4, 5]) {
            if (!relayIsJsonNull(groundingRaw[fieldIndex])) {
                for (const query of groundingRaw[fieldIndex]) {
                    queries.push(String(query));
                }
            }
        }
        if (queries.length > 0) {
            groundingMetadata.webSearchQueries = queries;
        }
    }
    return groundingMetadata;
}

/**
 * Stateful decoder for one GenerateContent stream. decode(frameArray) accepts the
 * parsed (sparse-normalized) frame array and returns a Gemini REST response chunk
 * object, or null for frames that carry no REST-visible payload.
 */
class RelayFrameDecoder {
    constructor(model) {
        this.model = model || "";
        this.finished = false;
        this.usageMetadata = null;
        this.promptFeedback = null;
        this.continuationToken = null;
        this.finishReason = null;
    }

    decode(frame) {
        if (!Array.isArray(frame) || frame.length === 0) {
            throw RelayDecodeError("empty stream frame");
        }
        if (relayIsJsonNull(frame[0])) {
            if (!relayIsJsonNull(frame[1])) {
                const feedback = Array.isArray(frame[1]) ? frame[1] : [];
                const reasonCode = relayIsJsonNull(feedback[0]) ? 0 : Number(feedback[0]);
                this.promptFeedback = {
                    blockReason: RELAY_PROMPT_BLOCK_REASONS[reasonCode] || `PROVIDER_${reasonCode}`,
                };
                if (!relayIsJsonNull(feedback[2])) {
                    this.promptFeedback.blockReasonMessage = String(feedback[2]);
                }
                this.finished = true;
                return { promptFeedback: this.promptFeedback };
            }
            return null;
        }

        const candidates = frame[0];
        if (!Array.isArray(candidates) || candidates.length !== 1) {
            throw RelayDecodeError("candidate count is not the confirmed 1");
        }
        const candidate = candidates[0];
        if (!Array.isArray(candidate)) {
            throw RelayDecodeError("candidate is not an array");
        }

        const restCandidate = { index: 0 };
        const contentRaw = candidate[0];
        if (!relayIsJsonNull(contentRaw)) {
            const role = relayIsJsonNull(contentRaw[1]) ? "model" : String(contentRaw[1]);
            if (role !== "model") {
                throw RelayDecodeError("response role is not model");
            }
            const partsRaw = contentRaw[0];
            if (!relayIsJsonNull(partsRaw)) {
                const parts = partsRaw.map(relayDecodePartToRest);
                if (parts.length > 0) {
                    restCandidate.content = { parts, role: "model" };
                }
            }
        }
        if (!relayIsJsonNull(candidate[1])) {
            const finishCode = Number(candidate[1]);
            restCandidate.finishReason = RELAY_FINISH_REASONS[finishCode] || `PROVIDER_${finishCode}`;
            this.finishReason = restCandidate.finishReason;
            if (!relayIsJsonNull(candidate[3])) {
                restCandidate.finishMessage = String(candidate[3]);
            }
        }
        if (!relayIsJsonNull(candidate[6])) {
            const citations = relayDecodeCitationsToRest(candidate[6]);
            if (citations) restCandidate.citationMetadata = citations;
        }
        if (!relayIsJsonNull(candidate[7])) {
            restCandidate.groundingMetadata = relayDecodeGroundingToRest(candidate[7]);
        }
        if (!relayIsJsonNull(candidate[8])) {
            this.continuationToken = String(candidate[8]);
        }

        const usage = relayIsJsonNull(frame[2]) ? null : relayDecodeUsageToRest(frame[2]);
        if (usage) {
            this.usageMetadata = usage;
        }

        if (!relayIsJsonNull(candidate[1])) {
            this.finished = true;
        }

        const hasCandidatePayload =
            restCandidate.content !== undefined ||
            restCandidate.finishReason !== undefined ||
            restCandidate.citationMetadata !== undefined ||
            restCandidate.groundingMetadata !== undefined;
        const restChunk = {};
        if (hasCandidatePayload) {
            restChunk.candidates = [restCandidate];
        }
        if (usage) {
            restChunk.usageMetadata = usage;
        }
        return Object.keys(restChunk).length > 0 ? restChunk : null;
    }

    /**
     * Merge all previously emitted REST chunks into one unary generateContent
     * response body (concatenate parts, keep last finish reason and usage).
     */
    mergeUnary(chunks) {
        const merged = {};
        const parts = [];
        let lastCandidateExtras = null;
        for (const chunk of chunks) {
            if (chunk.promptFeedback) {
                merged.promptFeedback = chunk.promptFeedback;
            }
            if (chunk.usageMetadata) {
                merged.usageMetadata = chunk.usageMetadata;
            }
            const candidate = chunk.candidates && chunk.candidates[0];
            if (!candidate) continue;
            if (candidate.content && Array.isArray(candidate.content.parts)) {
                parts.push(...candidate.content.parts);
            }
            const extras = { ...candidate };
            delete extras.content;
            if (Object.keys(extras).length > 0) {
                lastCandidateExtras = extras;
            }
        }
        if (this.promptFeedback && !merged.promptFeedback) {
            merged.promptFeedback = this.promptFeedback;
        }
        if (this.usageMetadata && !merged.usageMetadata) {
            merged.usageMetadata = this.usageMetadata;
        }
        if (parts.length > 0 || lastCandidateExtras) {
            const mergedCandidate = { index: 0 };
            if (parts.length > 0) {
                mergedCandidate.content = { parts, role: "model" };
            }
            if (lastCandidateExtras) {
                Object.assign(mergedCandidate, lastCandidateExtras);
            }
            merged.candidates = [mergedCandidate];
        }
        if (this.model) {
            merged.modelVersion = this.model;
        }
        return merged;
    }
}

/**
 * Parse a CountTokens response body (sparse JSON root array; field 0 = count).
 */
function parseCountTokensResponse(text) {
    const root = parseSparseJson(text);
    if (!Array.isArray(root) || relayIsJsonNull(root[0])) {
        throw RelayDecodeError("countTokens response is missing the token total");
    }
    return { totalTokens: Number(root[0]) };
}

/**
 * Parse an upstream RPC error body: `[code, message]` (optionally wrapped).
 * Returns { code, message } or null when the body is not a decodable RPC error.
 */
function parseRpcErrorBody(text) {
    let root;
    try {
        root = parseSparseJson(text);
    } catch (e) {
        return null;
    }
    if (!Array.isArray(root) || root.length < 2) return null;
    let provider = root;
    if (Array.isArray(root[1])) {
        provider = root[1];
        if (provider.length < 2) return null;
    }
    const rawCode = provider[0];
    const code = typeof rawCode === "number" && Number.isFinite(rawCode) ? rawCode : null;
    let message = "";
    if (typeof provider[1] === "string") {
        message = provider[1];
    } else if (Array.isArray(provider[1]) && provider[1].length > 0) {
        // Nested google.rpc message shape: [messages]
        message = String(provider[1][0]);
    }
    if (code === null && message === "") return null;
    return { code, message };
}

/**
 * Decode a Build ProxyResponse oneof:
 *   field 0: JSON string
 *   field 2: Base64 byte array
 * Returns the raw Gemini API GenerateContentResponse JSON string.
 */
function relayDecodeBuildResponseBody(rawArray) {
    if (!Array.isArray(rawArray) || rawArray.length === 0) {
        throw RelayDecodeError("Build proxy response is empty");
    }
    if (typeof rawArray[0] === "string" && rawArray[0] !== "") {
        return rawArray[0];
    }
    if (rawArray.length > 2 && typeof rawArray[2] === "string" && rawArray[2] !== "") {
        if (typeof atob === "function") {
            return atob(rawArray[2]);
        }
        return Buffer.from(rawArray[2], "base64").toString("utf-8");
    }
    throw RelayDecodeError("Build proxy response missing body");
}

/**
 * Parse a Build unary response (ProxyUnaryCall) returning the decoded
 * GenerateContentResponse JSON string.
 */
function parseBuildUnaryResponse(text) {
    const root = parseSparseJson(text);
    return relayDecodeBuildResponseBody(root);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseBuildUnaryResponse,
        parseCountTokensResponse,
        parseRpcErrorBody,
        parseSparseJson,
        relayDecodeBuildResponseBody,
        RelayDecodeError,
        relayDecodeWireStructObject,
        RelayFrameDecoder,
        RelayFrameExtractor,
    };
}
