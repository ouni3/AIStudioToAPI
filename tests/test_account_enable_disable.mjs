import assert from "assert";
import AuthSource from "../src/auth/AuthSource.js";
import AuthSwitcher from "../src/auth/AuthSwitcher.js";

console.log("=== Running tests/test_account_enable_disable.mjs ===");

const dummyLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
};

// 1. Method signatures and basic backward compatibility check
const baseAuthSource = new AuthSource(dummyLogger);
assert.strictEqual(typeof baseAuthSource.isDisabled, "function", "isDisabled should be a function");
assert.strictEqual(typeof baseAuthSource.getAvailableIndices, "function", "getAvailableIndices should be a function");
assert.strictEqual(typeof baseAuthSource.updateAccountStatus, "function", "updateAccountStatus should be a function");
assert.ok(Array.isArray(baseAuthSource.disabledIndices), "disabledIndices should be an array");
assert.ok(Array.isArray(baseAuthSource.getAvailableIndices()), "getAvailableIndices() should return array");
console.log("✓ 1. Method signatures and initial structures verified.");

// 2. Test AuthSource behavior with simulated multi-account in-memory data source
console.log("✓ 2. Testing AuthSource behavior with simulated multi-account in-memory source...");

const mockAccounts = new Map([
    [0, { accountName: "acc0@example.com" }],
    [1, { accountName: "acc1@example.com" }],
    [2, { accountName: "acc2@example.com" }],
]);

const testAuthSource = new AuthSource(dummyLogger);

// Setup pure in-memory mock to avoid touching configs/auth on disk
testAuthSource._discoverAvailableIndices = () => {
    testAuthSource.initialIndices = Array.from(mockAccounts.keys()).sort((a, b) => a - b);
};
testAuthSource._getAuthContent = (index) => {
    const acc = mockAccounts.get(index);
    return acc ? JSON.stringify(acc) : null;
};

// Load initial state
testAuthSource._discoverAvailableIndices();
testAuthSource._preValidateAndFilter();

// Assert default state: all accounts 0, 1, 2 participate in rotation and available list
assert.deepStrictEqual(testAuthSource.availableIndices, [0, 1, 2], "All accounts should be available initially");
assert.deepStrictEqual(testAuthSource.getRotationIndices(), [0, 1, 2], "Default state should have [0, 1, 2] in rotation");
assert.deepStrictEqual(testAuthSource.getAvailableIndices(), [0, 1, 2], "Default state should have [0, 1, 2] in available indices");
assert.strictEqual(testAuthSource.isDisabled(0), false, "Account 0 should not be disabled by default");
assert.strictEqual(testAuthSource.isDisabled(1), false, "Account 1 should not be disabled by default");
assert.strictEqual(testAuthSource.isDisabled(2), false, "Account 2 should not be disabled by default");
console.log("   • Default state: accounts [0, 1, 2] participate in rotation.");

// Mark account 1 as disabled in the mock data source
mockAccounts.set(1, { accountName: "acc1@example.com", disabled: true });
testAuthSource._preValidateAndFilter();

// Assertions after disabling account 1:
assert.strictEqual(testAuthSource.isDisabled(1), true, "isDisabled(1) should return true");
assert.strictEqual(testAuthSource.isDisabled(0), false, "isDisabled(0) should return false");
assert.strictEqual(testAuthSource.isDisabled(2), false, "isDisabled(2) should return false");

assert.deepStrictEqual(testAuthSource.getRotationIndices(), [0, 2], "getRotationIndices() must strictly exclude disabled account 1");
assert.deepStrictEqual(testAuthSource.getAvailableIndices(), [0, 2], "getAvailableIndices() must strictly exclude disabled account 1");
assert.ok(!testAuthSource.getRotationIndices().includes(1), "Index 1 must not be in rotationIndices");
assert.ok(!testAuthSource.getAvailableIndices().includes(1), "Index 1 must not be in availableIndices");
console.log("   • Disabled state: account 1 strictly excluded from rotation and available indices; isDisabled(1) === true.");

// 3. Test AuthSwitcher behavior with disabled account
console.log("✓ 3. Testing AuthSwitcher rejection on disabled account...");

const mockBrowserManager = {
    currentAuthIndex: 0,
    switchAccount: async (idx) => {
        mockBrowserManager.currentAuthIndex = idx;
    },
    preCleanupForSwitch: async () => {},
    rebalanceContextPool: async () => {},
    connectionRegistry: {
        waitForAuthQueuesToDrain: async () => {},
    },
};

const authSwitcher = new AuthSwitcher(
    dummyLogger,
    { minSwitchIntervalMs: 0 },
    testAuthSource,
    mockBrowserManager
);

// Attempt to switch to disabled account 1
const switchDisabledResult = await authSwitcher.switchToSpecificAuth(1);
assert.strictEqual(switchDisabledResult.success, false, "switchToSpecificAuth(1) must be rejected when account 1 is disabled");
assert.ok(
    switchDisabledResult.reason && switchDisabledResult.reason.includes("disabled"),
    `Rejection reason must mention disabled: ${switchDisabledResult.reason}`
);
assert.strictEqual(mockBrowserManager.currentAuthIndex, 0, "currentAuthIndex must remain unchanged when switch is rejected");
console.log(`   • switchToSpecificAuth(1) successfully rejected with reason: "${switchDisabledResult.reason}"`);

// Verify that switching to an active, enabled account (e.g. index 2) succeeds
const switchActiveResult = await authSwitcher.switchToSpecificAuth(2);
assert.strictEqual(switchActiveResult.success, true, "switchToSpecificAuth(2) must succeed for active account");
assert.strictEqual(mockBrowserManager.currentAuthIndex, 2, "currentAuthIndex must be updated to 2");
console.log("   • switchToSpecificAuth(2) succeeded for enabled account.");

console.log("✓ All account enable/disable behavioral assertions passed successfully.");
console.log("=== test_account_enable_disable.mjs PASSED ===");
