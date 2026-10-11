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

        this.quotaLimit = 100;
        this.targetModel = process.env.TARGET_QUOTA_MODEL || null;

        // Current cycle key, e.g. "2026-10-10_15:00_CST"
        this.currentCycleKey = this._calculateCurrentCycleKey();

        // Map<authIndex, count>
        this.accountUsageMap = new Map();

        this.timer = null;

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

        const year = beijingTime.getFullYear();
        const month = String(beijingTime.getMonth() + 1).padStart(2, "0");
        const date = beijingTime.getDate();
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
                    this.logger.info(`[QuotaGuard] State file cycle mismatch or expired, starting fresh cycle ${this.currentCycleKey}`);
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
     *    - If it's a regex or prefix (e.g. "gemini-3.7-flash"), matches startsWith or regex.
     *    - Or exact match.
     * 2. If TARGET_QUOTA_MODEL not specified (or default):
     *    - Matches port 8316 model (gemini-flash-latest) and port 8317 model (/^gemini-3\.7-flash/)
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
            if (targetEnv.startsWith("gemini-3.7-flash")) {
                return normalized.startsWith("gemini-3.7-flash");
            }
            return normalized === targetEnv || normalized.startsWith(targetEnv);
        }

        // Default: match both port 8316 model and port 8317 model series
        return normalized === "gemini-flash-latest" || /^gemini-3\.7-flash/.test(normalized);
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
     * If limit (100) is reached:
     * - mark account disabled with reason 'quota_exhausted'
     * - if active account, trigger switch
     * @param {number} authIndex
     * @param {string} modelName
     * @returns {Promise<{ isQuotaExhausted: boolean, currentUsage: number }>}
     */
    async recordRequest(authIndex, modelName) {
        if (!Number.isInteger(authIndex) || authIndex < 0) {
            return { isQuotaExhausted: false, currentUsage: 0 };
        }

        this._checkCycleRollover();

        if (!this.isTargetModel(modelName)) {
            return { isQuotaExhausted: false, currentUsage: this.getUsage(authIndex) };
        }

        const currentUsage = (this.accountUsageMap.get(authIndex) || 0) + 1;
        this.accountUsageMap.set(authIndex, currentUsage);
        this._saveState();

        this.logger.info(
            `[QuotaGuard] Account #${authIndex} request count for model "${modelName}": ${currentUsage}/${this.quotaLimit}`
        );

        if (currentUsage >= this.quotaLimit) {
            this.logger.warn(
                `[QuotaGuard] Account #${authIndex} has reached quota limit (${this.quotaLimit}) for model "${modelName}". Triggering circuit breaker...`
            );
            await this._triggerQuotaExhausted(authIndex);
            return { isQuotaExhausted: true, currentUsage };
        }

        return { isQuotaExhausted: false, currentUsage };
    }

    /**
     * Disable account due to quota exhaustion and switch if active
     * @param {number} authIndex
     */
    async _triggerQuotaExhausted(authIndex) {
        try {
            await this.authSource.updateAccountStatus(authIndex, {
                disabled: true,
                disabledReason: "quota_exhausted",
                reason: "quota_exhausted",
            });

            this.logger.warn(`[QuotaGuard] Account #${authIndex} disabled with reason: quota_exhausted.`);

            // If active account, trigger switch
            if (this.requestHandler && this.requestHandler.currentAuthIndex === authIndex) {
                this.logger.info(
                    `[QuotaGuard] Disabled account #${authIndex} is currently active. Switching to next available account...`
                );
                try {
                    await this.requestHandler._switchToNextAuth();
                } catch (switchErr) {
                    this.logger.error(`[QuotaGuard] Failed to switch account after quota exhaustion: ${switchErr.message}`);
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
     * Reset quota cycle, clear counts, and re-enable quota_exhausted accounts.
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
                    if (data.disabled === true && (data.disabledReason === "quota_exhausted" || data.reason === "quota_exhausted")) {
                        this.logger.info(`[QuotaGuard] Automatically re-enabling account #${index} after quota reset.`);
                        await this.authSource.updateAccountStatus(index, {
                            disabled: false,
                        });
                    }
                }
            } catch (err) {
                this.logger.warn(`[QuotaGuard] Failed to inspect/restore account #${index} during reset: ${err.message}`);
            }
        }
    }

    /**
     * Start the daily 15:00 UTC+8 reset scheduler
     */
    startScheduler() {
        this.stopScheduler();

        const scheduleNext = () => {
            const delay = this._getMsUntilNextReset();
            this.logger.info(`[QuotaGuard] Next quota reset scheduled in ${Math.round(delay / 1000)} seconds (at Beijing Time 15:00).`);

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
    }

    /**
     * Stop scheduler timer
     */
    stopScheduler() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}

module.exports = QuotaGuardService;
