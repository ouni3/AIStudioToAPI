import assert from "assert";
import QuotaGuardService from "../src/core/QuotaGuardService.js";

console.log("=== Running tests/test_quota_guard_service.mjs ===");

const dummyLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
};

// 1. Test model matching rules
console.log("1. Testing model matching rules...");
const guard = new QuotaGuardService({
    authSource: { initialIndices: [], availableIndices: [] },
    logger: dummyLogger,
});

// Default target: gemini-flash-latest and gemini-3.7-flash series
assert.strictEqual(guard.isTargetModel("gemini-flash-latest"), true);
assert.strictEqual(guard.isTargetModel("gemini-3.7-flash"), true);
assert.strictEqual(guard.isTargetModel("gemini-3.7-flash-thinking"), true);
assert.strictEqual(guard.isTargetModel("gemini-3.7-flash-custom"), true);
assert.strictEqual(guard.isTargetModel("gemini-2.5-pro"), false);
assert.strictEqual(guard.isTargetModel("gemini-pro"), false);
assert.strictEqual(guard.isTargetModel(null), false);

// With TARGET_QUOTA_MODEL override
guard.targetModel = "gemini-flash-latest";
assert.strictEqual(guard.isTargetModel("gemini-flash-latest"), true);
assert.strictEqual(guard.isTargetModel("gemini-3.7-flash"), false);

guard.targetModel = "gemini-3.7-flash";
assert.strictEqual(guard.isTargetModel("gemini-flash-latest"), false);
assert.strictEqual(guard.isTargetModel("gemini-3.7-flash"), true);
assert.strictEqual(guard.isTargetModel("gemini-3.7-flash-thinking"), true);

console.log("✓ Model matching rules verified.");

// 2. Test 15:00 Beijing Time cycle calculation
console.log("2. Testing 15:00 UTC+8 cycle calculation...");
// 10:00 UTC (18:00 Beijing Time) on 2026-10-10 -> cycle started 2026-10-10_15:00_CST
const eveningTime = new Date("2026-10-10T10:00:00Z");
assert.strictEqual(guard._calculateCurrentCycleKey(eveningTime), "2026-10-10_15:00_CST");

// 04:00 UTC (12:00 Beijing Time) on 2026-10-10 -> before 15:00 -> cycle started yesterday 2026-10-09_15:00_CST
const morningTime = new Date("2026-10-10T04:00:00Z");
assert.strictEqual(guard._calculateCurrentCycleKey(morningTime), "2026-10-09_15:00_CST");

// 07:00 UTC (15:00 Beijing Time) on 2026-10-10 -> exactly 15:00 -> cycle started 2026-10-10_15:00_CST
const exactResetTime = new Date("2026-10-10T07:00:00Z");
assert.strictEqual(guard._calculateCurrentCycleKey(exactResetTime), "2026-10-10_15:00_CST");

console.log("✓ 15:00 UTC+8 cycle calculation verified.");

// 3. Test quota accumulation and circuit breaker at 100 requests
console.log("3. Testing quota accumulation and circuit breaker...");
guard.targetModel = null; // restore default
let accountUpdated = null;
let switchTriggered = false;

const mockAuthSource = {
    initialIndices: [0, 1],
    availableIndices: [0, 1],
    updateAccountStatus: async (index, status) => {
        accountUpdated = { index, status };
        return true;
    },
    _getAuthContent: (index) => {
        if (index === 0) {
            return JSON.stringify({
                accountName: "user0@example.com",
                disabled: true,
                disabledReason: "quota_exhausted",
            });
        }
        if (index === 1) {
            return JSON.stringify({
                accountName: "manual_disabled@example.com",
                disabled: true,
                disabledReason: null, // manual disabled, should NOT be restored
            });
        }
        return null;
    },
};

const mockRequestHandler = {
    currentAuthIndex: 0,
    _switchToNextAuth: async () => {
        switchTriggered = true;
        return { success: true, newIndex: 1 };
    },
};

const activeGuard = new QuotaGuardService({
    authSource: mockAuthSource,
    requestHandler: mockRequestHandler,
    logger: dummyLogger,
    dataDir: "/tmp/quota-guard-test-" + Date.now(),
});

// Non-target model should not increment target quota
const nonTargetResult = await activeGuard.recordRequest(0, "gemini-2.5-pro");
assert.strictEqual(nonTargetResult.isQuotaExhausted, false);
assert.strictEqual(activeGuard.getUsage(0), 0);

// Target model increments quota
for (let i = 1; i <= 99; i++) {
    const res = await activeGuard.recordRequest(0, "gemini-flash-latest");
    assert.strictEqual(res.isQuotaExhausted, false);
    assert.strictEqual(res.currentUsage, i);
}
assert.strictEqual(accountUpdated, null);
assert.strictEqual(switchTriggered, false);

// 100th request triggers circuit breaker
const hundredth = await activeGuard.recordRequest(0, "gemini-flash-latest");
assert.strictEqual(hundredth.isQuotaExhausted, true);
assert.strictEqual(hundredth.currentUsage, 100);

assert.ok(accountUpdated, "updateAccountStatus should have been called");
assert.strictEqual(accountUpdated.index, 0);
assert.strictEqual(accountUpdated.status.disabled, true);
assert.strictEqual(accountUpdated.status.disabledReason, "quota_exhausted");
assert.strictEqual(switchTriggered, true, "_switchToNextAuth should be triggered for active account");

console.log("✓ Quota accumulation and circuit breaker triggered properly.");

// 4. Test resetQuotaCycle restoring quota_exhausted accounts only
console.log("4. Testing resetQuotaCycle restoration discrimination...");
const restoredAccounts = [];
mockAuthSource.updateAccountStatus = async (index, status) => {
    restoredAccounts.push({ index, status });
    return true;
};

