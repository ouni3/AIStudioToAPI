/**
 * File: scripts/client/playground-relay.js
 * Description: Self-contained relay client injected into the AI Studio Playground
 *              page via context.addInitScript(). Connects back to the local proxy
 *              server over WebSocket, encodes Gemini REST requests into MakerSuite
 *              wire arrays, generates fresh WAA proofs via the page's own BotGuard
 *              snapshot service, and streams wire frames back as REST chunks.
 *
 * Concatenation contract: src/relay/playground-wire-encoder.js and
 * src/relay/playground-frame-decoder.js are prepended verbatim by BrowserManager
 * before this file, so the pure encode/decode functions share this scope.
 *
 * Placeholders (replaced by BrowserManager before injection, see the
 * RELAY_* constants at the top of the IIFE):
 *   AUTH INDEX                    - baked account index for the WS query
 *   WS ENDPOINT                   - ws://127.0.0.1:9998
 *   BOOTSTRAP MODEL               - model used for the playground page URL
 *   UPSTREAM CHANNEL              - default upstream channel (auto/build/playground)
 *   MODEL LIMITS                  - JSON object { modelName: outputTokenLimit }
 *   DEFAULT MAX OUTPUT TOKENS     - fallback output limit
 *
 * Protocol verified against Mag1cFall/AIStudio2API (docs/waa.md, worker.go, page.go).
 */

