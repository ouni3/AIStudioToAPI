/**
 * File: src/auth/AuthSwitcher.js
 * Description: Authentication switcher that handles account rotation logic, failure tracking, and usage-based switching
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

/**
 * Authentication Switcher Module
 * Handles account switching logic including single/multi-account modes and fallback mechanisms
 */
class AuthSwitcher {
    constructor(logger, config, authSource, browserManager) {
        this.logger = logger;
        this.config = config;
        this.authSource = authSource;
        this.browserManager = browserManager;
        this.failureCount = 0;
        this.usageCount = 0;
        this.isSystemBusy = false;
        this.lastSwitchTimestamp = 0;
        this.minSwitchIntervalMs = this.config?.minSwitchIntervalMs || 5000;
        this.accountCooldownMs = this.config?.accountCooldownMs || 60000;
        this.accountCooldownMap = new Map();
    }

    get currentAuthIndex() {
        return this.browserManager.currentAuthIndex;
    }

    set currentAuthIndex(value) {
        this.browserManager.currentAuthIndex = value;
    }

    // getNextAuthIndex() {
    //     const available = this.authSource.getRotationIndices();
    //     if (available.length === 0) return null;

    //     const currentCanonicalIndex =
    //         this.currentAuthIndex >= 0
    //             ? this.authSource.getCanonicalIndex(this.currentAuthIndex)
    //             : this.currentAuthIndex;
    //     const currentIndexInArray = available.indexOf(currentCanonicalIndex);

    //     if (currentIndexInArray === -1) {
    //         this.logger.warn(
    //             `[Auth] Current index ${this.currentAuthIndex} not in available list, switching to first available index.`
    //         );
    //         return available[0];
    //     }

    //     const nextIndexInArray = (currentIndexInArray + 1) % available.length;
    //     return available[nextIndexInArray];
    // }

    clearAccountCooldown(index) {
        if (index !== undefined && index !== null) {
            this.accountCooldownMap.delete(index);
            this.logger.debug(`[Auth] Cleared cooldown for account #${index}`);
        } else {
            this.accountCooldownMap.clear();
            this.logger.debug("[Auth] Cleared cooldown for all accounts");
        }
    }

    setAccountCooldown(index, durationMs = this.accountCooldownMs) {
        if (index === undefined || index === null || index < 0) return;
        const until = Date.now() + durationMs;
        this.accountCooldownMap.set(index, until);
        this.logger.warn(
            `⚠️ [Auth] Account #${index} put on cooldown for ${Math.round(durationMs / 1000)}s (until ${new Date(until).toISOString()})`
        );
    }

    isAccountInCooldown(index) {
        if (index === undefined || index === null || index < 0) return false;
        const cooldownUntil = this.accountCooldownMap.get(index);
        if (!cooldownUntil) return false;
        if (Date.now() >= cooldownUntil) {
            this.accountCooldownMap.delete(index);
            return false;
        }
        return true;
    }

    getAccountRemainingCooldown(index) {
        if (index === undefined || index === null || index < 0) return 0;
        const cooldownUntil = this.accountCooldownMap.get(index);
        if (!cooldownUntil) return 0;
        const remaining = cooldownUntil - Date.now();
        if (remaining <= 0) {
            this.accountCooldownMap.delete(index);
            return 0;
        }
        return remaining;
    }

