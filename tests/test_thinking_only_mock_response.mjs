import assert from "assert";
import FormatConverter from "../src/core/FormatConverter.js";

console.log("=== Testing Thinking-Only Mock Response Scenarios ===");

const mockLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} };
const fc = new FormatConverter(mockLogger, {});

// Helper to parse SSE stream chunks
function parseSseChunks(str) {
    if (!str) return [];
    return str
        .split("\n\n")
        .filter(s => s.startsWith("data: "))
        .map(s => JSON.parse(s.replace(/^data:\s*/, "")));
}

// Helper to parse Claude SSE events
function parseClaudeSseEvents(str) {
    if (!str) return [];
    const blocks = str.split("\n\n").filter(Boolean);
    const events = [];
    for (const block of blocks) {
        const lines = block.split("\n");
        let data = null;
        for (const line of lines) {
            if (line.startsWith("data: ")) data = JSON.parse(line.replace("data: ", "").trim());
        }
        if (data) events.push(data);
    }
    return events;
}

// ==========================================
// 1. OpenAI Non-Stream (Thinking-Only vs Normal)
// ==========================================
console.log("--- 1. OpenAI Non-Stream Tests ---");

// 1.1 Pure thinking candidate
const pureThinkingResponse = {
    candidates: [{
        finishReason: "STOP",
        content: {
            parts: [{ text: "Step 1: Calculate result... Done.", thought: true }],
            role: "model"
        }
    }]
};
const resOpenAiNonStream = fc.convertGoogleToOpenAINonStream(pureThinkingResponse, "gemini-2.5-flash");
assert.strictEqual(resOpenAiNonStream.choices[0].message.role, "assistant");
assert.strictEqual(resOpenAiNonStream.choices[0].message.reasoning_content, "Step 1: Calculate result... Done.");
assert.strictEqual(resOpenAiNonStream.choices[0].message.content, FormatConverter.MOCK_EMPTY_THINKING_RESPONSE);
assert.strictEqual(resOpenAiNonStream.choices[0].finish_reason, "stop");

// 1.2 Normal candidate with both thinking and text
const normalThinkingResponse = {
    candidates: [{
        finishReason: "STOP",
        content: {
            parts: [
                { text: "Thinking process...", thought: true },
                { text: "Here is the final answer." }
            ],
            role: "model"
        }
    }]
};
const resOpenAiNormal = fc.convertGoogleToOpenAINonStream(normalThinkingResponse, "gemini-2.5-flash");
assert.strictEqual(resOpenAiNormal.choices[0].message.reasoning_content, "Thinking process...");
assert.strictEqual(resOpenAiNormal.choices[0].message.content, "Here is the final answer.");

console.log("✔ OpenAI Non-Stream tests passed!");

// ==========================================
// 2. OpenAI Stream (Thinking-Only vs Normal)
// ==========================================
console.log("--- 2. OpenAI Stream Tests ---");

// 2.1 Pure thinking stream chunks
const streamStateOpenAI = {};
// Chunk 1: Thinking part
const streamChunk1 = fc.translateGoogleToOpenAIStream(`data: ${JSON.stringify({
    candidates: [{
        content: {
            parts: [{ text: "Let me think...", thought: true }],
            role: "model"
        }
    }]
})}`, "gemini-2.5-flash", streamStateOpenAI);
const parsedChunks1 = parseSseChunks(streamChunk1);
assert.strictEqual(parsedChunks1.length, 1);
assert.strictEqual(parsedChunks1[0].choices[0].delta.reasoning_content, "Let me think...");

// Chunk 2: Finish chunk without text parts
const streamChunk2 = fc.translateGoogleToOpenAIStream(`data: ${JSON.stringify({
    candidates: [{
        finishReason: "STOP"
    }]
})}`, "gemini-2.5-flash", streamStateOpenAI);
const parsedChunks2 = parseSseChunks(streamChunk2);
// Should send fallback delta with Mock response, followed by final finish_reason chunk
assert.strictEqual(parsedChunks2.length, 2);
assert.strictEqual(parsedChunks2[0].choices[0].delta.content, FormatConverter.MOCK_EMPTY_THINKING_RESPONSE);
assert.strictEqual(parsedChunks2[1].choices[0].finish_reason, "stop");

console.log("✔ OpenAI Stream tests passed!");

