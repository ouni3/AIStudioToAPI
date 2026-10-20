/**
 * File: tests/test_quota_guard_429_until_refresh.mjs
 * Description: F2P contract test — on upstream 429 quota exhaustion, the account ban must persist
 *              until the next daily 15:00 CST (UTC+8) quota refresh, replacing the legacy fixed
 *              duration ban (Chairman directive: "账户遇到429错误直接关闭,直到刷新时间").
 *
 * Author: Nono (moe-code)
 */

import assert from "assert";
import QuotaGuardService from "../src/core/QuotaGuardService.js";
import AuthSwitcher from "../src/auth/AuthSwitcher.js";

console.log("=== Running tests/test_quota_guard_429_until_refresh.mjs ===");

const dummyLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
};

function createTempDataDir() {
    return "/tmp/quota-guard-429-test-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function createMockAuthSource() {
    const updated = [];
    return {
        updated,
        initialIndices: [0, 1, 2],
        availableIndices: [0, 1, 2],
        async updateAccountStatus(index, status) {
            updated.push({ index, status });
            return true;
        },
    };
}

// Independent oracle: next daily 15:00 CST (UTC+8) as absolute UTC ms timestamp (diff >= 1000ms).
function expectedNextResetCst(nowDate) {
    const utcTime = nowDate.getTime() + nowDate.getTimezoneOffset() * 60000;
    const beijing = new Date(utcTime + 8 * 3600 * 1000);
    const target = new Date(beijing);
    if (beijing.getHours() >= 15) {
        target.setDate(target.getDate() + 1);
    }
    target.setHours(15, 0, 0, 0);
    return nowDate.getTime() + Math.max(target.getTime() - beijing.getTime(), 1000);
}

// 1. Deterministic scenario coverage for getNextResetTimestamp (fixed UTC inputs, machine-tz independent)
console.log("1. Testing getNextResetTimestamp scenario coverage (before/after 15:00 CST)...");

const guard = new QuotaGuardService({
    authSource: createMockAuthSource(),
    logger: dummyLogger,
    dataDir: createTempDataDir(),
});

// Scenario A: 2026-10-20T06:00:00Z == 14:00 CST (BEFORE 15:00) -> today 15:00 CST (07:00Z)
const beforeFifteen = new Date("2026-10-20T06:00:00.000Z");
assert.strictEqual(
    guard.getNextResetTimestamp(beforeFifteen),
    Date.parse("2026-10-20T07:00:00.000Z"),
    "Before 15:00 CST, next reset must be TODAY 15:00 CST as an absolute UTC timestamp"
);

// Scenario B: 2026-10-20T08:00:00Z == 16:00 CST (AFTER 15:00) -> tomorrow 15:00 CST (next-day 07:00Z)
const afterFifteen = new Date("2026-10-20T08:00:00.000Z");
assert.strictEqual(
    guard.getNextResetTimestamp(afterFifteen),
    Date.parse("2026-10-21T07:00:00.000Z"),
    "After 15:00 CST, next reset must be TOMORROW 15:00 CST as an absolute UTC timestamp"
);

// Boundary: exactly 15:00:00.000 CST counts as >= 15 -> tomorrow 15:00 CST
const exactlyFifteen = new Date("2026-10-20T07:00:00.000Z");
assert.strictEqual(
    guard.getNextResetTimestamp(exactlyFifteen),
    Date.parse("2026-10-21T07:00:00.000Z"),
    "At exactly 15:00 CST, next reset must be tomorrow 15:00 CST"
);

// Floor: diff < 1s (14:59:59.500 CST) must still return now + 1000ms
const almostFifteen = new Date("2026-10-20T06:59:59.500Z");
assert.strictEqual(
    guard.getNextResetTimestamp(almostFifteen),
    almostFifteen.getTime() + 1000,
    "Returned absolute timestamp must satisfy now + diff with a diff >= 1000ms floor"
);

console.log("✓ getNextResetTimestamp scenario coverage verified.");

// 2. handleQuota429 must disable the account until the next 15:00 CST reset (real clock, oracle-checked)
console.log("2. Testing handleQuota429 disables account until next 15:00 CST reset...");

const authSource = createMockAuthSource();
const guard429 = new QuotaGuardService({
    authSource,
    logger: dummyLogger,
    dataDir: createTempDataDir(),
});

