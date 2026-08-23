import assert from "assert";
import FormatConverter from "../src/core/FormatConverter.js";

console.log("=== Testing FormatConverter output structures ===");

const mockLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} };
const fc = new FormatConverter(mockLogger, {});

// Helper to parse SSE stream output chunks into JSON objects
function parseSseChunks(str) {
    if (!str) return [];
    return str
        .split("\n\n")
        .filter(s => s.startsWith("data: "))
        .map(s => JSON.parse(s.replace(/^data:\s*/, "")));
}

// ==========================================
// 1. OpenAI Non-Stream Tests
// ==========================================
console.log("--- 1. OpenAI Non-Stream Tests ---");

// 1.1 Empty candidate (no candidate array or empty candidate)
const emptyResponse = { candidates: [] };
const openaiEmptyResult = fc.convertGoogleToOpenAINonStream(emptyResponse, "gemini-2.5-flash");
assert.strictEqual(openaiEmptyResult.object, "chat.completion");
assert.strictEqual(openaiEmptyResult.choices.length, 1);
assert.strictEqual(openaiEmptyResult.choices[0].finish_reason, "stop");
assert.strictEqual(openaiEmptyResult.choices[0].message.role, "assistant");
assert.strictEqual(openaiEmptyResult.choices[0].message.content, "");

// 1.2 Prompt feedback blocked (Safety)
const promptFeedbackBlock = {
    promptFeedback: { blockReason: "SAFETY" }
};
const openaiPromptBlockResult = fc.convertGoogleToOpenAINonStream(promptFeedbackBlock, "gemini-2.5-flash");
assert.strictEqual(openaiPromptBlockResult.choices[0].finish_reason, "content_filter");
assert.strictEqual(openaiPromptBlockResult.choices[0].message.content.includes("Blocked due to safety settings"), true);

// 1.3 Candidate finishReason = SAFETY
const candidateSafetyBlock = {
    candidates: [{
        finishReason: "SAFETY",
        content: { parts: [], role: "model" }
    }]
};
const openaiCandidateSafetyResult = fc.convertGoogleToOpenAINonStream(candidateSafetyBlock, "gemini-2.5-flash");
assert.strictEqual(openaiCandidateSafetyResult.choices[0].finish_reason, "content_filter");
assert.strictEqual(openaiCandidateSafetyResult.choices[0].message.content, "[Content omitted due to safety filter]");

// 1.4 Thinking-only candidate (Gemini thought parts)
const thinkingOnlyCandidate = {
    candidates: [{
        finishReason: "STOP",
        content: {
            parts: [{ text: "Analyzing query...", thought: true }],
            role: "model"
        }
    }]
};
const openaiThinkingResult = fc.convertGoogleToOpenAINonStream(thinkingOnlyCandidate, "gemini-2.5-flash");
assert.strictEqual(openaiThinkingResult.choices[0].message.role, "assistant");
assert.strictEqual(openaiThinkingResult.choices[0].message.content, "");
assert.strictEqual(openaiThinkingResult.choices[0].message.reasoning_content, "Analyzing query...");
assert.strictEqual(openaiThinkingResult.choices[0].finish_reason, "stop");

console.log("✔ OpenAI Non-Stream tests passed!");

// ==========================================
// 2. OpenAI Stream Tests
// ==========================================
console.log("--- 2. OpenAI Stream Tests ---");

// 2.1 Prompt feedback safety block in stream
const streamState1 = {};
const promptBlockStreamChunk = fc.translateGoogleToOpenAIStream(`data: ${JSON.stringify(promptFeedbackBlock)}`, "gemini-2.5-flash", streamState1);
const parsedPromptBlockChunks = parseSseChunks(promptBlockStreamChunk);
assert.strictEqual(parsedPromptBlockChunks.length, 1);
assert.strictEqual(parsedPromptBlockChunks[0].choices[0].finish_reason, "content_filter");
assert.strictEqual(parsedPromptBlockChunks[0].choices[0].delta.role, "assistant");
assert.strictEqual(parsedPromptBlockChunks[0].choices[0].delta.content.includes("Block Reason: SAFETY"), true);

// 2.2 Candidate safety block in stream
const streamState2 = {};
const candidateSafetyChunk = fc.translateGoogleToOpenAIStream(`data: ${JSON.stringify(candidateSafetyBlock)}`, "gemini-2.5-flash", streamState2);
const parsedCandidateSafetyChunks = parseSseChunks(candidateSafetyChunk);
assert.strictEqual(parsedCandidateSafetyChunks.length, 2); // 1 for safety content delta, 1 for final chunk with finish_reason: content_filter
assert.strictEqual(parsedCandidateSafetyChunks[0].choices[0].delta.content, "[Content omitted due to safety filter]");
assert.strictEqual(parsedCandidateSafetyChunks[1].choices[0].finish_reason, "content_filter");

