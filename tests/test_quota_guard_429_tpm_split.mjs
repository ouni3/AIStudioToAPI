/**
 * File: tests/test_quota_guard_429_tpm_split.mjs
 * Description: F2P contract test — 429 rate limit fine-grained split:
 *              - Daily quota exhaustion (per_model_per_user, retry in Xh, limit: 100/50, etc.)
 *                MUST disable the account until daily 15:00 CST refresh;
 *              - Transient TPM/RPM limits (Tokens per minute, Requests per minute, retry in Xs, short Quota exceeded)
 *                MUST NOT disable the account, only apply 60s cooldown and switch account.
 *
 * Author: Nono (moe-code)
 */

import assert from "assert";
import QuotaGuardService from "../src/core/QuotaGuardService.js";
import AuthSwitcher from "../src/auth/AuthSwitcher.js";

console.log("=== Running tests/test_quota_guard_429_tpm_split.mjs ===");

const dummyLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
};

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

function createMockBrowserManager() {
    let switchedIndex = null;
    let currentAuthIndex = 0;
    return {
        get switchedIndex() {
            return switchedIndex;
        },
        get currentAuthIndex() {
            return currentAuthIndex;
        },
        set currentAuthIndex(val) {
            currentAuthIndex = val;
        },
        async preCleanupForSwitch(index) {},
        async switchAccount(index) {
            switchedIndex = index;
            currentAuthIndex = index;
        },
        async rebalanceContextPool() {},
    };
}

// =========================================================================
// 1. QuotaGuardService.isDailyQuotaExhausted unit checks
// =========================================================================
console.log("1. Testing QuotaGuardService.isDailyQuotaExhausted pattern recognition...");

const guard = new QuotaGuardService({
    authSource: createMockAuthSource(),
    logger: dummyLogger,
    dataDir: "/tmp/quota-guard-tpm-test-" + Date.now(),
});

// A. Daily Quota Exhaustion examples (Must return TRUE)
const dailyCase1 = "Quota exceeded for metric: generaterequests_per_model_per_user, limit: 100 on model gemini-2.5-pro. Please retry in 15h58m20s.";
assert.strictEqual(
    guard.isDailyQuotaExhausted(dailyCase1),
    true,
    "Should identify requests_per_model_per_user & retry in 15h as daily quota"
);

const dailyCase2 = "Quota exceeded for metric: generate_content_tokens_per_model_per_user, limit: 11000000 on model gemini-2.5-flash. Please retry in 14h20m.";
assert.strictEqual(
    guard.isDailyQuotaExhausted(dailyCase2),
    true,
    "Should identify generate_content_tokens_per_model_per_user & limit: 11000000 as daily quota"
);

const dailyCase3 = "Google API returned error: 429 Resource has been exhausted (e.g. check quota). Please retry in 2h30m.";
assert.strictEqual(
    guard.isDailyQuotaExhausted(dailyCase3),
    true,
    "Should identify 'Please retry in 2h' as daily quota"
);

const dailyCase4 = "Daily quota exceeded for model gemini-1.5-pro. per-day limit reached.";
assert.strictEqual(
    guard.isDailyQuotaExhausted(dailyCase4),
    true,
    "Should identify daily / per-day as daily quota"
);

const dailyCase5 = "Quota exceeded for metric: per_model_per_user, limit: 50. Please check quota.";
assert.strictEqual(
    guard.isDailyQuotaExhausted(dailyCase5),
    true,
    "Should identify per_model_per_user & limit: 50 as daily quota"
);

// B. Transient Rate Limit examples (Must return FALSE)
const transientCase1 = "Resource has been exhausted (e.g. check quota). Tokens per minute limit exceeded. Please retry in 20s.";
assert.strictEqual(
    guard.isDailyQuotaExhausted(transientCase1),
    false,
    "TPM 'Tokens per minute' & 'retry in 20s' must NOT be classified as daily quota"
);

const transientCase2 = "Requests per minute limit exceeded on model gemini-2.5-flash. Please retry in 45s.";
assert.strictEqual(
    guard.isDailyQuotaExhausted(transientCase2),
    false,
    "RPM 'Requests per minute' & 'retry in 45s' must NOT be classified as daily quota"
);

const transientCase3 = "Google API returned error: 429 Quota exceeded";
assert.strictEqual(
    guard.isDailyQuotaExhausted(transientCase3),
    false,
    "Generic short 'Quota exceeded' without daily markers must default to transient (not daily)"
);

const transientCase4 = "429 RESOURCE_EXHAUSTED: Rate limit exceeded";
assert.strictEqual(
    guard.isDailyQuotaExhausted(transientCase4),
    false,
    "Generic RESOURCE_EXHAUSTED must NOT be classified as daily quota"
);

console.log("✓ QuotaGuardService.isDailyQuotaExhausted unit checks passed.");

// =========================================================================
// 2. AuthSwitcher integration test: Transient 429 (TPM / RPM)
//    Expected: account is NOT disabled, but cooldown is set and switch occurs
// =========================================================================
console.log("2. Testing AuthSwitcher on transient 429 (TPM/RPM)...");