const handleResult = await guard429.handleQuota429(1, "gemini-flash-latest");
assert.strictEqual(handleResult, true);
assert.strictEqual(authSource.updated.length, 1, "handleQuota429 must update account status exactly once");

const status = authSource.updated[0].status;
assert.strictEqual(status.disabled, true);
assert.strictEqual(status.disabledReason, "quota_exhausted");

const expected429 = expectedNextResetCst(new Date());
assert.ok(
    Math.abs(status.disabledUntil - expected429) < 5000,
    `disabledUntil (${new Date(status.disabledUntil).toISOString()}) must equal next 15:00 CST reset (${new Date(expected429).toISOString()}) ±5s`
);
assert.ok(status.disabledUntil > Date.now(), "disabledUntil must be in the future");

console.log("✓ handleQuota429 until-refresh ban verified.");

// 3. _triggerQuotaExhausted fallback (disabledUntil omitted) must use the next 15:00 CST reset
console.log("3. Testing _triggerQuotaExhausted fallback uses next 15:00 CST reset...");

const authSourceFallback = createMockAuthSource();
const guardFallback = new QuotaGuardService({
    authSource: authSourceFallback,
    logger: dummyLogger,
    dataDir: createTempDataDir(),
});

await guardFallback._triggerQuotaExhausted(2, null);
assert.strictEqual(authSourceFallback.updated.length, 1);

const fallbackStatus = authSourceFallback.updated[0].status;
assert.strictEqual(fallbackStatus.disabled, true);
assert.strictEqual(fallbackStatus.disabledReason, "quota_exhausted");

const expectedFallback = expectedNextResetCst(new Date());
assert.ok(
    Math.abs(fallbackStatus.disabledUntil - expectedFallback) < 5000,
    "Fallback disabledUntil must equal next 15:00 CST reset ±5s"
);

console.log("✓ _triggerQuotaExhausted fallback until-refresh verified.");

// 4. AuthSwitcher 429 fallback (no quotaGuardService attached) must compute next 15:00 CST reset
console.log("4. Testing AuthSwitcher 429 fallback computes next 15:00 CST reset...");

const switcherAuthSource = createMockAuthSource();
const switcher = new AuthSwitcher(
    dummyLogger,
    { failureThreshold: 0 },
    switcherAuthSource,
    { currentAuthIndex: 3 }
);

await switcher.handleRequestFailureAndSwitch({ status: 429, model: "gemini-3.8-flash" }, null);
assert.strictEqual(
    switcherAuthSource.updated.length,
    1,
    "429 without quotaGuardService must fallback-disable the failing account"
);

const switcherStatus = switcherAuthSource.updated[0].status;
assert.strictEqual(switcherStatus.disabled, true);
assert.strictEqual(switcherStatus.disabledReason, "quota_exhausted");

const expectedSwitcher = expectedNextResetCst(new Date());
assert.ok(
    Math.abs(switcherStatus.disabledUntil - expectedSwitcher) < 5000,
    `AuthSwitcher fallback disabledUntil (${new Date(switcherStatus.disabledUntil).toISOString()}) must equal next 15:00 CST reset ±5s`
);

console.log("✓ AuthSwitcher 429 fallback until-refresh verified.");

// 5. AuthSwitcher must delegate 429 handling to QuotaGuardService when attached
console.log("5. Testing AuthSwitcher delegates 429 to QuotaGuardService when attached...");

const delegationAuthSource = createMockAuthSource();
const switcher2 = new AuthSwitcher(
    dummyLogger,
    { failureThreshold: 0 },
    delegationAuthSource,
    { currentAuthIndex: 5 }
);

let delegatedCall = null;
switcher2.quotaGuardService = {
    async handleQuota429(index, model) {
        delegatedCall = { index, model };
    },
};

await switcher2.handleRequestFailureAndSwitch({ status: 429, model: "gemini-flash-latest" }, null);
assert.deepStrictEqual(delegatedCall, { index: 5, model: "gemini-flash-latest" });
assert.strictEqual(
    delegationAuthSource.updated.length,
    0,
    "Must NOT fallback-disable directly when quotaGuardService is attached"
);

console.log("✓ AuthSwitcher delegation verified.");

console.log("=== ALL tests/test_quota_guard_429_until_refresh.mjs PASSED ===");
