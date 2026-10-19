import assert from "assert";
import RequestHandler from "../src/core/RequestHandler.js";
import ConfigLoader from "../src/utils/ConfigLoader.js";

console.log("=== Running tests: test_upstream_error_codes_failover.mjs ===");

// 1. Test ConfigLoader default immediateSwitchStatusCodes
console.log("--- 1. Testing ConfigLoader default immediateSwitchStatusCodes ---");
const mockLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} };
const configLoader = new ConfigLoader(mockLogger);

// Backup process.env
const originalEnv = { ...process.env };
delete process.env.IMMEDIATE_SWITCH_STATUS_CODES;

const defaultConfig = configLoader.loadConfiguration();
const expectedCodes = [403, 404, 429, 500, 502, 503, 504];

for (const code of expectedCodes) {
    assert.strictEqual(
        defaultConfig.immediateSwitchStatusCodes.includes(code),
        true,
        `Default config must include status code ${code}`
    );
}
assert.deepStrictEqual(
    defaultConfig.immediateSwitchStatusCodes.sort((a, b) => a - b),
    expectedCodes.sort((a, b) => a - b),
    "Default immediateSwitchStatusCodes must exactly match the SR hardened standard"
);
console.log("✔ ConfigLoader default immediateSwitchStatusCodes assertions passed!");

// 2. Test environment variable override compatibility
console.log("--- 2. Testing ConfigLoader environment variable override ---");
process.env.IMMEDIATE_SWITCH_STATUS_CODES = "403, 429, 500";
const customConfig = configLoader.loadConfiguration();
assert.deepStrictEqual(
    customConfig.immediateSwitchStatusCodes,
    [403, 429, 500],
    "IMMEDIATE_SWITCH_STATUS_CODES environment variable should take precedence"
);
console.log("✔ ConfigLoader env override assertions passed!");

// Restore environment
process.env = { ...originalEnv };

// 3. Test RequestHandler._isImmediateSwitchStatus logic
console.log("--- 3. Testing RequestHandler._isImmediateSwitchStatus ---");
const mockServerSystem = { config: defaultConfig };
const rh = new RequestHandler(mockServerSystem, {}, mockLogger, {}, defaultConfig, {});

// All target codes must be recognized as immediate switch status
for (const code of [403, 404, 429, 500, 502, 503, 504]) {
    assert.strictEqual(
        rh._isImmediateSwitchStatus(code, "Upstream error"),
        true,
        `Status ${code} should trigger immediate switch`
    );
    assert.strictEqual(
        rh._isImmediateSwitchStatus(String(code), "Upstream error"),
        true,
        `Status "${code}" (string) should trigger immediate switch`
    );
}

// 400 Bad Request should NOT trigger immediate switch
assert.strictEqual(
    rh._isImmediateSwitchStatus(400, "Bad Request"),
    false,
    "Status 400 should not trigger immediate switch"
);

// 401 Unauthorized should NOT trigger immediate switch (unless configured)
assert.strictEqual(
    rh._isImmediateSwitchStatus(401, "Unauthorized"),
    false,
    "Status 401 should not trigger immediate switch"
);

// Special 403 message check (even if 403 is somehow excluded from config)
const rhWithout403 = new RequestHandler({}, {}, mockLogger, {}, { immediateSwitchStatusCodes: [429, 503] }, {});
assert.strictEqual(
    rhWithout403._isImmediateSwitchStatus(403, "User location is not supported"),
    true,
    "403 with 'not supported' should trigger switch regardless of config list"
);
assert.strictEqual(
    rhWithout403._isImmediateSwitchStatus(403, "PERMISSION_DENIED"),
    true,
    "403 with 'PERMISSION_DENIED' should trigger switch regardless of config list"
);
assert.strictEqual(
    rhWithout403._isImmediateSwitchStatus(403, "Other forbidden reason"),
    false,
    "403 without specific reason should return false if not in immediateSwitchStatusCodes"
);
console.log("✔ RequestHandler._isImmediateSwitchStatus assertions passed!");