// 2.3 Empty candidate / empty content fallback in stream (ensuring delta.content emitted)
const streamState3 = {};
const emptyCandidateChunk = fc.translateGoogleToOpenAIStream(`data: ${JSON.stringify({
    candidates: [{
        finishReason: "STOP",
        content: { parts: [], role: "model" }
    }]
})}`, "gemini-2.5-flash", streamState3);
const parsedEmptyChunks = parseSseChunks(emptyCandidateChunk);
assert.strictEqual(parsedEmptyChunks.length, 2); // Fallback chunk with content="", then final finish_reason chunk
assert.strictEqual(parsedEmptyChunks[0].choices[0].delta.content, "");
assert.strictEqual(parsedEmptyChunks[0].choices[0].delta.role, "assistant");
assert.strictEqual(parsedEmptyChunks[1].choices[0].finish_reason, "stop");

console.log("✔ OpenAI Stream tests passed!");

// ==========================================
// 3. Claude Non-Stream Tests
// ==========================================
console.log("--- 3. Claude Non-Stream Tests ---");

// 3.1 Empty candidate / Safety block in Claude Non-stream
const claudeSafetyResult = fc.convertGoogleToClaudeNonStream(candidateSafetyBlock, "claude-3-5-sonnet");
assert.strictEqual(claudeSafetyResult.type, "message");
assert.strictEqual(claudeSafetyResult.stop_reason, "end_turn");
assert.strictEqual(claudeSafetyResult.content.length, 1);
assert.strictEqual(claudeSafetyResult.content[0].type, "text");
assert.strictEqual(claudeSafetyResult.content[0].text, "[Content omitted due to safety filter]");

// 3.2 Thinking-only in Claude Non-stream
const claudeThinkingResult = fc.convertGoogleToClaudeNonStream(thinkingOnlyCandidate, "claude-3-5-sonnet");
assert.strictEqual(claudeThinkingResult.content.length, 1);
assert.strictEqual(claudeThinkingResult.content[0].type, "thinking");
assert.strictEqual(claudeThinkingResult.content[0].thinking, "Analyzing query...");

console.log("✔ Claude Non-Stream tests passed!");

// ==========================================
// 4. Claude Stream Tests
// ==========================================
console.log("--- 4. Claude Stream Tests ---");

// Helper to parse Claude SSE events string into array of { event, data }
function parseClaudeSseEvents(str) {
    if (!str) return [];
    const blocks = str.split("\n\n").filter(Boolean);
    const events = [];
    for (const block of blocks) {
        const lines = block.split("\n");
        let type = "";
        let data = null;
        for (const line of lines) {
            if (line.startsWith("event: ")) type = line.replace("event: ", "").trim();
            if (line.startsWith("data: ")) data = JSON.parse(line.replace("data: ", "").trim());
        }
        if (data) events.push(data);
    }
    return events;
}

// 4.1 Candidate Safety block in Claude Stream
const claudeStreamState1 = { messageId: "msg_req-c1" };
const claudeSafetyEventsStr = fc.translateGoogleToClaudeStream(`data: ${JSON.stringify(candidateSafetyBlock)}`, "claude-3-5-sonnet", claudeStreamState1);
const claudeSafetyEvents = parseClaudeSseEvents(claudeSafetyEventsStr);
const safetyTypes = claudeSafetyEvents.map(e => e.type);
assert.strictEqual(safetyTypes.includes("content_block_start"), true);
assert.strictEqual(safetyTypes.includes("content_block_delta"), true);
assert.strictEqual(safetyTypes.includes("content_block_stop"), true);
assert.strictEqual(safetyTypes.includes("message_delta"), true);
const msgDeltaEvent = claudeSafetyEvents.find(e => e.type === "message_delta");
assert.strictEqual(msgDeltaEvent.delta.stop_reason, "end_turn");

// 4.2 Empty response in Claude Stream
const claudeStreamState2 = { messageId: "msg_req-c2" };
const claudeEmptyEventsStr = fc.translateGoogleToClaudeStream(`data: ${JSON.stringify({
    candidates: [{
        finishReason: "STOP",
        content: { parts: [], role: "model" }
    }]
})}`, "claude-3-5-sonnet", claudeStreamState2);
const claudeEmptyEvents = parseClaudeSseEvents(claudeEmptyEventsStr);
const emptyTypes = claudeEmptyEvents.map(e => e.type);
assert.strictEqual(emptyTypes.includes("content_block_start"), true);
assert.strictEqual(emptyTypes.includes("content_block_delta"), true);
assert.strictEqual(emptyTypes.includes("content_block_stop"), true);

console.log("✔ Claude Stream tests passed!");

console.log("\nALL FormatConverter tests passed successfully!");
