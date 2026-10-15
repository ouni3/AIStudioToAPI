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

// Default target: gemini-flash-latest, gemini-3.8-flash series, and gemini-3.7-flash series
assert.strictEqual(guard.isTargetModel("gemini-flash-latest"), true);
assert.strictEqual(guard.isTargetModel("gemini-3.8-flash"), true);
assert.strictEqual(guard.isTargetModel("gemini-3.8-flash-preview"), true);
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
assert.strictEqual(guard.isTargetModel("gemini-3.8-flash"), false);

guard.targetModel = "gemini-3.8-flash";
assert.strictEqual(guard.isTargetModel("gemini-flash-latest"), false);
assert.strictEqual(guard.isTargetModel("gemini-3.8-flash"), true);
assert.strictEqual(guard.isTargetModel("gemini-3.8-flash-latest"), true);

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

// 3. Test quota accumulation (telemetry only) and handleQuota429 circuit breaker
console.log("3. Testing quota accumulation and handleQuota429 2-hour circuit breaker...");
guard.targetModel = null; // restore default
let accountUpdated = null;
let switchTriggered = false;

const mockAuthSource = {
    initialIndices: [0, 1, 2],
    availableIndices: [0, 1, 2],
    disabledIndices: [],
    disabledReasonMap: new Map(),
    disabledUntilMap: new Map(),
    isDisabled: (index) => mockAuthSource.disabledIndices.includes(index),
    getDisabledReason: (index) => mockAuthSource.disabledReasonMap.get(index) || null,
    getDisabledUntil: (index) => mockAuthSource.disabledUntilMap.get(index) || null,
    updateAccountStatus: async (index, status) => {
        accountUpdated = { index, status };
        if (status.disabled) {
            if (!mockAuthSource.disabledIndices.includes(index)) {
                mockAuthSource.disabledIndices.push(index);
            }
            mockAuthSource.disabledReasonMap.set(index, status.disabledReason || null);
            if (status.disabledUntil) {
                mockAuthSource.disabledUntilMap.set(index, status.disabledUntil);
            }
        } else {
            mockAuthSource.disabledIndices = mockAuthSource.disabledIndices.filter(i => i !== index);
            mockAuthSource.disabledReasonMap.delete(index);
            mockAuthSource.disabledUntilMap.delete(index);
        }
        return true;
    },
    _getAuthContent: (index) => {
        if (index === 0) {
            return JSON.stringify({
                accountName: "user0@example.com",
                disabled: true,
                disabledReason: "quota_exhausted",
                disabledUntil: Date.now() + 7200000,
            });
        }
        if (index === 1) {
            return JSON.stringify({
                accountName: "manual_disabled@example.com",
                disabled: true,
                disabledReason: null, // manual disabled, should NOT be restored
            });
        }
        if (index === 2) {
            return JSON.stringify({
                accountName: "expired_ban@example.com",
                disabled: true,
                disabledReason: "quota_exhausted",
                disabledUntil: Date.now() - 1000, // already expired
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

// Non-target model should not increment target quota telemetry
const nonTargetResult = await activeGuard.recordRequest(0, "gemini-2.5-pro");
assert.strictEqual(nonTargetResult.isQuotaExhausted, false);
assert.strictEqual(activeGuard.getUsage(0), 0);

// Target model increments quota telemetry, but DOES NOT disable account even beyond 100 requests
for (let i = 1; i <= 150; i++) {
    const res = await activeGuard.recordRequest(0, "gemini-flash-latest");
    assert.strictEqual(res.isQuotaExhausted, false, "Usage beyond 100 must NEVER trigger circuit breaker");
    assert.strictEqual(res.currentUsage, i);
}
assert.strictEqual(accountUpdated, null, "100+ requests must not disable account");
assert.strictEqual(switchTriggered, false, "100+ requests must not trigger account switch");

// Upstream 429 received -> handleQuota429 disables account for 2 hours and triggers switch
const beforeBan = Date.now();
const banSuccess = await activeGuard.handleQuota429(0, "gemini-3.8-flash");
assert.strictEqual(banSuccess, true);
assert.ok(accountUpdated, "handleQuota429 must update account status");
assert.strictEqual(accountUpdated.index, 0);
assert.strictEqual(accountUpdated.status.disabled, true);
assert.strictEqual(accountUpdated.status.disabledReason, "quota_exhausted");
assert.ok(accountUpdated.status.disabledUntil >= beforeBan + 7190000, "disabledUntil should be ~2 hours in the future");
assert.strictEqual(switchTriggered, true, "_switchToNextAuth must be triggered for active account upon 429");

console.log("✓ Decommission of 100-limit and new 429 2-hour physical ban verified.");

// 4. Test Channel A (2-hour auto-heal) and Channel B (daily 15:00 CST reset)
console.log("4. Testing Channel A (2-hour ban expiration) and Channel B (15:00 CST reset)...");

// 4a. Channel A: checkAndRestoreExpiredBans()
// Account 2 has an expired ban (disabledUntil in past, quota_exhausted) -> MUST be restored
// Account 0 has unexpired ban (disabledUntil in future) -> MUST NOT be restored
// Account 1 is manually disabled -> MUST NOT be restored
mockAuthSource.disabledIndices = [0, 1, 2];
mockAuthSource.disabledReasonMap.set(0, "quota_exhausted");
mockAuthSource.disabledUntilMap.set(0, Date.now() + 7200000);
mockAuthSource.disabledReasonMap.set(1, null);
mockAuthSource.disabledUntilMap.set(1, null);
mockAuthSource.disabledReasonMap.set(2, "quota_exhausted");
mockAuthSource.disabledUntilMap.set(2, Date.now() - 5000);

const restoredFromExpiry = await activeGuard.checkAndRestoreExpiredBans();
assert.deepStrictEqual(restoredFromExpiry, [2], "Only expired quota_exhausted account 2 should be restored in Channel A");
assert.strictEqual(mockAuthSource.isDisabled(2), false, "Account 2 should be re-enabled");
assert.strictEqual(mockAuthSource.isDisabled(0), true, "Account 0 should remain disabled (unexpired)");
assert.strictEqual(mockAuthSource.isDisabled(1), true, "Account 1 should remain disabled (manual)");

// 4b. Channel B: resetQuotaCycle()
// Should restore ALL quota_exhausted accounts (e.g. Account 0), while strictly leaving manual Account 1 disabled
const restoredInReset = [];
mockAuthSource.updateAccountStatus = async (index, status) => {
    restoredInReset.push({ index, status });
    return true;
};

await activeGuard.resetQuotaCycle();

// Usage should be cleared
assert.strictEqual(activeGuard.getUsage(0), 0);

// Accounts 0 and 2 (quota_exhausted in file content) must be restored, Account 1 (manual disabled) must NOT
const restoredIndices = restoredInReset.map(r => r.index);
assert.ok(restoredIndices.includes(0), "Account 0 must be restored by 15:00 reset");
assert.ok(restoredIndices.includes(2), "Account 2 must be restored by 15:00 reset");
assert.ok(!restoredIndices.includes(1), "Manual disabled Account 1 must NOT be restored by 15:00 reset");

console.log("✓ Channel A (2-hour auto-heal) and Channel B (15:00 CST reset) verified.");

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

// 6. Test AuthSwitcher 429 integration invoking QuotaGuardService.handleQuota429
console.log("6. Testing AuthSwitcher 429 interception and QuotaGuardService 2-hour disable triggering...");
const asModule = await import("../src/auth/AuthSwitcher.js");
const AuthSwitcher = asModule.default;

let qg429CalledWith = null;
const mockQG = {
    handleQuota429: async (authIndex, model) => {
        qg429CalledWith = { authIndex, model };
        return true;
    },
};

const mockBMForSwitcher = {
    currentAuthIndex: 3,
    switchAccount: async () => {},
    preCleanupForSwitch: async () => {},
    rebalanceContextPool: async () => {},
    connectionRegistry: {
        waitForAuthQueuesToDrain: async () => {},
    },
};

const switcherAuthSource = {
    getRotationIndices: () => [3, 4],
    getCanonicalIndex: (idx) => idx,
    initialIndices: [3, 4],
    availableIndices: [3, 4],
    disabledIndices: [],
    updateAccountStatus: async () => true,
};

const testSwitcher = new AuthSwitcher(
    dummyLogger,
    { immediateSwitchStatusCodes: [429], failureThreshold: 3, minSwitchIntervalMs: 0 },
    switcherAuthSource,
    mockBMForSwitcher
);
testSwitcher.setQuotaGuardService(mockQG);

// Simulate 429 error
await testSwitcher.handleRequestFailureAndSwitch({ status: 429, message: "RESOURCE_EXHAUSTED", model: "gemini-3.8-flash" }, null);

assert.ok(qg429CalledWith, "handleQuota429 must be called on 429");
assert.strictEqual(qg429CalledWith.authIndex, 3);
assert.strictEqual(qg429CalledWith.model, "gemini-3.8-flash");

console.log("✓ AuthSwitcher 429 -> QuotaGuardService handleQuota429 integration verified.");
console.log("All QuotaGuardService tests passed successfully!");
