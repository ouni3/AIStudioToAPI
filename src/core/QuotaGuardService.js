/**
 * File: src/core/QuotaGuardService.js
 * Description: Quota guard service that enforces daily account quota limits for targeted models within a 15:00 (UTC+8) cycle.
 *
 * Author: Nono (moe-code)
 */

const fs = require("fs");
const path = require("path");

class QuotaGuardService {
    /**
     * @param {Object} options
     * @param {Object} options.authSource
     * @param {Object} [options.requestHandler]
     * @param {Object} options.logger
     * @param {Object} [options.config]
     * @param {string} [options.dataDir]
     */
    constructor({ authSource, requestHandler = null, logger, config = {}, dataDir = null }) {
        this.authSource = authSource;
        this.requestHandler = requestHandler;
        this.logger = logger;
        this.config = config;
        this.dataDir = dataDir || path.join(process.cwd(), "data");
        this.stateFilePath = path.join(this.dataDir, "quota-guard-state.json");

        // Backward compatibility: maintain quotaLimit for observability/UI (100 or from config)
        this.quotaLimit = 100;
        this.targetModel = process.env.TARGET_QUOTA_MODEL || null;

        // 2 hours ban duration in milliseconds
        this.banDurationMs = 2 * 3600 * 1000;

        // Current cycle key, e.g. "2026-10-10_15:00_CST"
        this.currentCycleKey = this._calculateCurrentCycleKey();

        // Map<authIndex, count> (Purely for telemetry/observability, no longer triggers circuit breaker)
        this.accountUsageMap = new Map();

        this.timer = null;
        this.expiryCheckInterval = null;

        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            try {
                fs.mkdirSync(this.dataDir, { recursive: true });
            } catch (err) {
                this.logger.warn(`[QuotaGuard] Failed to create data directory ${this.dataDir}: ${err.message}`);
            }
        }