    async switchToNextAuth() {
        const available = this.authSource.getRotationIndices();

        if (available.length === 0) {
            throw new Error("No available authentication sources, cannot switch.");
        }

        // Global switch debounce check
        const now = Date.now();
        const elapsedSinceLastSwitch = now - this.lastSwitchTimestamp;
        if (this.lastSwitchTimestamp > 0 && elapsedSinceLastSwitch < this.minSwitchIntervalMs) {
            const waitRemaining = this.minSwitchIntervalMs - elapsedSinceLastSwitch;
            this.logger.warn(
                `⚠️ [Auth] Switch rejected by debounce: ${elapsedSinceLastSwitch}ms < ${this.minSwitchIntervalMs}ms (remaining: ${waitRemaining}ms). Skipping switch.`
            );
            return {
                reason: `Switch debounced. Last switch was ${elapsedSinceLastSwitch}ms ago, minimum interval is ${this.minSwitchIntervalMs}ms.`,
                success: false,
            };
        }

        if (this.isSystemBusy) {
            this.logger.info("🔄 [Auth] Account switching/restarting in progress, skipping duplicate operation");
            return { reason: "Switch already in progress.", success: false };
        }

        this.isSystemBusy = true;

        try {
            // Single account mode
            if (available.length === 1) {
                const singleIndex = available[0];
                this.logger.info("==================================================");
                this.logger.info(
                    `🔄 [Auth] Single account mode: Rotation threshold reached, performing in-place restart...`
                );
                this.logger.info(`   • Target account: #${singleIndex}`);
                this.logger.info("==================================================");

                try {
                    await this.browserManager.launchOrSwitchContext(singleIndex);
                    this.resetCounters();
                    this.lastSwitchTimestamp = Date.now();
                    this.browserManager.rebalanceContextPool().catch(err => {
                        this.logger.error(`[Auth] Background rebalance failed: ${err.message}`);
                    });

                    this.logger.info(
                        `✅ [Auth] Single account #${singleIndex} restart/refresh successful, usage count reset.`
                    );
                    return { newIndex: singleIndex, success: true };
                } catch (error) {
                    this.logger.error(`❌ [Auth] Single account restart failed: ${error.message}`);
                    throw new Error(`Only one account is available and restart failed: ${error.message}`);
                }
            }

            // Multi-account mode
            const currentCanonicalIndex =
                this.currentAuthIndex >= 0
                    ? this.authSource.getCanonicalIndex(this.currentAuthIndex)
                    : this.currentAuthIndex;
            const currentIndexInArray = available.indexOf(currentCanonicalIndex);
            const hasCurrentAccount = currentIndexInArray !== -1;
            const startIndex = hasCurrentAccount ? currentIndexInArray : 0;
            const originalStartAccount = hasCurrentAccount ? available[startIndex] : null;

            // Wait for in-flight requests on the current account to finish before switching
            if (this.currentAuthIndex >= 0 && this.browserManager?.connectionRegistry) {
                await this.browserManager.connectionRegistry.waitForAuthQueuesToDrain(this.currentAuthIndex, 25000);
            }

            // Order candidate accounts: start from next account (or 0 if no current)
            const startOffset = hasCurrentAccount ? 1 : 0;
            const tryCount = hasCurrentAccount ? available.length - 1 : available.length;
            const candidateIndices = [];
            for (let i = startOffset; i < startOffset + tryCount; i++) {
                const tryIndex = (startIndex + i) % available.length;
                candidateIndices.push(available[tryIndex]);
            }

            // Account Cooldown filtering
            // Separate candidates into ready accounts vs accounts on cooldown
            const readyCandidates = candidateIndices.filter(idx => !this.isAccountInCooldown(idx));
            const cooldownCandidates = candidateIndices.filter(idx => this.isAccountInCooldown(idx));

            let orderedCandidates;
            if (readyCandidates.length > 0) {
                // Prioritize ready accounts first, followed by cooldown candidates as fallback
                orderedCandidates = [...readyCandidates, ...cooldownCandidates];
                if (cooldownCandidates.length > 0) {
                    this.logger.info(
                        `[Auth] Cooldown active for accounts [${cooldownCandidates.join(", ")}]; prioritizing ready accounts [${readyCandidates.join(", ")}]`
                    );
                }
            } else {
                // If ALL candidate accounts are in cooldown, sort by smallest remaining cooldown time
                orderedCandidates = [...cooldownCandidates].sort(
                    (a, b) => this.getAccountRemainingCooldown(a) - this.getAccountRemainingCooldown(b)
                );
                this.logger.warn(
                    `⚠️ [Auth] All candidate accounts in cooldown [${cooldownCandidates.join(", ")}]; sorted by minimum remaining cooldown: [${orderedCandidates.join(", ")}]`
                );
            }

            this.logger.info("==================================================");
            this.logger.info(`🔄 [Auth] Multi-account mode: Starting intelligent account switching`);
            this.logger.info(`   • Current account: #${this.currentAuthIndex}`);
            this.logger.info(
                `   • Available accounts (dedup by email, keeping latest index): [${available.join(", ")}]`
            );
            if (hasCurrentAccount) {
                this.logger.info(`   • Starting from: #${originalStartAccount}`);
            } else {
                this.logger.info(`   • No current account, will try all available accounts`);
            }
            this.logger.info(`   • Candidate order: [${orderedCandidates.join(", ")}]`);
            this.logger.info("==================================================");

            const failedAccounts = [];
            const totalCandidates = orderedCandidates.length;

            for (let i = 0; i < totalCandidates; i++) {
                const accountIndex = orderedCandidates[i];
                const attemptNumber = i + 1;
                this.logger.info(
                    `🔄 [Auth] Attempting to switch to account #${accountIndex} (${attemptNumber}/${totalCandidates} accounts)...`
                );

                try {
                    // Pre-cleanup: remove excess contexts BEFORE creating new one to avoid exceeding maxContexts
                    await this.browserManager.preCleanupForSwitch(accountIndex);
                    await this.browserManager.switchAccount(accountIndex);
                    this.resetCounters();
                    this.lastSwitchTimestamp = Date.now();
                    this.browserManager.rebalanceContextPool().catch(err => {
                        this.logger.error(`[Auth] Background rebalance failed: ${err.message}`);
                    });

                    if (failedAccounts.length > 0) {
                        this.logger.info(
                            `✅ [Auth] Successfully switched to account #${accountIndex} after skipping failed accounts: [${failedAccounts.join(", ")}]`
                        );
                    } else {
                        this.logger.info(
                            `✅ [Auth] Successfully switched to account #${accountIndex}, counters reset.`
                        );
                    }

                    return { failedAccounts, newIndex: accountIndex, success: true };
                } catch (error) {
                    this.logger.error(`❌ [Auth] Account #${accountIndex} failed: ${error.message}`);
                    failedAccounts.push(accountIndex);
                }
            }

            // If we had a current account, try it as a final fallback
            // If we had no current account, we already tried all accounts, so skip fallback
            if (hasCurrentAccount && originalStartAccount !== null) {
                this.logger.warn("==================================================");
                this.logger.warn(
                    `⚠️ [Auth] All other accounts failed. Making final attempt with original starting account #${originalStartAccount}...`
                );
                this.logger.warn("==================================================");

                try {
                    // Pre-cleanup: remove excess contexts BEFORE creating new one to avoid exceeding maxContexts
                    await this.browserManager.preCleanupForSwitch(originalStartAccount);
                    await this.browserManager.switchAccount(originalStartAccount);
                    this.resetCounters();
                    this.lastSwitchTimestamp = Date.now();
                    this.browserManager.rebalanceContextPool().catch(err => {
                        this.logger.error(`[Auth] Background rebalance failed: ${err.message}`);
                    });
                    this.logger.info(
                        `✅ [Auth] Final attempt succeeded! Switched to account #${originalStartAccount}.`
                    );
                    return {
                        failedAccounts,
                        finalAttempt: true,
                        newIndex: originalStartAccount,
                        success: true,
                    };
                } catch (finalError) {
                    this.logger.error(
                        `FATAL: ❌❌❌ [Auth] Final attempt with account #${originalStartAccount} also failed!`
                    );
                    failedAccounts.push(originalStartAccount);

                    // Throw fallback failure error with detailed information
                    this.currentAuthIndex = -1;
                    throw new Error(
                        `Fallback failed reason: All accounts failed including fallback to #${originalStartAccount}. Failed accounts: [${failedAccounts.join(", ")}]`
                    );
                }
            }

            // All accounts failed
            this.logger.error(
                `FATAL: All ${available.length} accounts failed! Failed accounts: [${failedAccounts.join(", ")}]`
            );
            this.currentAuthIndex = -1;
            throw new Error(
                `Switching to account failed: All ${available.length} available accounts failed to initialize. Failed accounts: [${failedAccounts.join(", ")}]`
            );
        } finally {
            this.isSystemBusy = false;
        }
    }