// ==========================================
// 3. Claude Non-Stream (Thinking-Only vs Normal)
// ==========================================
console.log("--- 3. Claude Non-Stream Tests ---");

const resClaudeThinking = fc.convertGoogleToClaudeNonStream(pureThinkingResponse, "claude-3-5-sonnet");
assert.strictEqual(resClaudeThinking.content.length, 2);
assert.strictEqual(resClaudeThinking.content[0].type, "thinking");
assert.strictEqual(resClaudeThinking.content[0].thinking, "Step 1: Calculate result... Done.");
assert.strictEqual(resClaudeThinking.content[1].type, "text");
assert.strictEqual(resClaudeThinking.content[1].text, FormatConverter.MOCK_EMPTY_THINKING_RESPONSE);

const resClaudeNormal = fc.convertGoogleToClaudeNonStream(normalThinkingResponse, "claude-3-5-sonnet");
assert.strictEqual(resClaudeNormal.content.length, 2);
assert.strictEqual(resClaudeNormal.content[0].type, "thinking");
assert.strictEqual(resClaudeNormal.content[1].type, "text");
assert.strictEqual(resClaudeNormal.content[1].text, "Here is the final answer.");

console.log("✔ Claude Non-Stream tests passed!");

// ==========================================
// 4. Claude Stream (Thinking-Only vs Normal)
// ==========================================
console.log("--- 4. Claude Stream Tests ---");

const streamStateClaude = { messageId: "msg_thinking_stream" };
// Chunk 1: Thinking part
const claudeChunk1 = fc.translateGoogleToClaudeStream(`data: ${JSON.stringify({
    candidates: [{
        content: {
            parts: [{ text: "Claude thinking...", thought: true }],
            role: "model"
        }
    }]
})}`, "claude-3-5-sonnet", streamStateClaude);
const claudeEvents1 = parseClaudeSseEvents(claudeChunk1);
assert.strictEqual(claudeEvents1.some(e => e.type === "content_block_start" && e.content_block?.type === "thinking"), true);
assert.strictEqual(claudeEvents1.some(e => e.type === "content_block_delta" && e.delta?.thinking === "Claude thinking..."), true);

// Chunk 2: Finish without text block
const claudeChunk2 = fc.translateGoogleToClaudeStream(`data: ${JSON.stringify({
    candidates: [{
        finishReason: "STOP"
    }]
})}`, "claude-3-5-sonnet", streamStateClaude);
const claudeEvents2 = parseClaudeSseEvents(claudeChunk2);
// Must emit content_block_start/delta for Mock text, then message_delta and message_stop
const mockDelta = claudeEvents2.find(e => e.type === "content_block_delta" && e.delta?.type === "text_delta");
assert.ok(mockDelta, "Should emit mock text delta");
assert.strictEqual(mockDelta.delta.text, FormatConverter.MOCK_EMPTY_THINKING_RESPONSE);

console.log("✔ Claude Stream tests passed!");

// ==========================================
// 5. Response API Non-Stream & Stream (Thinking-Only)
// ==========================================
console.log("--- 5. Response API Tests ---");

// Non-Stream
const resResponseApi = fc.convertGoogleToResponseAPINonStream(pureThinkingResponse, "gemini-2.5-flash");
const messageItem = resResponseApi.output.find(item => item.type === "message");
assert.ok(messageItem, "Should have message item in output");
assert.strictEqual(messageItem.content[0].text, FormatConverter.MOCK_EMPTY_THINKING_RESPONSE);

// Stream
const streamStateResp = {};
fc.translateGoogleToResponseAPIStream(`data: ${JSON.stringify({
    candidates: [{
        content: {
            parts: [{ text: "Deep reasoning...", thought: true }],
            role: "model"
        }
    }]
})}`, "gemini-2.5-flash", streamStateResp);

const respFinishEventsStr = fc.translateGoogleToResponseAPIStream(`data: ${JSON.stringify({
    candidates: [{
        finishReason: "STOP"
    }]
})}`, "gemini-2.5-flash", streamStateResp);
assert.ok(respFinishEventsStr.includes(FormatConverter.MOCK_EMPTY_THINKING_RESPONSE), "Stream should contain Mock response text");

console.log("✔ Response API tests passed!");

console.log("\n✅ ALL Thinking-Only Mock Response Tests Passed Successfully!");
