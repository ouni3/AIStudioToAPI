/**
 * File: tests/test_playground_frame_decoder.mjs
 * Description: Unit tests for src/relay/playground-frame-decoder.js (wire -> REST).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
    parseSparseJson,
    RelayFrameExtractor,
    RelayFrameDecoder,
    parseCountTokensResponse,
    parseRpcErrorBody,
    relayDecodeBuildResponseBody,
    parseBuildUnaryResponse,
} = require("../src/relay/playground-frame-decoder.js");

// ---- fixture helpers (mirror the wire layout: frame=[candidates, feedback?, usage?]) ----

function textPartWire(text, { thought = false, signature = null } = {}) {
    const part = [null, text];
    if (thought) {
        while (part.length <= 12) part.push(null);
        part[12] = true;
    }
    if (signature) {
        while (part.length <= 14) part.push(null);
        part[14] = signature;
    }
    return part;
}

function candidateWire({ parts = null, finish = null, citations = null, grounding = null }) {
    const candidate = [];
    if (parts !== null) {
        candidate[0] = [parts.map(part => part), "model"];
    }
    if (finish !== null) {
        candidate[1] = finish;
    }
    if (citations !== null) candidate[6] = citations;
    if (grounding !== null) candidate[7] = grounding;
    return candidate;
}

function frameWire({ candidate = null, usage = null }) {
    const frame = [];
    frame[0] = [candidate];
    if (usage !== null) frame[2] = usage;
    return frame;
}

test("parseSparseJson fills elided array slots", () => {
    assert.deepEqual(parseSparseJson("[1,,3]"), [1, null, 3]);
    assert.deepEqual(parseSparseJson("[1,]"), [1, null]);
    assert.deepEqual(parseSparseJson("[,1]"), [null, 1]);
    assert.deepEqual(parseSparseJson('["a,b",,2]'), ["a,b", null, 2]);
    assert.deepEqual(parseSparseJson('["[\\"]",]'), ['["]', null]);
    assert.deepEqual(parseSparseJson("[[[,1],]]"), [[[null, 1], null]]);
});

test("extractor splits frames from a chunked sparse stream", () => {
    const frame1 = JSON.stringify(frameWire({ candidate: candidateWire({ parts: [textPartWire("He")] }) }));
    // Hand-craft frame 2 with a sparse prompt-feedback slot between candidates and usage.
    const frame2Candidates = JSON.stringify([candidateWire({ finish: 1, parts: [textPartWire("llo")] })]);
    const frame2 = `[${frame2Candidates},,[3,5,8]]`;
    const stream = `[[${frame1},${frame2}]]`;

    const extractor = new RelayFrameExtractor();
    const collected = [];
    for (let i = 0; i < stream.length; i += 3) {
        extractor.push(stream.slice(i, i + 3));
        for (const frame of extractor.takeFrames()) {
            collected.push(frame);
        }
    }
    extractor.close();
    assert.equal(collected.length, 2);
    const parsed1 = parseSparseJson(collected[0]);
    const parsed2 = parseSparseJson(collected[1]);
    assert.deepEqual(parsed1[0][0][0][0], [[null, "He"]]);
    assert.equal(parsed2[0][0][1], 1);
    assert.deepEqual(parsed2[2], [3, 5, 8]);
});

test("extractor tolerates trailing top-level fields and whitespace", () => {
    const extractor = new RelayFrameExtractor();
    extractor.push('  [ [ 1 , 2 ] , "ignored" ]  ');
    const frames = extractor.takeFrames();
    extractor.close();
    assert.deepEqual(frames, ["1", "2"]);
});

test("decoder translates text frames into REST chunks", () => {
    const decoder = new RelayFrameDecoder("gemini-3.6-flash");
    const chunk1 = decoder.decode(frameWire({ candidate: candidateWire({ parts: [textPartWire("He")] }) }));
    assert.deepEqual(chunk1, {
        candidates: [{ content: { parts: [{ text: "He" }], role: "model" }, index: 0 }],
    });

    const chunk2 = decoder.decode(
        frameWire({
            candidate: candidateWire({ finish: 1, parts: [textPartWire("llo")] }),
            usage: [3, 5, 8],
        })
    );
    assert.deepEqual(chunk2, {
        candidates: [
            {
                content: { parts: [{ text: "llo" }], role: "model" },
                finishReason: "STOP",
                index: 0,
            },
        ],
        usageMetadata: { candidatesTokenCount: 5, promptTokenCount: 3, totalTokenCount: 8 },
    });
    assert.equal(decoder.finished, true);
    assert.equal(decoder.finishReason, "STOP");
});

test("decoder translates thought parts, signatures, and reasoning usage", () => {
    const decoder = new RelayFrameDecoder("m");
    const chunk = decoder.decode(
        frameWire({
            candidate: candidateWire({ parts: [textPartWire("hmm", { signature: "sig-1", thought: true })] }),
            usage: [1, 2, 3, null, null, null, null, null, null, 7],
        })
    );
    const part = chunk.candidates[0].content.parts[0];
    assert.equal(part.text, "hmm");
    assert.equal(part.thought, true);
    assert.equal(part.thoughtSignature, "sig-1");
    assert.equal(chunk.usageMetadata.thoughtsTokenCount, 7);
});

test("decoder translates function calls with struct arguments", () => {
    const callPart = new Array(11).fill(null);
    callPart[10] = [
        "get_weather",
        [
            [
                ["city", [null, null, "Paris"]],
                ["days", [null, 3]],
            ],
        ],
        "call-1",
    ];
    const decoder = new RelayFrameDecoder("m");
    const chunk = decoder.decode(frameWire({ candidate: candidateWire({ parts: [callPart] }) }));
    const part = chunk.candidates[0].content.parts[0];
    assert.equal(part.functionCall.name, "get_weather");
    assert.deepEqual(part.functionCall.args, { city: "Paris", days: 3 });
    assert.equal(part.functionCall.id, "call-1");
});

test("decoder maps prompt feedback frames", () => {
    const decoder = new RelayFrameDecoder("m");
    const chunk = decoder.decode([null, [1, null, "unsafe input"]]);
    assert.deepEqual(chunk, { promptFeedback: { blockReason: "SAFETY", blockReasonMessage: "unsafe input" } });
    assert.equal(decoder.finished, true);
});

test("decoder maps citation and grounding metadata", () => {
    const citations = [[["doc", null, "https://example.com", "Example"]]];
    const grounding = [null, null, null, null, ["query a", "query b"]];
    const decoder = new RelayFrameDecoder("m");
    const chunk = decoder.decode(
        frameWire({
            candidate: candidateWire({ citations, finish: 1, grounding, parts: [textPartWire("cite")] }),
        })
    );
    const candidate = chunk.candidates[0];
    assert.equal(candidate.finishReason, "STOP");
    assert.deepEqual(candidate.citationMetadata.citations, [{ title: "Example", uri: "https://example.com" }]);
    assert.deepEqual(candidate.groundingMetadata.webSearchQueries, ["query a", "query b"]);
});

test("decoder maps safety finish reasons and executable code parts", () => {
    const codePart = new Array(8).fill(null);
    codePart[7] = [1, "print(1)"];
    const resultPart = new Array(9).fill(null);
    resultPart[8] = [1, "1"];
    const decoder = new RelayFrameDecoder("m");
    const chunk = decoder.decode(frameWire({ candidate: candidateWire({ finish: 3, parts: [codePart, resultPart] }) }));
    const candidate = chunk.candidates[0];
    assert.equal(candidate.finishReason, "SAFETY");
    assert.deepEqual(candidate.content.parts[0].executableCode, { code: "print(1)", language: "PYTHON" });
    assert.deepEqual(candidate.content.parts[1].codeExecutionResult, { outcome: "OUTCOME_OK", output: "1" });
});

test("mergeUnary folds streamed chunks into a single REST response", () => {
    const decoder = new RelayFrameDecoder("gemini-3.6-flash");
    const chunks = [];
    for (const frame of [
        frameWire({ candidate: candidateWire({ parts: [textPartWire("He")] }) }),
        frameWire({ candidate: candidateWire({ parts: [textPartWire("llo ")] }) }),
        frameWire({
            candidate: candidateWire({ finish: 1, parts: [textPartWire("world")] }),
            usage: [3, 5, 8],
        }),
    ]) {
        const chunk = decoder.decode(frame);
        if (chunk) chunks.push(chunk);
    }
    const merged = decoder.mergeUnary(chunks);
    assert.equal(merged.modelVersion, "gemini-3.6-flash");
    assert.deepEqual(merged.candidates[0].content.parts, [{ text: "He" }, { text: "llo " }, { text: "world" }]);
    assert.equal(merged.candidates[0].finishReason, "STOP");
    assert.equal(merged.usageMetadata.totalTokenCount, 8);
});

test("parses CountTokens and RPC error bodies", () => {
    assert.deepEqual(parseCountTokensResponse("[123]"), { totalTokens: 123 });
    assert.deepEqual(parseCountTokensResponse("[123,null]"), { totalTokens: 123 });

    assert.deepEqual(parseRpcErrorBody('[7,"boom"]'), { code: 7, message: "boom" });
    assert.deepEqual(parseRpcErrorBody('[3,["NOT_FOUND","models/x is not found"]]'), {
        code: null,
        message: "models/x is not found",
    });
    assert.equal(parseRpcErrorBody("not-json"), null);
    assert.equal(parseRpcErrorBody("[1]"), null);
});

test("decodes Build proxy responses in string and base64 formats", () => {
    const rawJson = '{"candidates":[{"content":{"parts":[{"text":"Hello Build"}]}}]}';
    assert.equal(relayDecodeBuildResponseBody([rawJson]), rawJson);

    const b64 = Buffer.from(rawJson, "utf-8").toString("base64");
    assert.equal(relayDecodeBuildResponseBody([null, null, b64]), rawJson);

    assert.equal(parseBuildUnaryResponse(`["${rawJson.replace(/"/g, '\\"')}"]`), rawJson);
});
