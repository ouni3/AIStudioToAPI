import assert from "assert";
import FormatConverter from "../src/core/FormatConverter.js";
import RequestHandler from "../src/core/RequestHandler.js";

console.log("=== Running tests/test_model_dash_sanitization.mjs ===");

// 1. FormatConverter.isValidModelName tests
console.log("--- 1. Testing FormatConverter.isValidModelName ---");
assert.strictEqual(FormatConverter.isValidModelName("-"), false, "Single dash must be invalid");
assert.strictEqual(FormatConverter.isValidModelName("--"), false, "Double dash must be invalid");
assert.strictEqual(FormatConverter.isValidModelName("---"), false, "Triple dash must be invalid");
assert.strictEqual(FormatConverter.isValidModelName(""), false, "Empty string must be invalid");
assert.strictEqual(FormatConverter.isValidModelName("   "), false, "Whitespace must be invalid");
assert.strictEqual(FormatConverter.isValidModelName(null), false, "null must be invalid");
assert.strictEqual(FormatConverter.isValidModelName(undefined), false, "undefined must be invalid");
assert.strictEqual(FormatConverter.isValidModelName("undefined"), false, "literal undefined must be invalid");
assert.strictEqual(FormatConverter.isValidModelName("null"), false, "literal null must be invalid");
assert.strictEqual(FormatConverter.isValidModelName("gemini-2.5-flash"), true, "Valid model must pass");
assert.strictEqual(FormatConverter.isValidModelName("gpt-4o"), true, "Valid model must pass");
assert.strictEqual(FormatConverter.isValidModelName("claude-3-5-sonnet"), true, "Valid model must pass");

// 2. Suffix stripping with malformed/dash model names
console.log("--- 2. Testing Suffix Stripping with malformed / dash prefix ---");

// 2.1 parseModelWebSearchSuffix
const searchRes1 = FormatConverter.parseModelWebSearchSuffix("-search");
assert.strictEqual(searchRes1.forceWebSearch, false, "No base before -search, match is null");
assert.strictEqual(searchRes1.cleanModelName, "-search", "Original modelName preserved");

const searchRes2 = FormatConverter.parseModelWebSearchSuffix("--search");
assert.strictEqual(searchRes2.forceWebSearch, true);
assert.strictEqual(searchRes2.cleanModelName, "--search", "If stripping leads to invalid model '-', should fallback to original modelName");

const searchRes3 = FormatConverter.parseModelWebSearchSuffix("gemini-2.5-flash-search");
assert.strictEqual(searchRes3.forceWebSearch, true);
assert.strictEqual(searchRes3.cleanModelName, "gemini-2.5-flash", "Valid model should have suffix stripped");

// 2.2 parseModelBuiltInToolSuffixes
const toolRes1 = FormatConverter.parseModelBuiltInToolSuffixes("--code");
assert.strictEqual(toolRes1.cleanModelName, "--code", "Malformed base should not strip into invalid model");

const toolRes2 = FormatConverter.parseModelBuiltInToolSuffixes("gemini-2.5-flash-search-code");
assert.strictEqual(toolRes2.forceWebSearch, true);
assert.strictEqual(toolRes2.forceCodeExecution, true);
assert.strictEqual(toolRes2.cleanModelName, "gemini-2.5-flash");

// 2.3 parseModelStreamingModeSuffix
const streamRes1 = FormatConverter.parseModelStreamingModeSuffix("--real");
assert.strictEqual(streamRes1.streamingMode, "real");
assert.strictEqual(streamRes1.cleanModelName, "--real", "Malformed base should fallback to original modelName");

const streamRes2 = FormatConverter.parseModelStreamingModeSuffix("--fake");
assert.strictEqual(streamRes2.streamingMode, "fake");
assert.strictEqual(streamRes2.cleanModelName, "--fake", "Malformed base should fallback to original modelName");

const streamRes3 = FormatConverter.parseModelStreamingModeSuffix("gemini-2.5-flash-real");
assert.strictEqual(streamRes3.streamingMode, "real");
assert.strictEqual(streamRes3.cleanModelName, "gemini-2.5-flash");