{
    const authSource = createMockAuthSource();
    const browserManager = createMockBrowserManager();
    const quotaGuardService = new QuotaGuardService({
        authSource,
        logger: dummyLogger,
        dataDir: "/tmp/quota-guard-tpm-test-" + Date.now(),
    });

    const switcher = new AuthSwitcher(
        dummyLogger,
        {
            failureThreshold: 1,
            immediateSwitchStatusCodes: [429],
        },
        authSource,
        browserManager
    );
    switcher.setQuotaGuardService(quotaGuardService);

    switcher.currentAuthIndex = 0;

    // Simulate transient TPM 429 error
    await switcher.handleRequestFailureAndSwitch({
        status: 429,
        message: "Resource has been exhausted. Tokens per minute limit exceeded. Please retry in 20s.",
        model: "gemini-2.5-flash",
    });

    // Assertion 1: Account 0 MUST NOT be disabled in authSource
    const account0Disables = authSource.updated.filter(u => u.index === 0 && u.status.disabled === true);
    assert.strictEqual(
        account0Disables.length,
        0,
        "Account 0 MUST NOT be disabled when transient TPM 429 occurs!"
    );

    // Assertion 2: Account 0 MUST have cooldown set in switcher
    assert.strictEqual(
        switcher.isAccountInCooldown(0),
        true,
        "Account 0 MUST be put on cooldown when transient 429 occurs"
    );

    // Assertion 3: Switcher switched to another account
    assert.strictEqual(
        browserManager.switchedIndex !== 0,
        true,
        "Switcher MUST switch to another account"
    );

    console.log("✓ Transient 429 correctly avoided account disable while setting cooldown and switching.");
}

// =========================================================================
// 3. AuthSwitcher integration test: Daily 429 Quota Exhaustion
//    Expected: account IS disabled until 15:00 CST with reason 'quota_exhausted'
// =========================================================================
console.log("3. Testing AuthSwitcher on daily 429 Quota Exhaustion...");

{
    const authSource = createMockAuthSource();
    const browserManager = createMockBrowserManager();
    const quotaGuardService = new QuotaGuardService({
        authSource,
        logger: dummyLogger,
        dataDir: "/tmp/quota-guard-tpm-test-" + Date.now(),
    });

    const switcher = new AuthSwitcher(
        dummyLogger,
        {
            failureThreshold: 1,
            immediateSwitchStatusCodes: [429],
        },
        authSource,
        browserManager
    );
    switcher.setQuotaGuardService(quotaGuardService);

    switcher.currentAuthIndex = 1;

    // Simulate daily quota exhaustion error
    await switcher.handleRequestFailureAndSwitch({
        status: 429,
        message: "Quota exceeded for metric: generaterequests_per_model_per_user, limit: 100 on model gemini-2.5-pro. Please retry in 15h58m20s.",
        model: "gemini-2.5-pro",
    });

    // Assertion 1: Account 1 MUST be disabled in authSource
    const account1Disables = authSource.updated.filter(u => u.index === 1 && u.status.disabled === true);
    assert.strictEqual(
        account1Disables.length > 0,
        true,
        "Account 1 MUST be disabled when daily quota exhaustion 429 occurs!"
    );

    assert.strictEqual(
        account1Disables[0].status.disabledReason,
        "quota_exhausted",
        "disabledReason MUST be 'quota_exhausted'"
    );

    console.log("✓ Daily 429 Quota Exhaustion correctly triggered account disable.");
}

// =========================================================================
// 4. AuthSwitcher Fallback (without quotaGuardService) test
// =========================================================================
console.log("4. Testing AuthSwitcher fallback when quotaGuardService is absent...");

{
    const authSource = createMockAuthSource();
    const browserManager = createMockBrowserManager();

    const switcher = new AuthSwitcher(
        dummyLogger,
        {
            failureThreshold: 1,
            immediateSwitchStatusCodes: [429],
        },
        authSource,
        browserManager
    );

    switcher.currentAuthIndex = 2;

    // A. Transient 429 -> no disable
    await switcher.handleRequestFailureAndSwitch({
        status: 429,
        message: "Google API returned error: 429 Quota exceeded",
    });

    assert.strictEqual(
        authSource.updated.filter(u => u.index === 2 && u.status.disabled === true).length,
        0,
        "Fallback mode: Account 2 MUST NOT be disabled on short generic 429"
    );
    assert.strictEqual(
        switcher.isAccountInCooldown(2),
        true,
        "Fallback mode: Account 2 MUST be on cooldown"
    );

    // B. Daily 429 -> fallback disable
    await switcher.handleRequestFailureAndSwitch({
        status: 429,
        message: "Quota exceeded for metric: per_model_per_user, limit: 100. Please retry in 12h.",
    });

    assert.strictEqual(
        authSource.updated.filter(u => u.index === 2 && u.status.disabled === true).length > 0,
        true,
        "Fallback mode: Account 2 MUST be disabled on daily quota exhaustion"
    );

    console.log("✓ Fallback mode correctly split transient and daily 429.");
}

console.log("=== All 429 TPM/RPM Split contract tests PASSED! ===");