/* eslint-env browser */
/* global
   __RELAY_AUTH_INDEX__,
   __RELAY_BOOTSTRAP_MODEL__,
   __RELAY_DEFAULT_MAX_OUTPUT_TOKENS__,
   __RELAY_MODEL_LIMITS__,
   __RELAY_UPSTREAM_CHANNEL__,
   __RELAY_WS_ENDPOINT__,
   encodeBuildProxyRequest,
   encodeCountTokensRequest,
   encodeGenerateContentRequest,
   normalizeBuildRequestBody,
   parseCountTokensResponse,
   parseRpcErrorBody,
   parseSparseJson,
   relayContentsText,
   relayDecodeBuildResponseBody,
   RelayFrameDecoder,
   RelayFrameExtractor
*/
(function () {
    "use strict";

    function getPageWindow() {
        return typeof window.wrappedJSObject !== "undefined" && window.wrappedJSObject
            ? window.wrappedJSObject
            : window;
    }

    // The relay only runs in the top-level page: iframes (ads, embeds) get the
    // init script too, but their JS environments are unreliable and they must
    // never own the WebSocket connection or the fetch wrapper.
    if (window !== window.top) {
        return;
    }
    const pageWindow = getPageWindow();
    if (window.__aistudioRelayActive || pageWindow.__aistudioRelayActive) {
        return;
    }
    window.__aistudioRelayActive = true;
    try {
        pageWindow.__aistudioRelayActive = true;
    } catch (e) {
        /* ignore expando write failure */
    }

    const RELAY_AUTH_INDEX = __RELAY_AUTH_INDEX__;
    const RELAY_WS_ENDPOINT = __RELAY_WS_ENDPOINT__;
    const RELAY_BOOTSTRAP_MODEL = __RELAY_BOOTSTRAP_MODEL__;
    const RELAY_UPSTREAM_CHANNEL = __RELAY_UPSTREAM_CHANNEL__;
    let RELAY_MODEL_LIMITS = {};
    try {
        RELAY_MODEL_LIMITS = __RELAY_MODEL_LIMITS__;
    } catch (e) {
        RELAY_MODEL_LIMITS = {};
    }
    const RELAY_DEFAULT_MAX_OUTPUT_TOKENS = __RELAY_DEFAULT_MAX_OUTPUT_TOKENS__;

    const RELAY_RPC_BASE =
        "https://alkalimakersuite-pa.clients6.google.com/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/";
    const RELAY_GENERATE_CONTENT_PATH =
        "/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/GenerateContent";
    const RELAY_CONTENT_TYPE = "application/json+protobuf";
    const RELAY_PUBLIC_HEADER_NAMES = [
        "x-goog-api-key",
        "x-goog-authuser",
        "x-user-agent",
        "x-aistudio-visit-id",
        "x-goog-ext-519733851-bin",
        "x-aistudio-g1-tier",
    ];
    const RELAY_IDLE_TIMEOUT_MS = 300000;

    // ---------------------------------------------------------------- Logger

    const Logger = {
        _log(level, levelName, ...messages) {
            if (level < this.currentLevel) return;
            let consolePrefix;
            if (level === this.LEVELS.INFO) {
                consolePrefix = "[ProxyClient]";
            } else {
                const levelLabel = levelName.charAt(0) + levelName.slice(1).toLowerCase();
                consolePrefix = `[ProxyClient] ${levelLabel}:`;
            }
            switch (level) {
                case this.LEVELS.ERROR:
                    console.error(consolePrefix, ...messages);
                    break;
                case this.LEVELS.WARN:
                    console.warn(consolePrefix, ...messages);
                    break;
                case this.LEVELS.DEBUG:
                    console.debug(consolePrefix, ...messages);
                    break;
                default:
                    console.log(consolePrefix, ...messages);
            }
        },
        currentLevel: 1,

        debug(...messages) {
            this._log(this.LEVELS.DEBUG, "DEBUG", ...messages);
        },

        error(...messages) {
            this._log(this.LEVELS.ERROR, "ERROR", ...messages);
        },
        info(...messages) {
            this._log(this.LEVELS.INFO, "INFO", ...messages);
        },
        LEVELS: { DEBUG: 0, ERROR: 3, INFO: 1, WARN: 2 },
        output(...messages) {
            this.info(...messages);
        },
        warn(...messages) {
            this._log(this.LEVELS.WARN, "WARN", ...messages);
        },
    };

    // ------------------------------------------------------- Connection layer

    // Deliberately NOT extending EventTarget: hardened page environments can
    // strip the derived prototype layer, breaking class methods. Callback
    // fields on a plain class are immune to that.
    class ConnectionManager {
        constructor(endpoint) {
            this.endpoint = endpoint;
            this.socket = null;
            this.isConnected = false;
            this.reconnectDelay = 5000;
            this.reconnectAttempts = 0;
            this.onConnected = null;
            this.onDisconnected = null;
            this.onMessage = null;
        }

        establish() {
            if (this.isConnected) return Promise.resolve();
            const wsUrl = `${this.endpoint}?authIndex=${RELAY_AUTH_INDEX}`;
            return new Promise((resolve, reject) => {
                try {
                    this.socket = new WebSocket(wsUrl);
                    this.socket.addEventListener("open", () => {
                        this.isConnected = true;
                        this.reconnectAttempts = 0;
                        Logger.output("✅ Connection successful!");
                        if (typeof this.onConnected === "function") this.onConnected();
                        resolve();
                    });
                    this.socket.addEventListener("close", () => {
                        const wasConnected = this.isConnected;
                        this.isConnected = false;
                        if (wasConnected) {
                            Logger.output("❌ Connection disconnected, preparing to reconnect...");
                            if (typeof this.onDisconnected === "function") this.onDisconnected();
                        }
                        this._scheduleReconnect();
                    });
                    this.socket.addEventListener("error", () => {
                        if (!this.isConnected) {
                            Logger.output(
                                "❌ WebSocket initialization failed. Please check address or browser security policy."
                            );
                            reject(new Error("WebSocket connection failed"));
                        }
                    });
                    this.socket.addEventListener("message", event => {
                        if (typeof this.onMessage === "function") this.onMessage(event.data);
                    });
                } catch (e) {
                    Logger.output(
                        "❌ WebSocket initialization failed. Please check address or browser security policy.",
                        e.message
                    );
                    reject(e);
                }
            });
        }

        transmit(data) {
            if (!this.isConnected || !this.socket) {
                Logger.debug("Cannot send data: Connection not established");
                return false;
            }
            this.socket.send(JSON.stringify(data));
            return true;
        }

        _scheduleReconnect() {
            this.reconnectAttempts++;
            setTimeout(() => {
                Logger.output(`Attempting reconnection ${this.reconnectAttempts} attempt...`);
                this.establish().catch(() => {});
            }, this.reconnectDelay);
        }
    }

    // ----------------------------------------------------------- DOM helpers

    const relayVisible = element => {
        try {
            return element.checkVisibility({ visibilityProperty: true });
        } catch (e) {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }
    };

    const relayUniqueVisible = (selector, label) => {
        const items = [...document.querySelectorAll(selector)].filter(relayVisible);
        if (items.length > 1) throw new Error(`${label} matched multiple visible targets`);
        return items[0];
    };

    const relayButtonEnabled = button => !button.matches(":disabled") && !button.closest('[aria-disabled="true"]');

    function relayDismissOverlays() {
        const selectors = [
            'ms-g1-welcome-dialog button[aria-label="Close dialog"]',
            'button[aria-label="Close guided tour"]',
            "#glue-cookie-notification-bar-1 .glue-cookie-notification-bar__reject",
        ];
        let clicked = 0;
        for (const selector of selectors) {
            try {
                const button = relayUniqueVisible(selector, "startup overlay button");
                if (button && relayButtonEnabled(button)) {
                    button.click();
                    clicked++;
                }
            } catch (e) {
                /* absent overlays are fine */
            }
        }
        return clicked;
    }

    function relayWaitFor(condition, timeoutMs, intervalMs = 500, description = "page condition") {
        const deadline = Date.now() + timeoutMs;
        return new Promise((resolve, reject) => {
            const tick = async () => {
                let value = false;
                let error = null;
                try {
                    value = await condition();
                } catch (e) {
                    value = false;
                    error = e;
                }
                if (value) {
                    resolve(true);
                    return;
                }
                if (Date.now() > deadline) {
                    reject(
                        new Error(
                            `Timed out after ${timeoutMs}ms waiting for ${description}` +
                                (error ? ` (last error: ${error.message})` : "")
                        )
                    );
                    return;
                }
                setTimeout(tick, intervalMs);
            };
            tick();
        });
    }

    function relayNormalizeNewlines(value) {
        return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }

    function relayFillPrompt(prompt) {
        const textarea = relayUniqueVisible("ms-prompt-box textarea", "prompt input box");
        if (!textarea) throw new Error("prompt input box is missing");
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(textarea, prompt);
        textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: prompt, inputType: "insertText" }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        return textarea.value;
    }

    function relayRunButtonReady() {
        try {
            const button = relayUniqueVisible("ms-run-button button", "Run button");
            return Boolean(button && relayButtonEnabled(button));
        } catch (e) {
            return false;
        }
    }

    function relayClickRun() {
        const button = relayUniqueVisible("ms-run-button button", "Run button");
        if (!button) throw new Error("Run button is missing");
        if (!relayButtonEnabled(button)) throw new Error("Run button is disabled");
        button.click();
        return true;
    }

    // ------------------------------------------------- WAA snapshot hooking

    function relayHookSnapshot() {
        const pageWindow = getPageWindow();
        const makerSuite = pageWindow.default_MakerSuite;
        if (!makerSuite) return null;
        let snapshotKey = null;
        let functionCount = 0;
        let toStringFailures = 0;
        for (const key of Object.keys(makerSuite)) {
            try {
                if (typeof makerSuite[key] !== "function") continue;
                functionCount++;
                const source = makerSuite[key].toString();
                if (source.includes(".snapshot({") && source.includes("content") && source.includes("yield")) {
                    snapshotKey = key;
                    break;
                }
            } catch (e) {
                toStringFailures++;
                /* skip unreadable members */
            }
        }
        if (!snapshotKey) {
            const logged = window.__aistudioRelayHookDiagLogged || pageWindow.__aistudioRelayHookDiagLogged;
            if (!logged) {
                window.__aistudioRelayHookDiagLogged = true;
                try {
                    pageWindow.__aistudioRelayHookDiagLogged = true;
                } catch (e) {
                    /* ignore */
                }
                Logger.warn(
                    `Snapshot scan found no match ` +
                        `(keys=${Object.keys(makerSuite).length}, functions=${functionCount}, ` +
                        `toStringFailures=${toStringFailures})`
                );
            }
            return null;
        }

        try {
            pageWindow.eval(`
                (() => {
                    const ms = window.default_MakerSuite;
                    if (!ms) return;
                    const key = ${JSON.stringify(snapshotKey)};
                    if (!ms[key] || ms[key].__aistudioRelayWrapped) return;
                    const orig = ms[key];
                    ms[key] = function(...args) {
                        const service = args[0];
                        if (service && (typeof service === 'object' || typeof service === 'function')) {
                            window.__aistudioRelayService = service;
                        }
                        return orig.apply(this, args);
                    };
                    ms[key].__aistudioRelayWrapped = true;
                    window.__aistudioRelaySnapshotKey = key;
                })();
            `);
            window.__aistudioRelaySnapshotKey = snapshotKey;
            return snapshotKey;
        } catch (e) {
            Logger.warn("[RelayHook] Content snapshot hook eval failed: " + e.message);
            return null;
        }
    }

    async function relayTakeProof(digest) {
        const pageWindow = getPageWindow();
        const makerSuite = pageWindow.default_MakerSuite;
        const service = window.__aistudioRelayService || pageWindow.__aistudioRelayService;
        const snapshotKey = window.__aistudioRelaySnapshotKey || pageWindow.__aistudioRelaySnapshotKey;
        if (!makerSuite || !service || !snapshotKey || typeof makerSuite[snapshotKey] !== "function") {
            throw new Error("WAA service is not ready");
        }
        const proof = await makerSuite[snapshotKey](service, digest);
        if (typeof proof !== "string" || !proof.startsWith("!")) {
            throw new Error("WAA proof prefix is invalid");
        }
        return proof;
    }

    // ----------------------------------------------------- Request capture

    function relayExtractHeaders(source) {
        const extracted = {};
        if (!source) return extracted;
        try {
            if (typeof source.forEach === "function") {
                source.forEach((value, key) => {
                    extracted[String(key).toLowerCase()] = String(value);
                });
                return extracted;
            }
            if (typeof source.entries === "function") {
                for (const [key, value] of source.entries()) {
                    extracted[String(key).toLowerCase()] = String(value);
                }
                return extracted;
            }
            if (
                Array.isArray(source) ||
                (typeof source[Symbol.iterator] === "function" && typeof source !== "string")
            ) {
                for (const item of source) {
                    if (Array.isArray(item) && item.length >= 2) {
                        extracted[String(item[0]).toLowerCase()] = String(item[1]);
                    }
                }
                return extracted;
            }
            if (typeof source.get === "function") {
                for (const name of RELAY_PUBLIC_HEADER_NAMES) {
                    const value = source.get(name);
                    if (value !== null && value !== undefined) {
                        extracted[name.toLowerCase()] = String(value);
                    }
                }
                for (const name of ["content-type", "authorization"]) {
                    const value = source.get(name);
                    if (value !== null && value !== undefined) {
                        extracted[name.toLowerCase()] = String(value);
                    }
                }
                return extracted;
            }
            if (typeof source === "object") {
                for (const key of Object.keys(source)) {
                    extracted[String(key).toLowerCase()] = String(source[key]);
                }
            }
        } catch (e) {
            /* unreadable header source */
        }
        return extracted;
    }

    function relayMatchesGenerateContent(input) {
        try {
            const raw = typeof input === "string" ? input : input && input.url;
            if (!raw) return false;
            return new URL(raw, location.href).pathname === RELAY_GENERATE_CONTENT_PATH;
        } catch (e) {
            return false;
        }
    }

    function relaySyntheticEmptyResponse() {
        return new Response("[]", {
            headers: { "Content-Type": RELAY_CONTENT_TYPE },
            status: 200,
            statusText: "OK",
        });
    }

    // eslint-disable-next-line no-unused-vars
    function relayInstallRequestCapture() {
        const pageWindow = getPageWindow();
        if (window.__aistudioRelayFetchWrapped || pageWindow.__aistudioRelayFetchWrapped) return;

        const originalFetch = pageWindow.fetch || window.fetch;
        const fetchWrapper = function (input, init) {
            if (
                !window.__aistudioRelayBypass &&
                !pageWindow.__aistudioRelayBypass &&
                relayMatchesGenerateContent(input)
            ) {
                let headers = init && init.headers;
                if (!headers && input && typeof input === "object" && input.headers) {
                    headers = input.headers;
                }
                const currentHeaders = window.__aistudioRelayHeaders || pageWindow.__aistudioRelayHeaders;
                if (headers && !currentHeaders) {
                    const extracted = relayExtractHeaders(headers);
                    window.__aistudioRelayHeaders = extracted;
                    try {
                        pageWindow.__aistudioRelayHeaders = extracted;
                    } catch (e) {
                        /* ignore */
                    }
                    Logger.output("Captured public protocol headers from the page request");
                }
                // Swallow the page's own GenerateContent calls: the relay is the
                // only generation path, and bootstrap runs must not burn quota.
                return Promise.resolve(relaySyntheticEmptyResponse());
            }
            return originalFetch.apply(this, arguments);
        };
        pageWindow.fetch = fetchWrapper;
        if (window !== pageWindow) {
            window.fetch = fetchWrapper;
        }

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        const requestURLs = new WeakMap();
        const openWrapper = function (method, url) {
            requestURLs.set(this, String(url));
            return originalOpen.apply(this, arguments);
        };
        const sendWrapper = function () {
            if (
                !window.__aistudioRelayBypass &&
                !pageWindow.__aistudioRelayBypass &&
                relayMatchesGenerateContent(requestURLs.get(this))
            ) {
                Logger.warn("Page attempted GenerateContent over XHR; intercepted without header capture");
                return Promise.resolve(relaySyntheticEmptyResponse());
            }
            return originalSend.apply(this, arguments);
        };
        XMLHttpRequest.prototype.open = openWrapper;
        XMLHttpRequest.prototype.send = sendWrapper;
        if (
            pageWindow.XMLHttpRequest &&
            pageWindow.XMLHttpRequest.prototype &&
            pageWindow.XMLHttpRequest !== XMLHttpRequest
        ) {
            pageWindow.XMLHttpRequest.prototype.open = openWrapper;
            pageWindow.XMLHttpRequest.prototype.send = sendWrapper;
        }

        window.__aistudioRelayFetchWrapped = true;
        try {
            pageWindow.__aistudioRelayFetchWrapped = true;
        } catch (e) {
            /* ignore */
        }
    }

    // ---------------------------------------------------------- Signing

    function relayInstallShaHelper() {
        const pageWindow = getPageWindow();
        if (pageWindow.__aistudioRelayShaHex) return;
        try {
            pageWindow.eval(`
                (() => {
                    if (window.__aistudioRelayShaHex) return;
                    window.__aistudioRelayShaHex = async function(algo, text) {
                        const data = new TextEncoder().encode(text);
                        const digest = await crypto.subtle.digest(algo, data);
                        const bytes = new Uint8Array(digest);
                        let hex = "";
                        for (let i = 0; i < bytes.length; i++) {
                            hex += bytes[i].toString(16).padStart(2, "0");
                        }
                        return hex;
                    };
                })();
            `);
        } catch (e) {
            /* ignore */
        }
    }

    async function relayShaHex(algorithm, text) {
        relayInstallShaHelper();
        const pageWindow = getPageWindow();
        if (typeof pageWindow.__aistudioRelayShaHex === "function") {
            try {
                return await pageWindow.__aistudioRelayShaHex(algorithm, text);
            } catch (e) {
                /* fallback to standard */
            }
        }
        const data = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest(algorithm, data);
        const bytes = new Uint8Array(digest);
        let hex = "";
        for (const byte of bytes) {
            hex += byte.toString(16).padStart(2, "0");
        }
        return hex;
    }

    function relayCookieValue(name) {
        for (const part of document.cookie.split(";")) {
            const separator = part.indexOf("=");
            if (separator < 0) continue;
            const key = part.slice(0, separator).trim();
            if (key === name) {
                return part.slice(separator + 1).trim();
            }
        }
        return null;
    }

    async function relayBuildAuthorization() {
        const timestamp = Math.floor(Date.now() / 1000);
        const origin = "https://aistudio.google.com";
        const cookies = [
            { label: "SAPISIDHASH", name: "SAPISID" },
            { label: "SAPISID1PHASH", name: "__Secure-1PAPISID" },
            { label: "SAPISID3PHASH", name: "__Secure-3PAPISID" },
        ];
        const parts = [];
        for (const item of cookies) {
            const value = relayCookieValue(item.name);
            if (!value) {
                throw new Error(`Missing required cookie: ${item.name}`);
            }
            const digest = await relayShaHex("SHA-1", `${timestamp} ${value} ${origin}`);
            parts.push(`${item.label} ${timestamp}_${digest}`);
        }
        return parts.join(" ");
    }

    // ---------------------------------------------------------- Bootstrap

    const relayState = {
        proofChain: Promise.resolve(),
        ready: false,
        readyPromise: null,
    };

    function relayWaitReady() {
        if (relayState.ready) return Promise.resolve();
        if (!relayState.readyPromise) {
            return Promise.reject(new Error("Playground relay bootstrap has not started"));
        }
        return relayState.readyPromise;
    }

    async function relayBootstrap() {
        const fail = reason => {
            Logger.error(`Playground relay bootstrap failed: ${reason}`);
            throw new Error(reason);
        };

        // 1. Wait for the prompt box (or detect the login redirect).
        Logger.output("Bootstrap: waiting for the prompt box...");
        await relayWaitFor(
            () =>
                location.hostname === "accounts.google.com" ||
                Boolean(relayUniqueVisible("ms-prompt-box textarea", "prompt box")),
            120000
        );
        if (location.hostname === "accounts.google.com") {
            fail(`redirected to Google login: ${location.href}`);
        }
        Logger.output("Bootstrap: prompt box is ready");

        // 2. Close known startup overlays.
        relayDismissOverlays();

        // 3. Locate and hook the BotGuard snapshot function.
        await relayWaitFor(() => relayHookSnapshot() !== null, 60000, 500, "WAA snapshot function");
        const snapshotKey = window.__aistudioRelaySnapshotKey || getPageWindow().__aistudioRelaySnapshotKey;
        Logger.output(`Hooked WAA snapshot function: ${snapshotKey}`);

        // 4. Fill a unique bootstrap prompt and click Run so the page exercises
        //    its own snapshot path (exposing the WAA service) and emits a
        //    GenerateContent request whose public headers we capture.
        const bootstrapPrompt = `AIStudioToAPI playground bootstrap ${Date.now()}`;
        await relayWaitFor(
            () => relayNormalizeNewlines(relayFillPrompt(bootstrapPrompt)) === relayNormalizeNewlines(bootstrapPrompt),
            30000
        );
        await relayWaitFor(relayRunButtonReady, 30000);
        relayClickRun();
        Logger.output("Bootstrap Run clicked; waiting for WAA service and protocol headers");

        // 5. Wait for both the exposed service and captured headers.
        await relayWaitFor(
            () => Boolean(window.__aistudioRelayService || getPageWindow().__aistudioRelayService),
            60000
        );
        await relayWaitFor(
            () => Boolean(window.__aistudioRelayHeaders || getPageWindow().__aistudioRelayHeaders),
            60000
        );

        const captured = window.__aistudioRelayHeaders || getPageWindow().__aistudioRelayHeaders;
        for (const name of ["x-goog-api-key", "x-goog-authuser", "x-user-agent"]) {
            if (!captured[name]) {
                fail(`captured page request is missing required header: ${name}`);
            }
        }

        relayState.ready = true;
        Logger.output(`✅ Playground relay ready (model=${RELAY_BOOTSTRAP_MODEL}, authIndex=${RELAY_AUTH_INDEX})`);
    }

    // ----------------------------------------------- Proof generation mutex

    function relayGenerateProof(binding, pagePrompt = null) {
        const textToFill = pagePrompt !== null ? pagePrompt : binding;
        const run = async () => {
            const deadline = Date.now() + 30000;
            // Sync the page prompt state to the text (reference contract).
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const filled = relayFillPrompt(textToFill);
                if (relayNormalizeNewlines(filled) === relayNormalizeNewlines(textToFill)) break;
                if (Date.now() > deadline) {
                    throw new Error("page prompt state did not sync to the binding");
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            const digest = await relayShaHex("SHA-256", binding);
            return relayTakeProof(digest);
        };
        const next = relayState.proofChain.then(run, run);
        // Keep the chain alive even if this proof generation fails.
        relayState.proofChain = next.catch(() => {});
        return next;
    }

    // ---------------------------------------------------- Request execution

    function relayParseModelFromPath(path) {
        const match = String(path || "").match(
            /^\/v1beta\/models\/(?:models\/)?([^:/]+):(generateContent|streamGenerateContent|countTokens)$/
        );
        return match ? { method: match[2], model: match[1] } : null;
    }

    function relayModelOutputLimit(model) {
        const key = String(model || "").replace(/^models\//, "");
        const limits = RELAY_MODEL_LIMITS || {};
        if (typeof limits[key] === "number" && limits[key] > 0) return limits[key];
        return RELAY_DEFAULT_MAX_OUTPUT_TOKENS;
    }

    function relayUpstreamError(status, message) {
        const error = new Error(`Google API returned error: ${status} ${message}`);
        error.status = status;
        error.__relayUpstream = true;
        return error;
    }

    class RequestProcessor {
        constructor(transmit) {
            this.transmit = transmit;
            this.activeOperations = new Map();
            this.cancelledAttempts = new Set();
            this.buildChannelBlocked = false;
        }

        _normalizeAttemptId(operationId, requestAttemptId) {
            return requestAttemptId || `${operationId}:attempt:legacy`;
        }

        _attemptKey(operationId, requestAttemptId) {
            return `${operationId}::${this._normalizeAttemptId(operationId, requestAttemptId)}`;
        }

        cancelOperation(operationId, requestAttemptId) {
            const normalizedAttemptId = this._normalizeAttemptId(operationId, requestAttemptId);
            const attemptKey = this._attemptKey(operationId, normalizedAttemptId);
            this.cancelledAttempts.add(attemptKey);
            const operation = this.activeOperations.get(operationId);
            if (operation && operation.requestAttemptId === normalizedAttemptId) {
                Logger.output(`Received cancel instruction, aborting operation #${operationId}`);
                operation.abortController.abort();
            }
            setTimeout(() => this.cancelledAttempts.delete(attemptKey), 60000);
        }

        cancelAllOperations() {
            this.activeOperations.forEach(operation => operation.abortController.abort());
            this.activeOperations.clear();
        }

        _isCancelled(operationId, attemptKey) {
            return this.cancelledAttempts.has(attemptKey);
        }

        _sendErrorResponse(error, operationId, requestAttemptId) {
            if (!operationId) return;
            let status = error.status || 504;
            // Upstream Google API errors (even if reported as 400 INVALID_ARGUMENT on one account/session)
            // are account/session/channel failures, not client parameter errors.
            // Remap upstream 400 to 503 so server-side RequestHandler initiates an immediate account switch
            // to a healthy account instead of crashing downstream client agents.
            if (error.__relayUpstream && status === 400) {
                status = 503;
            }
            this.transmit({
                event_type: "error",
                message: `Proxy browser error: ${error.message || "Unknown error"}`,
                request_attempt_id: requestAttemptId,
                request_id: operationId,
                status,
            });
            if (error.name === "AbortError") {
                Logger.output("Sent 'abort' status back to server");
            } else {
                Logger.output("Sent 'error' information back to server");
            }
        }

        _transmitHeaders(status, headers, operationId, requestAttemptId) {
            this.transmit({
                event_type: "response_headers",
                headers,
                request_attempt_id: requestAttemptId,
                request_id: operationId,
                status,
            });
        }

        _transmitChunk(data, operationId, requestAttemptId) {
            if (!data) return;
            this.transmit({
                data,
                event_type: "chunk",
                request_attempt_id: requestAttemptId,
                request_id: operationId,
            });
        }

        _transmitStreamEnd(operationId, requestAttemptId) {
            this.transmit({
                event_type: "stream_close",
                request_attempt_id: requestAttemptId,
                request_id: operationId,
            });
            Logger.output("Task completed, stream end signal sent");
        }

        async execute(requestSpec) {
            const operationId = requestSpec.request_id;
            const requestAttemptId = this._normalizeAttemptId(operationId, requestSpec.request_attempt_id);
            const attemptKey = this._attemptKey(operationId, requestAttemptId);
            const operation = { abortController: new AbortController(), requestAttemptId };
            this.activeOperations.set(operationId, operation);
            try {
                if (this._isCancelled(operationId, attemptKey)) {
                    throw new DOMException("The user aborted a request.", "AbortError");
                }
                const parsed = relayParseModelFromPath(requestSpec.path);
                if (!parsed) {
                    const error = new Error(`Playground relay does not support path: ${requestSpec.path}`);
                    error.status = 400;
                    throw error;
                }
                if (!relayState.ready) {
                    try {
                        await Promise.race([
                            relayWaitReady(),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error("Playground relay is not ready yet")), 120000)
                            ),
                        ]);
                    } catch (e) {
                        e.status = 503;
                        throw e;
                    }
                }

                let restBody;
                try {
                    restBody = JSON.parse(requestSpec.body);
                } catch (e) {
                    const error = new Error(`Invalid JSON request body: ${e.message}`);
                    error.status = 400;
                    throw error;
                }

                const alt = requestSpec.query_params && requestSpec.query_params.alt;
                const channel = (requestSpec.channel || RELAY_UPSTREAM_CHANNEL || "auto").trim().toLowerCase();
                if (parsed.method === "countTokens") {
                    await this._executeCountTokens(
                        restBody,
                        parsed.model,
                        operation,
                        operationId,
                        requestAttemptId,
                        attemptKey
                    );
                } else if (parsed.method === "generateContent") {
                    await this._executeUnaryGenerate(
                        restBody,
                        parsed.model,
                        operation,
                        operationId,
                        requestAttemptId,
                        attemptKey,
                        channel
                    );
                } else {
                    await this._executeStreamGenerate(
                        restBody,
                        parsed.model,
                        alt,
                        operation,
                        operationId,
                        requestAttemptId,
                        attemptKey,
                        channel
                    );
                }
            } catch (error) {
                this._sendErrorResponse(error, operationId, requestAttemptId);
            } finally {
                const current = this.activeOperations.get(operationId);
                if (current && current.abortController === operation.abortController) {
                    this.activeOperations.delete(operationId);
                }
            }
        }

        _canFallbackChannel(error, attemptKey) {
            if (error && error.name === "AbortError") return false;
            if (this.cancelledAttempts.has(attemptKey)) return false;
            return true;
        }

        async _executeUnaryGenerate(restBody, model, operation, operationId, requestAttemptId, attemptKey, channel) {
            if (channel === "build") {
                return this._executeBuildUnary(restBody, model, operation, operationId, requestAttemptId, attemptKey);
            }
            if (channel === "playground" || this.buildChannelBlocked) {
                return this._executePlaygroundUnary(
                    restBody,
                    model,
                    operation,
                    operationId,
                    requestAttemptId,
                    attemptKey
                );
            }
            // Auto mode: try Build channel first, seamlessly fail over to Playground channel
            try {
                await this._executeBuildUnary(restBody, model, operation, operationId, requestAttemptId, attemptKey);
            } catch (error) {
                if (
                    error &&
                    (error.status === 403 ||
                        String(error.message || "")
                            .toLowerCase()
                            .includes("permission"))
                ) {
                    this.buildChannelBlocked = true;
                    Logger.warn(
                        `[Relay] Account lacks Build API permission (403), sticking to Playground channel for future requests.`
                    );
                }
                if (this._canFallbackChannel(error, attemptKey)) {
                    Logger.warn(
                        `[Relay] Build channel failed (${error.message}), falling back to Playground channel...`
                    );
                    await this._executePlaygroundUnary(
                        restBody,
                        model,
                        operation,
                        operationId,
                        requestAttemptId,
                        attemptKey
                    );
                } else {
                    throw error;
                }
            }
        }

        async _executeStreamGenerate(
            restBody,
            model,
            alt,
            operation,
            operationId,
            requestAttemptId,
            attemptKey,
            channel
        ) {
            if (channel === "build") {
                return this._executeBuildStream(
                    restBody,
                    model,
                    alt,
                    operation,
                    operationId,
                    requestAttemptId,
                    attemptKey
                );
            }
            if (channel === "playground" || this.buildChannelBlocked) {
                return this._executePlaygroundStream(
                    restBody,
                    model,
                    alt,
                    operation,
                    operationId,
                    requestAttemptId,
                    attemptKey
                );
            }
            // Auto mode: try Build channel first, seamlessly fail over to Playground channel
            try {
                await this._executeBuildStream(
                    restBody,
                    model,
                    alt,
                    operation,
                    operationId,
                    requestAttemptId,
                    attemptKey
                );
            } catch (error) {
                if (
                    error &&
                    (error.status === 403 ||
                        String(error.message || "")
                            .toLowerCase()
                            .includes("permission"))
                ) {
                    this.buildChannelBlocked = true;
                    Logger.warn(
                        `[Relay] Account lacks Build API permission (403), sticking to Playground channel for future requests.`
                    );
                }
                if (this._canFallbackChannel(error, attemptKey)) {
                    Logger.warn(
                        `[Relay] Build channel failed (${error.message}), falling back to Playground channel...`
                    );
                    await this._executePlaygroundStream(
                        restBody,
                        model,
                        alt,
                        operation,
                        operationId,
                        requestAttemptId,
                        attemptKey
                    );
                } else {
                    throw error;
                }
            }
        }

        async _executeBuildUnary(restBody, model, operation, operationId, requestAttemptId, attemptKey) {
            const normalizedBody = normalizeBuildRequestBody(restBody);
            const bodyJson = JSON.stringify(normalizedBody);
            const rpcPath = `/v1beta/models/${model}:generateContent`;
            const { wire, binding } = encodeBuildProxyRequest(rpcPath, bodyJson, true);
            const pagePrompt = relayContentsText(restBody.contents);

            const response = await this._protectedFetch(
                "ProxyUnaryCall",
                wire,
                binding,
                pagePrompt,
                2,
                operation,
                attemptKey,
                operationId,
                requestAttemptId,
                { includeTier: true }
            );

            const rawText = await response.text();
            const jsonString = relayDecodeBuildResponseBody(parseSparseJson(rawText));
            this._transmitHeaders(200, { "content-type": "application/json" }, operationId, requestAttemptId);
            this._transmitChunk(jsonString, operationId, requestAttemptId);
            this._transmitStreamEnd(operationId, requestAttemptId);
        }

        async _executeBuildStream(restBody, model, alt, operation, operationId, requestAttemptId, attemptKey) {
            const sse = alt === "sse";
            const normalizedBody = normalizeBuildRequestBody(restBody);
            const bodyJson = JSON.stringify(normalizedBody);
            const rpcPath = `/v1beta/models/${model}:streamGenerateContent`;
            const { wire, binding } = encodeBuildProxyRequest(rpcPath, bodyJson, false);
            const pagePrompt = relayContentsText(restBody.contents);

            const response = await this._protectedFetch(
                "ProxyStreamedCall",
                wire,
                binding,
                pagePrompt,
                2,
                operation,
                attemptKey,
                operationId,
                requestAttemptId,
                { includeTier: false }
            );

            const contentType = sse ? "text/event-stream" : "application/json";
            this._transmitHeaders(200, { "content-type": contentType }, operationId, requestAttemptId);
            if (!sse) {
                this._transmitChunk("[", operationId, requestAttemptId);
            }
            let first = true;
            await this._consumeFrames(response, attemptKey, frameText => {
                const parsed = parseSparseJson(frameText);
                const jsonString = relayDecodeBuildResponseBody(parsed);
                if (sse) {
                    this._transmitChunk(`data: ${jsonString}\n\n`, operationId, requestAttemptId);
                } else {
                    this._transmitChunk(`${first ? "" : ","}${jsonString}\n`, operationId, requestAttemptId);
                    first = false;
                }
            });
            if (!sse) {
                this._transmitChunk("]", operationId, requestAttemptId);
            }
            this._transmitStreamEnd(operationId, requestAttemptId);
        }

        async _executePlaygroundUnary(restBody, model, operation, operationId, requestAttemptId, attemptKey) {
            const encoded = encodeGenerateContentRequest(restBody, model, {
                defaultMaxOutputTokens: RELAY_DEFAULT_MAX_OUTPUT_TOKENS,
                modelOutputLimit: relayModelOutputLimit(model),
            });
            const response = await this._protectedFetch(
                "GenerateContent",
                encoded.wire,
                encoded.binding,
                null,
                4,
                operation,
                attemptKey,
                operationId,
                requestAttemptId,
                { includeTier: true }
            );
            const decoder = new RelayFrameDecoder(model);
            const chunks = [];
            await this._consumeFrames(response, attemptKey, frameText => {
                const chunk = decoder.decode(parseSparseJson(frameText));
                if (chunk) chunks.push(chunk);
            });
            if (!decoder.finished) {
                throw new Error("Upstream stream ended without a finish frame");
            }
            const merged = decoder.mergeUnary(chunks);
            this._transmitHeaders(200, { "content-type": "application/json" }, operationId, requestAttemptId);
            this._transmitChunk(JSON.stringify(merged), operationId, requestAttemptId);
            this._transmitStreamEnd(operationId, requestAttemptId);
        }

        async _executePlaygroundStream(restBody, model, alt, operation, operationId, requestAttemptId, attemptKey) {
            const sse = alt === "sse";
            const encoded = encodeGenerateContentRequest(restBody, model, {
                defaultMaxOutputTokens: RELAY_DEFAULT_MAX_OUTPUT_TOKENS,
                modelOutputLimit: relayModelOutputLimit(model),
            });
            const response = await this._protectedFetch(
                "GenerateContent",
                encoded.wire,
                encoded.binding,
                null,
                4,
                operation,
                attemptKey,
                operationId,
                requestAttemptId,
                { includeTier: true }
            );
            const decoder = new RelayFrameDecoder(model);
            const contentType = sse ? "text/event-stream" : "application/json";
            this._transmitHeaders(200, { "content-type": contentType }, operationId, requestAttemptId);
            if (!sse) {
                this._transmitChunk("[", operationId, requestAttemptId);
            }
            let first = true;
            let finished = false;
            await this._consumeFrames(response, attemptKey, frameText => {
                const chunk = decoder.decode(parseSparseJson(frameText));
                if (!chunk) return;
                if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].finishReason) {
                    finished = true;
                }
                const json = JSON.stringify(chunk);
                if (sse) {
                    this._transmitChunk(`data: ${json}\n\n`, operationId, requestAttemptId);
                } else {
                    this._transmitChunk(`${first ? "" : ","}${json}\n`, operationId, requestAttemptId);
                    first = false;
                }
            });
            if (!sse) {
                this._transmitChunk("]", operationId, requestAttemptId);
            }
            if (!finished) {
                throw new Error("Upstream stream ended without a finish frame");
            }
            this._transmitStreamEnd(operationId, requestAttemptId);
        }

        async _executeCountTokens(restBody, model, operation, operationId, requestAttemptId, attemptKey) {
            const wire = encodeCountTokensRequest(restBody, model);
            const response = await this._protectedFetch(
                "CountTokens",
                wire,
                null,
                null,
                0,
                operation,
                attemptKey,
                operationId,
                requestAttemptId,
                { includeTier: true }
            );
            const text = await response.text();
            const parsed = parseCountTokensResponse(text);
            this._transmitHeaders(200, { "content-type": "application/json" }, operationId, requestAttemptId);
            this._transmitChunk(JSON.stringify(parsed), operationId, requestAttemptId);
            this._transmitStreamEnd(operationId, requestAttemptId);
        }

        /**
         * Send an encoded wire array upstream with fresh proof (binding != null)
         * and the captured protocol headers, guarding against idle timeouts and
         * cancellations. Returns the fetch Response on HTTP 200.
         */
        async _protectedFetch(
            method,
            wire,
            binding,
            pagePrompt,
            proofIndex,
            operation,
            attemptKey,
            operationId,
            requestAttemptId,
            { includeTier = true } = {}
        ) {
            if (binding !== null) {
                const proof = await relayGenerateProof(binding, pagePrompt);
                wire[proofIndex] = proof;
            }
            const pageWindow = getPageWindow();
            const headers = { Accept: "*/*", "Content-Type": RELAY_CONTENT_TYPE };
            headers.Authorization = await relayBuildAuthorization();
            const captured = window.__aistudioRelayHeaders || pageWindow.__aistudioRelayHeaders || {};
            for (const name of RELAY_PUBLIC_HEADER_NAMES) {
                if (name === "x-aistudio-g1-tier" && !includeTier) continue;
                if (captured[name]) headers[name] = captured[name];
            }

            const idleGuard = { reject: null, timer: null };
            const resetIdle = () => {
                if (idleGuard.timer) clearTimeout(idleGuard.timer);
                idleGuard.timer = setTimeout(() => {
                    operation.abortController.abort();
                    idleGuard.reject(
                        Object.assign(new Error("Timeout: 300 seconds without receiving any data"), { status: 504 })
                    );
                }, RELAY_IDLE_TIMEOUT_MS);
            };
            const idlePromise = new Promise((_, reject) => {
                idleGuard.reject = reject;
            });
            resetIdle();

            let response;
            try {
                window.__aistudioRelayBypass = true;
                if (pageWindow !== window) {
                    pageWindow.__aistudioRelayBypass = true;
                }
                response = await Promise.race([
                    fetch(RELAY_RPC_BASE + method, {
                        body: JSON.stringify(wire),
                        credentials: "include",
                        headers,
                        method: "POST",
                        signal: operation.abortController.signal,
                    }),
                    idlePromise,
                ]);
            } finally {
                window.__aistudioRelayBypass = false;
                if (pageWindow !== window) {
                    pageWindow.__aistudioRelayBypass = false;
                }
                if (idleGuard.timer) clearTimeout(idleGuard.timer);
            }

            if (!response.ok) {
                let upstreamMessage = response.statusText || "";
                try {
                    const errorText = await response.text();
                    const rpcError = parseRpcErrorBody(errorText);
                    if (rpcError && rpcError.message) {
                        upstreamMessage = rpcError.message;
                    } else if (errorText) {
                        upstreamMessage = errorText.slice(0, 500);
                    }
                } catch (e) {
                    /* keep statusText */
                }
                throw relayUpstreamError(response.status, upstreamMessage);
            }
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("json+protobuf")) {
                throw new Error(`Upstream returned unexpected Content-Type: ${contentType}`);
            }

            // Attach idle-reset so the timeout also guards streaming reads; the
            // consumer must clear the timer when the stream ends.
            response.__relayResetIdle = resetIdle;
            response.__relayClearIdle = () => {
                if (idleGuard.timer) clearTimeout(idleGuard.timer);
            };
            return response;
        }

        async _consumeFrames(response, attemptKey, onFrame) {
            const resetIdle = response.__relayResetIdle;
            const extractor = new RelayFrameExtractor();
            const reader = response.body.getReader();
            const textDecoder = new TextDecoder();
            try {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    if (this.cancelledAttempts.has(attemptKey)) {
                        throw new DOMException("The user aborted a request.", "AbortError");
                    }
                    const { done, value } = await reader.read();
                    if (resetIdle) resetIdle();
                    if (done) break;
                    extractor.push(textDecoder.decode(value, { stream: true }));
                    for (const frameText of extractor.takeFrames()) {
                        onFrame(frameText);
                    }
                }
                extractor.push(textDecoder.decode());
                for (const frameText of extractor.takeFrames()) {
                    onFrame(frameText);
                }
                extractor.close();
            } finally {
                if (response.__relayClearIdle) {
                    response.__relayClearIdle();
                }
                try {
                    await reader.cancel();
                } catch (e) {
                    /* reader may already be closed */
                }
            }
        }
    }

    // ------------------------------------------------------------- System

    class PlaygroundRelaySystem {
        constructor() {
            this.connectionManager = new ConnectionManager(RELAY_WS_ENDPOINT);
            this.requestProcessor = new RequestProcessor(data => this.connectionManager.transmit(data));
            this._setupEventHandlers();
        }

        _setupEventHandlers() {
            this.connectionManager.onMessage = data => this._handleIncomingMessage(data);
            this.connectionManager.onDisconnected = () => this.requestProcessor.cancelAllOperations();
        }

        async initialize() {
            Logger.output(`Playground relay starting (authIndex=${RELAY_AUTH_INDEX})`);
            if (typeof this.connectionManager.establish !== "function") {
                const proto = Object.getPrototypeOf(this.connectionManager);
                throw new Error(
                    `ConnectionManager.establish missing ` +
                        `(ctor=${proto && proto.constructor ? proto.constructor.name : "?"}, ` +
                        `keys=${Object.getOwnPropertyNames(Object.getPrototypeOf(proto) || {}).slice(0, 8)})`
                );
            }
            // Headers are captured non-intrusively via Playwright page.on("request")
            // relayInstallRequestCapture();
            relayState.readyPromise = relayBootstrap();
            try {
                await this.connectionManager.establish();
                Logger.output("System initialization complete, waiting for server instructions...");
            } catch (error) {
                Logger.output("System initialization failed:", error.message);
            }
            // Bootstrap continues in the background; requests queue until ready.
            relayState.readyPromise.catch(e => {
                Logger.error(`Relay bootstrap failed (${e.message}), will keep retrying after page reload`);
            });
        }

        async _handleIncomingMessage(messageData) {
            let requestSpec = {};
            try {
                requestSpec = JSON.parse(messageData);
                switch (requestSpec.event_type) {
                    case "cancel_request":
                        this.requestProcessor.cancelOperation(requestSpec.request_id, requestSpec.request_attempt_id);
                        break;
                    case "set_log_level":
                        if (Logger.LEVELS[requestSpec.level] !== undefined) {
                            Logger.currentLevel = Logger.LEVELS[requestSpec.level];
                            Logger.info(`Log level changed to: ${requestSpec.level}`);
                        } else {
                            Logger.warn(`Invalid log level: ${requestSpec.level}`);
                        }
                        break;
                    default:
                        Logger.output(`Received request: ${requestSpec.method} ${requestSpec.path}`);
                        await this.requestProcessor.execute(requestSpec);
                        break;
                }
            } catch (error) {
                Logger.output("Message processing error:", error.message);
                if (requestSpec.request_id && requestSpec.event_type !== "cancel_request") {
                    this.requestProcessor._sendErrorResponse(
                        error,
                        requestSpec.request_id,
                        requestSpec.request_attempt_id
                    );
                }
            }
        }
    }

    const system = new PlaygroundRelaySystem();
    system.initialize();
})();