    async switchToSpecificAuth(targetIndex) {
        if (this.isSystemBusy) {
            this.logger.info("🔄 [Auth] Account switching in progress, skipping duplicate operation");
            return { reason: "Switch already in progress.", success: false };
        }

        // For manual switch, respect user's choice - don't auto-redirect to canonical index
        // UI already shows duplicate indicator, so user is making a deliberate choice
        if (!this.authSource.availableIndices.includes(targetIndex)) {
            return {
                reason: `Switch failed: Account #${targetIndex} invalid or does not exist.`,
                success: false,
            };
        }

        this.isSystemBusy = true;
        try {
            // Wait for in-flight requests on the current account to finish before manual switch
            if (this.currentAuthIndex >= 0 && this.browserManager?.connectionRegistry) {
                await this.browserManager.connectionRegistry.waitForAuthQueuesToDrain(this.currentAuthIndex, 25000);
            }

            this.logger.info(`🔄 [Auth] Starting switch to specified account #${targetIndex}...`);
            // Pre-cleanup: remove excess contexts BEFORE creating new one to avoid exceeding maxContexts
            await this.browserManager.preCleanupForSwitch(targetIndex);
            await this.browserManager.switchAccount(targetIndex);
            this.resetCounters();
            this.browserManager.rebalanceContextPool().catch(err => {
                this.logger.error(`[Auth] Background rebalance failed: ${err.message}`);
            });
            this.logger.info(`✅ [Auth] Successfully switched to account #${targetIndex}, counters reset.`);
            return { newIndex: targetIndex, success: true };
        } catch (error) {
            this.logger.error(`❌ [Auth] Switch to specified account #${targetIndex} failed: ${error.message}`);
            throw error;
        } finally {
            this.isSystemBusy = false;
        }
    }

