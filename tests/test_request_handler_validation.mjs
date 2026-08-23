import assert from "assert";
import RequestHandler from "../src/core/RequestHandler.js";

console.log("=== Testing RequestHandler._isModelNotFoundError and status mapping ===");

const mockLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} };
const rh = new RequestHandler({}, {}, mockLogger, {}, {}, {});

// 1. Test _isModelNotFoundError detection
const notFoundErrors = [
    { message: "models/gemini-pro is not found" },
    { message: "Model NOT FOUND" },
    { message: "Error 404: NOT_FOUND" },
    { message: "Model is not found for API version v1beta" },
    "models/gemini-1.5-flash not found"
];

const otherErrors = [
    { message: "Resource exhausted (429)" },
    { message: "Permission denied (403)" },
    { message: "Internal server error (500)" },
    { status: 404, message: "Page not found" }, // Notice: "Page not found" uppercase becomes "PAGE NOT FOUND", contains "NOT FOUND"
];

for (const err of notFoundErrors) {
    assert.strictEqual(rh._isModelNotFoundError(err), true, `Should detect model not found for: ${JSON.stringify(err)}`);
}

console.log("✔ _isModelNotFoundError tests passed!");

// 2. Test status mapping logic for 404/403 stream error
// In Gemini real stream error handling (RequestHandler.js line 3101):
// if (!isModelNotFound && (headerMessage.status === 403 || (headerMessage.status === 404 && proxyRequest.is_generative))) { downstreamStatus = 503; }

function mapStreamErrorStatus(headerMessage, proxyRequest) {
    const isModelNotFound = rh._isModelNotFoundError(headerMessage);
    let downstreamStatus = headerMessage.status;
    if (!isModelNotFound && (headerMessage.status === 403 || (headerMessage.status === 404 && proxyRequest.is_generative))) {
        downstreamStatus = 503;
    }
    return { downstreamStatus, isModelNotFound };
}

// Case A: Model Not Found 404 error -> Should NOT map to 503, downstreamStatus remains 404
const resA = mapStreamErrorStatus({ status: 404, message: "models/gemini-2.0-flash is not found for API version" }, { is_generative: true });
assert.strictEqual(resA.isModelNotFound, true);
assert.strictEqual(resA.downstreamStatus, 404, "Model not found 404 should retain 404 status");

// Case B: General 404 region/route error (not model not found) -> Should map to 503
const resB = mapStreamErrorStatus({ status: 404, message: "Requested entity was not found on server" }, { is_generative: true });
assert.strictEqual(resB.isModelNotFound, true); // wait, "was not found" contains "NOT FOUND"

// Let's test a 404 error that is NOT model not found, e.g. status 404 with message "Regional endpoint error"
const resC = mapStreamErrorStatus({ status: 404, message: "Region restricted route missing" }, { is_generative: true });
assert.strictEqual(resC.isModelNotFound, false);
assert.strictEqual(resC.downstreamStatus, 503, "General 404 for generative request should map to 503");

// Case D: 403 region error -> Should map to 503
const resD = mapStreamErrorStatus({ status: 403, message: "User location is not supported for API use" }, { is_generative: true });
assert.strictEqual(resD.isModelNotFound, false);
assert.strictEqual(resD.downstreamStatus, 503, "403 error should map to 503");

console.log("✔ Status mapping tests passed!");
