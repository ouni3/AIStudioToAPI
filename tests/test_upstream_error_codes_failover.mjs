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

console.log("All upstream error codes failover tests passed successfully!");