// 4. Test cleanPath and _extractModelFromPath with malformed /models/models/ prefix
console.log("--- 4. Testing path normalization with malformed repeated /models/ ---");
const path1 = "/v1beta/models/models/gemini-2.5-flash:generateContent";
assert.strictEqual(
    rh._extractModelFromPath(path1),
    "gemini-2.5-flash",
    "Should extract model correctly despite repeated /models/models/"
);

const path2 = "/v1beta/models/models/models/gemini-2.5-pro:streamGenerateContent";
assert.strictEqual(
    rh._extractModelFromPath(path2),
    "gemini-2.5-pro",
    "Should extract model correctly despite multiple repeated /models/"
);

const proxyReq = rh._buildProxyRequest({
    path: "/proxy/v1beta/models/models/gemini-2.5-flash:generateContent",
    method: "POST",
    body: { contents: [{ parts: [{ text: "hi" }] }] },
}, "req-123");

assert.strictEqual(
    proxyReq.path.includes("/models/models/"),
    false,
    "Clean path should eliminate repeated /models/ prefix"
);
assert.strictEqual(
    proxyReq.path,
    "/v1beta/models/gemini-2.5-flash:generateContent",
    "Clean path should correctly rewrite to single /models/ prefix"
);
console.log("✔ Repeated /models/ path normalization passed!");

// 5. Test countTokens chunk timeout configuration
console.log("--- 5. Testing RequestHandler timeout bindings ---");
assert.strictEqual(typeof rh.timeouts.STREAM_CHUNK, "number", "STREAM_CHUNK timeout must be defined as number");
assert.strictEqual(rh.timeouts.STREAM_CHUNK >= 1000, true, "STREAM_CHUNK timeout must be at least 1s");
console.log(`✔ timeouts.STREAM_CHUNK verified: ${rh.timeouts.STREAM_CHUNK}ms`);

// 6. Test Upstream Google API 400 Error Failover & Client Error Disambiguation
console.log("--- 6. Testing Upstream Google API 400 Error Failover ---");
const upstreamGoogle400Error = {
    status: 400,
    message: "Proxy browser error: Google API returned error: 400 Request contains an invalid argument.",
};
const localClient400Error = {
    status: 400,
    message: "Invalid model name",
};

// Local client error should still be identified as client parameter error
assert.strictEqual(
    rh._isClientParameterError(localClient400Error),
    true,
    "Local client 400 should be classified as client parameter error"
);
assert.strictEqual(
    rh._isImmediateSwitchStatus(400, "Invalid model name"),
    false,
    "Local client 400 should NOT trigger account switch"
);

// Upstream Google API 400 returned via proxy browser relay MUST NOT be classified as client parameter error
assert.strictEqual(
    rh._isClientParameterError(upstreamGoogle400Error),
    false,
    "Upstream Google API 400 must NOT be classified as client parameter error"
);
// Upstream Google API 400 MUST trigger immediate switch
assert.strictEqual(
    rh._isImmediateSwitchStatus(400, upstreamGoogle400Error.message),
    true,
    "Upstream Google API 400 must trigger immediate account switch"
);
console.log("✔ Upstream Google API 400 failover assertions passed!");

// 7. Test Cross-Account Identical Upstream 400 Early Stop Guard
console.log("--- 7. Testing Cross-Account Identical Upstream 400 Early Stop Guard ---");

// 7.1 Threshold constant assertion
assert.strictEqual(
    RequestHandler.CROSS_ACCOUNT_400_EARLY_STOP_THRESHOLD,
    3,
    "CROSS_ACCOUNT_400_EARLY_STOP_THRESHOLD must be defined as 3"
);

// 7.2 Mock RequestHandler for early stop simulation
let currentMockAuth = 0;
let switchCallCount = 0;
let loggedWarnMessages = [];
const customMockLogger = {
    info: () => {},
    warn: (msg) => loggedWarnMessages.push(String(msg)),
    debug: () => {},
    error: () => {},
};

const earlyStopRh = new RequestHandler(mockServerSystem, {}, customMockLogger, {}, defaultConfig, {});
const mockAuthSwitcher = {
    get currentAuthIndex() {
        return currentMockAuth;
    },
    handleRequestFailureAndSwitch: async () => {
        switchCallCount++;
        currentMockAuth++;
        return { success: true };
    },
    isAccountInCooldown: () => false,
};
earlyStopRh.authSwitcher = mockAuthSwitcher;
earlyStopRh._waitForSystemAndConnectionIfBusy = async () => true;