        this._loadState();
    }

    setRequestHandler(requestHandler) {
        this.requestHandler = requestHandler;
    }

    /**
     * Calculate Beijing Time (UTC+8) cycle key.
     * Cycle starts at 15:00 UTC+8 and ends next day at 15:00 UTC+8.
     * @param {Date} [now]
     * @returns {string} Cycle key identifying the start date/time of the current cycle.
     */
    _calculateCurrentCycleKey(now = new Date()) {
        // Convert to UTC+8 timestamp
        const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
        const beijingTime = new Date(utcTime + 8 * 3600 * 1000);

        const hours = beijingTime.getHours();

        // If before 15:00, cycle started yesterday at 15:00
        const cycleStartDate = new Date(beijingTime);
        if (hours < 15) {
            cycleStartDate.setDate(cycleStartDate.getDate() - 1);
        }

        const cYear = cycleStartDate.getFullYear();
        const cMonth = String(cycleStartDate.getMonth() + 1).padStart(2, "0");
        const cDate = String(cycleStartDate.getDate()).padStart(2, "0");

        return `${cYear}-${cMonth}-${cDate}_15:00_CST`;
    }

    /**
     * Calculate milliseconds remaining until next 15:00 Beijing Time.
     * @param {Date} [now]
     * @returns {number} ms until next 15:00 UTC+8
     */
    _getMsUntilNextReset(now = new Date()) {
        const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
        const beijingTime = new Date(utcTime + 8 * 3600 * 1000);

        const nextReset = new Date(beijingTime);
        if (beijingTime.getHours() >= 15) {
            nextReset.setDate(nextReset.getDate() + 1);
        }
        nextReset.setHours(15, 0, 0, 0);

        const diff = nextReset.getTime() - beijingTime.getTime();
        return Math.max(diff, 1000);
    }

    /**
     * Load persisted state if same cycle
     */
    _loadState() {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                const raw = fs.readFileSync(this.stateFilePath, "utf-8");
                const parsed = JSON.parse(raw);
                if (parsed.cycleKey === this.currentCycleKey && parsed.usage) {
                    for (const [k, v] of Object.entries(parsed.usage)) {
                        this.accountUsageMap.set(Number(k), Number(v));
                    }
                    this.logger.info(`[QuotaGuard] Loaded quota usage for cycle ${this.currentCycleKey}`);
                } else {
                    this.logger.info(
                        `[QuotaGuard] State file cycle mismatch or expired, starting fresh cycle ${this.currentCycleKey}`
                    );
                    this._saveState();
                }
            }
        } catch (err) {
            this.logger.warn(`[QuotaGuard] Failed to load state: ${err.message}`);
        }
    }

    _saveState() {
        try {
            const usageObj = {};
            for (const [k, v] of this.accountUsageMap.entries()) {
                usageObj[k] = v;
            }
            const data = {
                cycleKey: this.currentCycleKey,
                updatedAt: new Date().toISOString(),
                usage: usageObj,
            };
            fs.writeFileSync(this.stateFilePath, JSON.stringify(data, null, 2), "utf-8");
        } catch (err) {
            this.logger.warn(`[QuotaGuard] Failed to save state: ${err.message}`);
        }
    }

    /**
     * Match model to determine if it is under quota guard.
     * Rules:
     * 1. If TARGET_QUOTA_MODEL is specified:
     *    - If it matches or starts with TARGET_QUOTA_MODEL (e.g. "gemini-3.8-flash", "gemini-flash-latest", "gemini-3.7-flash")
     * 2. Default:
     *    - Matches port 8316 models (gemini-flash-latest, gemini-3.8-flash, and /flash/ models)
     *    - Matches port 8317 models (gemini-3.7-flash series, gemini-3.8-flash, gemini-flash-latest)
     * @param {string} modelName
     * @returns {boolean}
     */
    isTargetModel(modelName) {
        if (!modelName || typeof modelName !== "string") return false;
        const normalized = modelName.trim().toLowerCase();

        const targetEnv = (this.targetModel || "").trim().toLowerCase();
        if (targetEnv) {
            if (targetEnv === "gemini-flash-latest") {
                return normalized === "gemini-flash-latest";
            }
            if (targetEnv.startsWith("gemini-3.8-flash")) {
                return normalized.startsWith("gemini-3.8-flash");
            }
            if (targetEnv.startsWith("gemini-3.7-flash")) {
                return normalized.startsWith("gemini-3.7-flash");
            }
            return normalized === targetEnv || normalized.startsWith(targetEnv);
        }

        // Unified scope for 8316 and 8317:
        // - gemini-flash-latest
        // - gemini-3.8-flash and variants (e.g. gemini-3.8-flash-preview, gemini-3.8-flash-latest)
        // - gemini-3.7-flash series (e.g. gemini-3.7-flash, gemini-3.7-flash-thinking, etc.)
        return (
            normalized === "gemini-flash-latest" ||
            /^gemini-3\.8-flash/.test(normalized) ||
            /^gemini-3\.7-flash/.test(normalized)
        );
    }

    /**
     * Check if current cycle is still valid, reset if new cycle has started.
     */
    _checkCycleRollover() {
        const latestCycleKey = this._calculateCurrentCycleKey();
        if (latestCycleKey !== this.currentCycleKey) {
            this.logger.info(`[QuotaGuard] Cycle rolled over from ${this.currentCycleKey} to ${latestCycleKey}`);
            this.resetQuotaCycle();
        }
    }

    /**
     * Record request for authIndex on target model.
     * Note: 100-request circuit breaker is completely decommissioned.
     * Usage counts are recorded strictly for telemetry and dashboard observability.
     * @param {number} authIndex
     * @param {string} modelName
     * @returns {Promise<{ isQuotaExhausted: boolean, currentUsage: number }>}
     */
    async recordRequest(authIndex, modelName) {
        if (!Number.isInteger(authIndex) || authIndex < 0) {
            return { currentUsage: 0, isQuotaExhausted: false };
        }

        this._checkCycleRollover();

        if (!this.isTargetModel(modelName)) {
            return { currentUsage: this.getUsage(authIndex), isQuotaExhausted: false };
        }

        const currentUsage = (this.accountUsageMap.get(authIndex) || 0) + 1;
        this.accountUsageMap.set(authIndex, currentUsage);
        this._saveState();

        this.logger.info(
            `[QuotaGuard] Account #${authIndex} request telemetry count for model "${modelName}": ${currentUsage}`
        );

        return { currentUsage, isQuotaExhausted: false };
    }

    /**
     * Handle upstream 429 quota exhaustion error.
     * Directly disables the account for 2 hours (disabled = true, disabledReason = 'quota_exhausted', disabledUntil = Date.now() + 2h).
     * Automatically triggers account switch if the account is currently active.
     * @param {number} authIndex
     * @param {string} [modelName]
     * @returns {Promise<boolean>}
     */
    async handleQuota429(authIndex, modelName = null) {
        if (!Number.isInteger(authIndex) || authIndex < 0) {
            return false;
        }

        const disabledUntil = Date.now() + this.banDurationMs;
        const modelDesc = modelName ? ` on model "${modelName}"` : "";
        this.logger.warn(
            `[QuotaGuard] 🚫 Account #${authIndex} received 429 quota exhaustion${modelDesc}. Disabling account for 2 hours (until ${new Date(disabledUntil).toISOString()}).`
        );

        await this._triggerQuotaExhausted(authIndex, disabledUntil);
        return true;
    }

    /**
     * Disable account due to quota exhaustion and switch if active
     * @param {number} authIndex
     * @param {number} [disabledUntil]
     */
    async _triggerQuotaExhausted(authIndex, disabledUntil = null) {
        try {
            const until = disabledUntil || Date.now() + this.banDurationMs;
            await this.authSource.updateAccountStatus(authIndex, {
                disabled: true,
                disabledReason: "quota_exhausted",
                disabledUntil: until,
                reason: "quota_exhausted",
            });

            this.logger.warn(
                `[QuotaGuard] Account #${authIndex} disabled with reason: quota_exhausted until ${new Date(until).toISOString()}.`
            );

            // If active account, trigger switch
            if (this.requestHandler && this.requestHandler.currentAuthIndex === authIndex) {
                this.logger.info(
                    `[QuotaGuard] Disabled account #${authIndex} is currently active. Switching to next available account...`
                );
                try {
                    await this.requestHandler._switchToNextAuth();
                } catch (switchErr) {
                    this.logger.error(
                        `[QuotaGuard] Failed to switch account after quota exhaustion: ${switchErr.message}`
                    );
                }
            }
        } catch (err) {
            this.logger.error(`[QuotaGuard] Error handling quota exhaustion for #${authIndex}: ${err.message}`);
        }
    }

    /**
     * Get usage for authIndex in current cycle
     * @param {number} authIndex
     * @returns {number}
     */
    getUsage(authIndex) {
        this._checkCycleRollover();
        return this.accountUsageMap.get(authIndex) || 0;
    }

    /**
     * Inspect disabled accounts and auto-restore those whose disabledUntil timestamp has passed.
     * Channel A: 2-hour expiration auto-heal.
     * Manual disabled accounts (without disabledReason === 'quota_exhausted') MUST NOT be modified.
     * @returns {Promise<number[]>} Array of restored account indices
     */
    async checkAndRestoreExpiredBans() {
        const restored = [];
        const initialIndices = this.authSource.initialIndices || [];
        const now = Date.now();

        for (const index of initialIndices) {
            try {
                let isDisabled = false;
                let disabledReason = null;
                let disabledUntil = null;

                if (typeof this.authSource.isDisabled === "function") {
                    isDisabled = this.authSource.isDisabled(index);
                    disabledReason = this.authSource.getDisabledReason?.(index) || null;
                    disabledUntil = this.authSource.getDisabledUntil?.(index) || null;
                }

                // If not found via memory helpers, check file content directly
                if (!isDisabled || !disabledUntil) {
                    const authContent = this.authSource._getAuthContent?.(index);
                    if (authContent) {
                        const data = JSON.parse(authContent);
                        if (data.disabled === true) {
                            isDisabled = true;
                            disabledReason = data.disabledReason || data.reason || null;
                            disabledUntil = data.disabledUntil ? Number(data.disabledUntil) : null;
                        }
                    }
                }

                // Constraint check: strictly quota_exhausted reason only
                const isQuotaExhausted = disabledReason === "quota_exhausted";
                if (isDisabled && isQuotaExhausted && disabledUntil && now >= disabledUntil) {
                    this.logger.info(
                        `[QuotaGuard] ⏰ Account #${index} 2-hour quota ban has expired (disabledUntil: ${new Date(disabledUntil).toISOString()}). Auto-restoring account.`
                    );
                    await this.authSource.updateAccountStatus(index, {
                        disabled: false,
                    });
                    restored.push(index);
                }
            } catch (err) {
                this.logger.warn(`[QuotaGuard] Failed to check expired ban for account #${index}: ${err.message}`);
            }
        }

        return restored;
    }

    /**
     * Reset quota cycle, clear counts, and re-enable quota_exhausted accounts.
     * Channel B: Daily 15:00 CST fallback sweep.
     * Manual disabled accounts (without disabledReason === 'quota_exhausted') MUST NOT be modified.
     */
    async resetQuotaCycle() {
        this.currentCycleKey = this._calculateCurrentCycleKey();
        this.accountUsageMap.clear();
        this._saveState();

        this.logger.info(`[QuotaGuard] Resetting quota cycle to ${this.currentCycleKey}`);

        // Scan accounts and restore those disabled due to quota_exhausted
        const initialIndices = this.authSource.initialIndices || [];
        for (const index of initialIndices) {
            try {
                const authContent = this.authSource._getAuthContent(index);
                if (authContent) {
                    const data = JSON.parse(authContent);
                    if (
                        data.disabled === true &&
                        (data.disabledReason === "quota_exhausted" || data.reason === "quota_exhausted")
                    ) {
                        this.logger.info(
                            `[QuotaGuard] Automatically re-enabling account #${index} after daily 15:00 quota reset.`
                        );
                        await this.authSource.updateAccountStatus(index, {
                            disabled: false,
                        });
                    }
                }
            } catch (err) {
                this.logger.warn(
                    `[QuotaGuard] Failed to inspect/restore account #${index} during reset: ${err.message}`
                );
            }
        }
    }

    /**
     * Start the daily 15:00 UTC+8 reset scheduler and periodic 2-hour expiration sweep (Channel A + B)
     */
    startScheduler() {
        this.stopScheduler();

        // Channel B: Daily 15:00 reset
        const scheduleNext = () => {
            const delay = this._getMsUntilNextReset();
            this.logger.info(
                `[QuotaGuard] Next daily quota reset scheduled in ${Math.round(delay / 1000)} seconds (at Beijing Time 15:00).`
            );

            this.timer = setTimeout(async () => {
                try {
                    await this.resetQuotaCycle();
                } catch (err) {
                    this.logger.error(`[QuotaGuard] Error during scheduled quota reset: ${err.message}`);
                } finally {
                    scheduleNext();
                }
            }, delay);

            if (this.timer.unref) {
                this.timer.unref();
            }
        };

        scheduleNext();

        // Channel A: Periodic inspection for 2-hour ban expiration (every 60 seconds)
        this.expiryCheckInterval = setInterval(async () => {
            try {
                await this.checkAndRestoreExpiredBans();
            } catch (err) {
                this.logger.error(`[QuotaGuard] Error in periodic expired ban check: ${err.message}`);
            }
        }, 60000);

        if (this.expiryCheckInterval.unref) {
            this.expiryCheckInterval.unref();
        }
    }

    /**
     * Stop scheduler timers
     */
    stopScheduler() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.expiryCheckInterval) {
            clearInterval(this.expiryCheckInterval);
            this.expiryCheckInterval = null;
        }
    }
}

module.exports = QuotaGuardService;