await activeGuard.resetQuotaCycle();

// Usage should be cleared
assert.strictEqual(activeGuard.getUsage(0), 0);

// Account 0 (quota_exhausted) must be restored
// Account 1 (manually disabled) must NOT be restored
assert.strictEqual(restoredAccounts.length, 1);
assert.strictEqual(restoredAccounts[0].index, 0);
assert.strictEqual(restoredAccounts[0].status.disabled, false);

console.log("✓ Quota reset cleanly restored quota_exhausted accounts while preserving manual disabled accounts.");

// 5. Test RequestHandler integration: only successful requests increment quota, failures/aborts do not
console.log("5. Testing RequestHandler and QuotaGuard collaboration on success vs failure/abort...");
const rhModule = await import("../src/core/RequestHandler.js");
const RequestHandler = rhModule.default;

const recordedCalls = [];
const mockQuotaGuardForRh = {
    recordRequest: async (authIndex, model) => {
        recordedCalls.push({ authIndex, model });
        return { isQuotaExhausted: false, currentUsage: recordedCalls.length };
    },
};

const mockServerSystemForRh = {
    quotaGuardService: mockQuotaGuardForRh,
    usageStatsService: {
        finishRequest: () => ({ finalAuthIndex: 0, model: "gemini-flash-latest" }),
        startRequest: () => {},
        updateRequest: () => {},
    },
    webRoutes: {
        authRoutes: {
            getClientIP: () => "127.0.0.1",
        },
    },
};

const rhInstance = new RequestHandler(
    mockServerSystemForRh,
    { getAuthIndexForRequest: () => 0 },
    dummyLogger,
    {},
    {},
    mockAuthSource
);

// 5a. Successful request (statusCode 200, outcome success) -> MUST increment
recordedCalls.length = 0;
const successRes = { statusCode: 200, __trackedRequestModel: "gemini-flash-latest" };
rhInstance._finalizeTrackedRequest("req-success-1", successRes, { outcome: "success", statusCode: 200, finalAuthIndex: 0 });
await new Promise(resolve => setTimeout(resolve, 10));
assert.strictEqual(recordedCalls.length, 1);
assert.strictEqual(recordedCalls[0].authIndex, 0);
assert.strictEqual(recordedCalls[0].model, "gemini-flash-latest");

// 5b. Client aborted request -> MUST NOT increment
recordedCalls.length = 0;
const abortRes = { statusCode: 200, __usageTrackingClientAborted: true, __trackedRequestModel: "gemini-flash-latest" };
rhInstance._finalizeTrackedRequest("req-abort-1", abortRes, { finalAuthIndex: 0 });
await new Promise(resolve => setTimeout(resolve, 10));
assert.strictEqual(recordedCalls.length, 0, "Aborted request must NOT increment quota");

// 5c. Error response: 400 Bad Request -> MUST NOT increment
recordedCalls.length = 0;
const err400Res = { statusCode: 400, __trackedRequestModel: "gemini-flash-latest" };
rhInstance._finalizeTrackedRequest("req-400-1", err400Res, { finalAuthIndex: 0 });
await new Promise(resolve => setTimeout(resolve, 10));
assert.strictEqual(recordedCalls.length, 0, "400 error must NOT increment quota");

// 5d. Error response: 403 Forbidden / Region -> MUST NOT increment
recordedCalls.length = 0;
const err403Res = { statusCode: 403, __trackedRequestModel: "gemini-flash-latest" };
rhInstance._finalizeTrackedRequest("req-403-1", err403Res, { finalAuthIndex: 0 });
await new Promise(resolve => setTimeout(resolve, 10));
assert.strictEqual(recordedCalls.length, 0, "403 error must NOT increment quota");

// 5e. Error response: 404 Model Not Found -> MUST NOT increment
recordedCalls.length = 0;
const err404Res = { statusCode: 404, __trackedRequestModel: "gemini-flash-latest" };
rhInstance._finalizeTrackedRequest("req-404-1", err404Res, { finalAuthIndex: 0 });
await new Promise(resolve => setTimeout(resolve, 10));
assert.strictEqual(recordedCalls.length, 0, "404 error must NOT increment quota");

// 5f. Error response: 429 Rate Limit -> MUST NOT increment
recordedCalls.length = 0;
const err429Res = { statusCode: 429, __trackedRequestModel: "gemini-flash-latest" };
rhInstance._finalizeTrackedRequest("req-429-1", err429Res, { finalAuthIndex: 0 });
await new Promise(resolve => setTimeout(resolve, 10));
assert.strictEqual(recordedCalls.length, 0, "429 error must NOT increment quota");

// 5g. Error response: 500 / 503 Server Error -> MUST NOT increment
recordedCalls.length = 0;
const err500Res = { statusCode: 500, __trackedRequestModel: "gemini-flash-latest" };
rhInstance._finalizeTrackedRequest("req-500-1", err500Res, { finalAuthIndex: 0 });
await new Promise(resolve => setTimeout(resolve, 10));
assert.strictEqual(recordedCalls.length, 0, "500 error must NOT increment quota");

const err503Res = { statusCode: 503, __trackedRequestModel: "gemini-flash-latest" };
rhInstance._finalizeTrackedRequest("req-503-1", err503Res, { finalAuthIndex: 0 });
await new Promise(resolve => setTimeout(resolve, 10));
assert.strictEqual(recordedCalls.length, 0, "503 error must NOT increment quota");

console.log("✓ RequestHandler quota counting gating on success (and rejection on 4xx/5xx/abort) verified.");
console.log("All QuotaGuardService tests passed successfully!");