    async handleRequestFailureAndSwitch(errorDetails, sendErrorCallback) {
        const status = Number(errorDetails?.status);

        // 400 Bad Request or 4xx client parameter error isolation:
        // Exclude 403 (forbidden/location unsupported) and 429 (rate limit) which are account-specific.
        // Status 400 or other 4xx client parameter error indicates client-side payload issue.
        const isClientError = status === 400 || (status >= 400 && status < 500 && status !== 403 && status !== 429);
        if (isClientError) {
            this.logger.warn(
                `⚠️ [Auth] Client parameter error received (status ${status}, message: ${errorDetails?.message || "Client error"}). Skipping failure count increment and account switch.`
            );
            return;
        }

        this.failureCount++;
        if (this.config.failureThreshold > 0) {
            this.logger.warn(
                `⚠️ [Auth] Request failed - failure count: ${this.failureCount}/${this.config.failureThreshold} (Current account index: ${this.currentAuthIndex})`
            );
        } else {
            this.logger.warn(
                `⚠️ [Auth] Request failed - failure count: ${this.failureCount} (Current account index: ${this.currentAuthIndex})`
            );
        }

        const isImmediateSwitch = this.config.immediateSwitchStatusCodes.includes(status);
        const isThresholdReached =
            this.config.failureThreshold > 0 && this.failureCount >= this.config.failureThreshold;

        if (isImmediateSwitch || isThresholdReached) {
            // Apply cooldown penalty to current failing account if error is 403, 429, or 5xx
            if (this.currentAuthIndex >= 0 && (status === 403 || status === 429 || status >= 500)) {
                this.setAccountCooldown(this.currentAuthIndex, this.accountCooldownMs);
            }

            if (isImmediateSwitch) {
                this.logger.warn(`🔴 [Auth] Received status code ${status}, triggering immediate account switch...`);
            } else {
                this.logger.warn(
                    `🔴 [Auth] Failure threshold reached (${this.failureCount}/${this.config.failureThreshold})! Preparing to switch account...`
                );
            }

            try {
                const result = await this.switchToNextAuth();
                if (!result.success) {
                    this.logger.warn(`⚠️ [Auth] Account switch skipped: ${result.reason}`);
                    if (sendErrorCallback) {
                        sendErrorCallback(`⚠️ Account switch skipped: ${result.reason}`);
                    }
                    return;
                }
                const successMessage = `🔄 Account switch completed, now using account #${this.currentAuthIndex}.`;
                this.logger.info(`[Auth] ${successMessage}`);
                if (sendErrorCallback) sendErrorCallback(successMessage);
            } catch (error) {
                let userMessage = `❌ Fatal error: Unknown switching error occurred: ${error.message}`;

                if (error.message.includes("Only one account is available")) {
                    userMessage = "❌ Switch failed: Only one account available.";
                    this.logger.info("[Auth] Only one account available, failure count reset.");
                    this.failureCount = 0;
                } else if (error.message.includes("Fallback failed reason")) {
                    userMessage = `❌ Fatal error: Both automatic switching and emergency fallback failed, service may be interrupted, please check logs!`;
                } else if (error.message.includes("Switching to account")) {
                    userMessage = `⚠️ Automatic switch failed: Automatically fell back to account #${this.currentAuthIndex}, please check if target account has issues.`;
                }

                this.logger.error(`[Auth] Background account switching task failed: ${error.message}`);
                if (sendErrorCallback) sendErrorCallback(userMessage);
            }
        }
    }

    incrementUsageCount() {
        this.usageCount++;
        return this.usageCount;
    }

    shouldSwitchByUsage() {
        return this.config.switchOnUses > 0 && this.usageCount >= this.config.switchOnUses;
    }

    resetCounters() {
        this.failureCount = 0;
        this.usageCount = 0;
    }
}

module.exports = AuthSwitcher;