// 2.4 parseModelThinkingLevel
const thinkRes1 = FormatConverter.parseModelThinkingLevel("-high");
assert.strictEqual(thinkRes1.cleanModelName, "-high", "Malformed base should fallback to original modelName");

const thinkRes2 = FormatConverter.parseModelThinkingLevel("-(high)");
assert.strictEqual(thinkRes2.cleanModelName, "-(high)", "Malformed base should fallback to original modelName");

const thinkRes3 = FormatConverter.parseModelThinkingLevel("gemini-3-flash-preview-high");
assert.strictEqual(thinkRes3.thinkingLevel, "HIGH");
assert.strictEqual(thinkRes3.cleanModelName, "gemini-3-flash-preview");

// 3. RequestHandler: 404 Model Not Found does NOT trigger immediate switch
console.log("--- 3. Testing RequestHandler 404 Model Not Found Account Switch Prevention ---");

const mockLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} };
let switchCalledCount = 0;
const mockAuthSwitcher = {
    isSystemBusy: false,
    failureCount: 0,
    async handleRequestFailureAndSwitch() {
        switchCalledCount++;
    },
    async switchToNextAuth() {
        switchCalledCount++;
        return { success: true, newIndex: 1 };
    }
};

const mockConnectionRegistry = {
    getAuthIndexForRequest: () => 0,
    getConnectionByAuth: () => null,
    createMessageQueue: () => mockMessageQueue,
    cleanupRequest: () => {}
};

const rh = new RequestHandler(
    {},
    mockConnectionRegistry,
    mockLogger,
    {},
    { immediateSwitchStatusCodes: [403, 404, 429, 500, 502, 503, 504], maxRetries: 3 },
    {}
);
rh.authSwitcher = mockAuthSwitcher;
rh._forwardRequest = () => {};

// 3.1 Verify _isModelNotFoundError detection
const modelNotFoundPayload = {
    status: 404,
    message: "models/- is not found for API version v1beta"
};
assert.strictEqual(rh._isModelNotFoundError(modelNotFoundPayload), true, "Should identify model not found message");

// 3.2 Non-stream execute with retries simulation
let fakeQueueClosed = false;
const mockMessageQueue = {
    async dequeue() {
        return {
            event_type: "error",
            status: 404,
            message: "models/- is not found for API version v1beta"
        };
    },
    close() {
        fakeQueueClosed = true;
    }
};

const proxyRequest = {
    request_id: "req_test_123",
    path: "/v1beta/models/-:generateContent",
    is_generative: true,
    streaming_mode: "fake"
};

// Test _executeRequestWithRetries with 404 Model Not Found
switchCalledCount = 0;
const retryResult = await rh._executeRequestWithRetries(proxyRequest, mockMessageQueue);
assert.strictEqual(retryResult.success, false);
assert.strictEqual(retryResult.error.skipAccountSwitch, true, "Should set skipAccountSwitch=true");
assert.strictEqual(switchCalledCount, 0, "Should NOT trigger handleRequestFailureAndSwitch during retries");

// 3.3 Test _handleNonStreamResponse with 404 Model Not Found
let sentErrorStatus = null;
let sentErrorMessage = null;
const mockRes = {
    headersSent: false,
    __proxyApiFormat: "gemini",
    status(code) {
        sentErrorStatus = code;
        return this;
    },
    type() {
        return this;
    },
    send(body) {
        sentErrorMessage = body;
        return this;
    },
    json(obj) {
        sentErrorMessage = obj;
        return this;
    }
};

switchCalledCount = 0;
await rh._handleNonStreamResponse(proxyRequest, mockMessageQueue, {}, mockRes);
assert.strictEqual(switchCalledCount, 0, "Account switch must be 0 (no avalanche switch on 404 Model Not Found)");
assert.strictEqual(sentErrorStatus, 404, "Client should receive 404 error directly");

console.log("✔ All dash sanitization and 404 model not found tests passed successfully!");