// Scenario A: 3 distinct accounts return identical upstream 400 signature on the same request
const req1Tracker = earlyStopRh._createImmediateSwitchTracker(0);
const identical400Error = {
    status: 400,
    message: "Proxy browser error: Google API returned error: 400 Request contains an invalid argument.",
};

// Attempt 1 on Account 0: should allow switch to Account 1
const resAttempt1 = await earlyStopRh._prepareImmediateStatusRetry(
    identical400Error,
    "req-test-identical-400",
    req1Tracker,
    0
);
assert.strictEqual(resAttempt1, true, "1st 400 failure on account 0 should allow retry switch");
assert.strictEqual(currentMockAuth, 1, "Should have switched to account 1");
assert.strictEqual(switchCallCount, 1, "Switch count should be 1");

// Attempt 2 on Account 1: should allow switch to Account 2
const resAttempt2 = await earlyStopRh._prepareImmediateStatusRetry(
    identical400Error,
    "req-test-identical-400",
    req1Tracker,
    1
);
assert.strictEqual(resAttempt2, true, "2nd 400 failure on account 1 should allow retry switch");
assert.strictEqual(currentMockAuth, 2, "Should have switched to account 2");
assert.strictEqual(switchCallCount, 2, "Switch count should be 2");

// Attempt 3 on Account 2: 3rd distinct account with identical 400 -> EARLY STOP triggered!
const resAttempt3 = await earlyStopRh._prepareImmediateStatusRetry(
    identical400Error,
    "req-test-identical-400",
    req1Tracker,
    2
);
assert.strictEqual(
    resAttempt3,
    false,
    "3rd identical upstream 400 failure across distinct accounts MUST trigger early stop (return false)"
);
assert.strictEqual(
    currentMockAuth,
    2,
    "Account index must remain 2; account 3 must NOT be attempted"
);
assert.strictEqual(
    switchCallCount,
    2,
    "No further account switch must be performed when early stop triggers"
);
assert.strictEqual(
    loggedWarnMessages.some((m) => m.includes("Cross-account identical upstream 400 error guard triggered")),
    true,
    "Explicit WARN log must be recorded when early stop triggers"
);
console.log("✔ Early stop triggered after 3 distinct accounts with identical 400; 4th account was not attempted!");

// Scenario B: Single account 400 self-healing must NOT be hindered
currentMockAuth = 0;
switchCallCount = 0;
const healTracker = earlyStopRh._createImmediateSwitchTracker(0);
const resHeal1 = await earlyStopRh._prepareImmediateStatusRetry(
    identical400Error,
    "req-test-healing",
    healTracker,
    0
);
assert.strictEqual(resHeal1, true, "Single account 400 must switch and allow healing");
assert.strictEqual(switchCallCount, 1, "Switch happened for healing");
console.log("✔ Single account 400 self-healing path preserved!");

// Scenario C: Normalized signature matching (case and whitespace insensitivity)
currentMockAuth = 0;
switchCallCount = 0;
const normTracker = earlyStopRh._createImmediateSwitchTracker(0);
const var1 = {
    status: 400,
    message: "  proxy browser error: google api returned error: 400 request contains an invalid argument.  ",
};
const var2 = {
    status: 400,
    message: "PROXY BROWSER ERROR: GOOGLE API RETURNED ERROR: 400   REQUEST CONTAINS AN INVALID ARGUMENT.",
};
const var3 = {
    status: 400,
    message: "Proxy Browser Error: Google API Returned Error: 400 Request Contains An Invalid Argument.",
};
assert.strictEqual(await earlyStopRh._prepareImmediateStatusRetry(var1, "req-norm", normTracker, 0), true);
assert.strictEqual(await earlyStopRh._prepareImmediateStatusRetry(var2, "req-norm", normTracker, 1), true);
assert.strictEqual(
    await earlyStopRh._prepareImmediateStatusRetry(var3, "req-norm", normTracker, 2),
    false,
    "Whitespace and case variations must normalize to the same signature and trigger early stop"
);
console.log("✔ Signature normalization (case & whitespace invariance) verified!");

console.log("All upstream error codes failover tests passed successfully!");
