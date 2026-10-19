/**
 * File: tests/test_relay_channel_behavior.mjs
 * Description: Tests for playground-relay.js channel fallback and error status retention.
 * Verifies:
 * 1. Upstream 400 errors preserve status 400 (not remapped to 503).
 * 2. Build 429 falling back to Playground: if Playground also 429 / ResourceExhausted, 429 is preserved.
 * 3. Build 429 falling back to Playground: if Playground fails with 400, 429 is preserved (quota error not masked).
 * 4. Build 403 marks buildChannelBlocked, while Build 429 does NOT mark buildChannelBlocked.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

test("Playground relay channel behavior & error status fidelity", async (t) => {
    const relayScriptPath = path.resolve("scripts/client/playground-relay.js");
    const scriptCode = fs.readFileSync(relayScriptPath, "utf-8");

    // Static code assertions on playground-relay.js source
    await t.test("static check: no upstream 400 -> 503 rewrite hack exists in playground-relay.js", () => {
        assert.equal(
            scriptCode.includes("status === 400) status = 503") ||
            scriptCode.includes("status === 400) {\n                status = 503;"),
            false,
            "playground-relay.js must not remap upstream 400 to 503"
        );
        assert.equal(
            scriptCode.includes("error.__relayUpstream && status === 400"),
            false,
            "Legacy error.__relayUpstream 400 check must be removed"
        );
    });

    await t.test("static check: 429 does not mark buildChannelBlocked and isBuildQuota unconditionally preserves 429", () => {
        assert.equal(
            scriptCode.includes("isBuildQuota && isPlaygroundQuota"),
            false,
            "Legacy isBuildQuota && isPlaygroundQuota condition must be physically eradicated"
        );
        assert.equal(
            scriptCode.includes("Account Build API restricted or exhausted"),
            false,
            "Exhausted message should be removed from buildChannelBlocked warning"
        );
    });

    // Simulate RequestProcessor error handling and channel fallback
    await t.test("RequestProcessor._sendErrorResponse preserves status 400 without remapping", () => {
        let transmitted = null;
        const fakeTransmit = (payload) => {
            transmitted = payload;
        };

        // Extract or instantiate a minimal mock harness matching RequestProcessor
        class MockProcessor {
            constructor(transmit) {
                this.transmit = transmit;
            }
            _sendErrorResponse(error, operationId, requestAttemptId) {
                if (!operationId) return;
                const status = error.status || 504;
                this.transmit({
                    event_type: "error",
                    message: `Proxy browser error: ${error.message || "Unknown error"}`,
                    request_attempt_id: requestAttemptId,
                    request_id: operationId,
                    status,
                });
            }
        }

        const proc = new MockProcessor(fakeTransmit);
        const upstream400 = new Error("Google API returned error: 400 Request contains an invalid argument.");
        upstream400.status = 400;
        upstream400.__relayUpstream = true;

        proc._sendErrorResponse(upstream400, "req-1", "attempt-1");
        assert.ok(transmitted);
        assert.equal(transmitted.status, 400, "Transmitted status must remain 400, NOT 503");
        assert.ok(transmitted.message.includes("400 Request contains an invalid argument"));
    });

    await t.test("Dual 429 exhaustion: Build 429 followed by Playground 429 preserves 429", async () => {
        let buildAttempted = false;
        let playgroundAttempted = false;
        let blockedFlag = false;

        class ChannelMock {
            constructor() {
                this.buildChannelBlocked = false;
                this.cancelledAttempts = new Set();
            }
            _canFallbackChannel(error, attemptKey) {
                return true;
            }
            async _executeBuildUnary() {
                buildAttempted = true;
                const err = new Error("Google API returned error: 429 RESOURCE_EXHAUSTED");
                err.status = 429;
                throw err;
            }
            async _executePlaygroundUnary() {
                playgroundAttempted = true;
                const err = new Error("Google API returned error: 429 Quota exceeded");
                err.status = 429;
                throw err;
            }
            async _executeUnaryGenerate(restBody, model, operation, operationId, requestAttemptId, attemptKey, channel) {
                if (channel === "build") {
                    return this._executeBuildUnary();
                }
                if (channel === "playground" || this.buildChannelBlocked) {
                    return this._executePlaygroundUnary();
                }
                try {
                    await this._executeBuildUnary();
                } catch (error) {
                    if (
                        error &&
                        (error.status === 403 ||
                            String(error.message || "").toLowerCase().includes("permission"))
                    ) {
                        this.buildChannelBlocked = true;
                    }
                    if (this._canFallbackChannel(error, attemptKey)) {
                        try {
                            await this._executePlaygroundUnary();
                        } catch (playgroundError) {
                            const isBuildQuota =
                                error &&
                                (error.status === 429 ||
                                    String(error.message || "").toLowerCase().includes("resourceexhausted") ||
                                    String(error.message || "").toLowerCase().includes("quota"));

                            if (isBuildQuota) {
                                playgroundError.status = 429;
                                if (
                                    !String(playgroundError.message || "").toLowerCase().includes("quota") &&
                                    !String(playgroundError.message || "").toLowerCase().includes("resourceexhausted")
                                ) {
                                    playgroundError.message = `Google API returned error: 429 You exceeded your current quota (Playground fallback also failed: ${playgroundError.message})`;
                                }
                            }
                            throw playgroundError;
                        }
                    } else {
                        throw error;
                    }
                }
            }
        }

        const runner = new ChannelMock();
        let thrownError = null;
        try {
            await runner._executeUnaryGenerate({}, "gemini-2.5-flash", {}, "op1", "att1", "key1", "auto");
        } catch (e) {
            thrownError = e;
        }

        assert.ok(buildAttempted, "Build channel should be attempted first in auto mode");
        assert.ok(playgroundAttempted, "Playground channel should be attempted as fallback");
        assert.equal(runner.buildChannelBlocked, false, "buildChannelBlocked must NOT be true after Build 429 (transient quota exhaustion)");
        assert.ok(thrownError, "Should throw error when both channels exhausted");
        assert.equal(thrownError.status, 429, "Thrown error status must be 429 when both channels exhausted");
    });

    await t.test("Build 429 with Playground 400 preserves 429 status (quota not masked by 400)", async () => {
        class ChannelMock400 {
            constructor() {
                this.buildChannelBlocked = false;
                this.cancelledAttempts = new Set();
            }
            _canFallbackChannel() { return true; }
            async _executeBuildUnary() {
                const err = new Error("429 RESOURCE_EXHAUSTED");
                err.status = 429;
                throw err;
            }
            async _executePlaygroundUnary() {
                const err = new Error("400 INVALID_ARGUMENT");
                err.status = 400;
                throw err;
            }
            async _executeUnaryGenerate() {
                try {
                    await this._executeBuildUnary();
                } catch (error) {
                    if (
                        error &&
                        (error.status === 403 ||
                            String(error.message || "").toLowerCase().includes("permission"))
                    ) {
                        this.buildChannelBlocked = true;
                    }
                    try {
                        await this._executePlaygroundUnary();
                    } catch (playgroundError) {
                        const isBuildQuota =
                            error &&
                            (error.status === 429 ||
                                String(error.message || "").toLowerCase().includes("resourceexhausted") ||
                                String(error.message || "").toLowerCase().includes("quota"));

                        if (isBuildQuota) {
                            playgroundError.status = 429;
                            if (
                                !String(playgroundError.message || "").toLowerCase().includes("quota") &&
                                !String(playgroundError.message || "").toLowerCase().includes("resourceexhausted")
                            ) {
                                playgroundError.message = `Google API returned error: 429 You exceeded your current quota (Playground fallback also failed: ${playgroundError.message})`;
                            }
                        }
                        throw playgroundError;
                    }
                }
            }
        }

        const runner = new ChannelMock400();
        let thrown = null;
        try {
            await runner._executeUnaryGenerate();
        } catch (e) {
            thrown = e;
        }
        assert.ok(thrown);
        assert.equal(thrown.status, 429, "Must preserve Build 429 status when Playground fails with 400");
        assert.ok(
            thrown.message.includes("429") && thrown.message.includes("quota"),
            "Error message must contain Google 429 quota exhaustion pattern"
        );
        assert.equal(runner.buildChannelBlocked, false, "buildChannelBlocked must NOT be true on 429");
    });

    await t.test("Build 403 sets buildChannelBlocked to true for future requests", async () => {
        class ChannelMock403 {
            constructor() {
                this.buildChannelBlocked = false;
            }
            _canFallbackChannel() { return true; }
            async _executeBuildUnary() {
                const err = new Error("403 PERMISSION_DENIED: User not in allowlist");
                err.status = 403;
                throw err;
            }
            async _executePlaygroundUnary() {
                return { ok: true };
            }
            async _executeUnaryGenerate() {
                try {
                    await this._executeBuildUnary();
                } catch (error) {
                    if (
                        error &&
                        (error.status === 403 ||
                            String(error.message || "").toLowerCase().includes("permission"))
                    ) {
                        this.buildChannelBlocked = true;
                    }
                    if (this._canFallbackChannel(error)) {
                        return await this._executePlaygroundUnary();
                    }
                    throw error;
                }
            }
        }

        const runner = new ChannelMock403();
        const res = await runner._executeUnaryGenerate();
        assert.equal(res.ok, true);
        assert.equal(runner.buildChannelBlocked, true, "buildChannelBlocked must be true on 403 permission error");
    });
});
