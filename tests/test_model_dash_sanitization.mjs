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

const ambiguousServicePayload = {
    status: 404,
    message: "Proxy browser error: Google API returned error: 404 NOT_FOUND {\"error\":{\"code\":404,\"message\":\"Ambiguous request for service '' and method '/GenerativeService.StreamGenerateContent'.  Please use fully qualified (unique) service and method names to call this method.\",\"status\":\"NOT_FOUND\"}}"
};
assert.strictEqual(rh._isModelNotFoundError(ambiguousServicePayload), true, "Should identify Ambiguous request for service error as model/service not found");

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

// 4. Test 400 Client Error Isolation & Account Cooldown & Switch Debounce
console.log("--- 4. Testing 400 Client Error Isolation & Account Cooldown & Switch Debounce ---");

import AuthSwitcher from "../src/auth/AuthSwitcher.js";

const mockAuthSource = {
    availableIndices: [0, 1, 2],
    getRotationIndices: () => [0, 1, 2],
    getCanonicalIndex: idx => idx,
};
const mockBrowserManager = {
    currentAuthIndex: 0,
    launchOrSwitchContext: async () => {},
    switchAccount: async idx => {
        mockBrowserManager.currentAuthIndex = idx;
    },
    preCleanupForSwitch: async () => {},
    rebalanceContextPool: async () => {},
    connectionRegistry: {
        waitForAuthQueuesToDrain: async () => {},
    },
};

const switcher = new AuthSwitcher(
    mockLogger,
    { failureThreshold: 3, minSwitchIntervalMs: 5000, accountCooldownMs: 60000, immediateSwitchStatusCodes: [403, 404, 429, 500, 502, 503, 504] },
    mockAuthSource,
    mockBrowserManager
);

// 4.1 400 Bad Request isolation: failureCount does NOT increase and does NOT trigger switch
assert.strictEqual(switcher.failureCount, 0);
await switcher.handleRequestFailureAndSwitch({ status: 400, message: "Invalid argument: contents is required" }, null);
assert.strictEqual(switcher.failureCount, 0, "400 error should not increment failureCount");
await switcher.handleRequestFailureAndSwitch({ status: 422, message: "Unprocessable Entity" }, null);
assert.strictEqual(switcher.failureCount, 0, "422 error should not increment failureCount");

// 4.2 Debounce test
switcher.lastSwitchTimestamp = Date.now();
const debounceResult = await switcher.switchToNextAuth();
assert.strictEqual(debounceResult.success, false, "Switch should be debounced within minSwitchIntervalMs");
assert.strictEqual(debounceResult.reason.includes("debounced"), true);

// 4.3 Cooldown test
switcher.lastSwitchTimestamp = 0; // bypass debounce
assert.strictEqual(switcher.isAccountInCooldown(1), false);
switcher.setAccountCooldown(1, 60000);
assert.strictEqual(switcher.isAccountInCooldown(1), true);
assert.strictEqual(switcher.getAccountRemainingCooldown(1) > 0, true);

// Cooldown filtering: Available accounts are [0, 1, 2]. Current is 0. 1 is in cooldown.
// switchToNextAuth should pick 2 (ready) over 1 (in cooldown)
const switchRes = await switcher.switchToNextAuth();
assert.strictEqual(switchRes.success, true);
assert.strictEqual(switchRes.newIndex, 2, "Should switch to account #2 because account #1 is in cooldown");

// Clear cooldown
switcher.clearAccountCooldown(1);
assert.strictEqual(switcher.isAccountInCooldown(1), false);

console.log("✔ 400 Client error isolation, cooldown, and debounce assertions passed!");

console.log("✔ All dash sanitization and 404 model not found tests passed successfully!");
