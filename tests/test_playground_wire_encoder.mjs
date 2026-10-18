/**
 * File: tests/test_playground_wire_encoder.mjs
 * Description: Unit tests for src/relay/playground-wire-encoder.js (REST -> wire).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
    encodeGenerateContentRequest,
    encodeCountTokensRequest,
    encodeBuildProxyRequest,
    normalizeBuildRequestBody,
    relayContentsText,
    relayEncodeWireStructJSON,
    relayEncodeJSONSchema,
    relayProjectToolSchema,
    relayNormalizeBase64,
} = require("../src/relay/playground-wire-encoder.js");

test("encodes a plain chat request with system instruction and defaults", () => {
    const { wire, binding } = encodeGenerateContentRequest(
        {
            contents: [{ parts: [{ text: "Hello" }], role: "user" }],
            generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
            systemInstruction: { parts: [{ text: "You are helpful" }], role: "user" },
        },
        "gemini-3.6-flash",
        { defaultMaxOutputTokens: 8192 }
    );

    assert.equal(wire[0], "models/gemini-3.6-flash");
    // contents = [ [[null,"Hello"]], "user" ]
    assert.deepEqual(wire[1], [[[[null, "Hello"]], "user"]]);
    // Default safety: four categories, all OFF (5)
    assert.deepEqual(wire[2], [
        [null, null, 7, 5],
        [null, null, 8, 5],
        [null, null, 9, 5],
        [null, null, 10, 5],
    ]);
    assert.equal(wire[3][3], 1024);
    assert.equal(wire[3][4], 0.7);
    assert.equal(wire[3][13], 1);
    assert.equal(wire[4], null); // reserved WAA proof slot
    assert.equal(JSON.stringify(wire[5]), '[[[[null,"You are helpful"]]],"user"]');
    assert.ok(!wire[6]);
    assert.equal(wire[10], 1);
    assert.equal(binding, "Hello");
});

test("falls back to model limit for missing maxOutputTokens and clamps oversize", () => {
    const noLimit = encodeGenerateContentRequest(
        { contents: [{ parts: [{ text: "hi" }], role: "user" }], generationConfig: {} },
        "m",
        { modelOutputLimit: 65536 }
    );
    assert.equal(noLimit.wire[3][3], 65536);

    const clamped = encodeGenerateContentRequest(
        { contents: [{ parts: [{ text: "hi" }], role: "user" }], generationConfig: { maxOutputTokens: 999999 } },
        "m",
        { modelOutputLimit: 65536 }
    );
    assert.equal(clamped.wire[3][3], 65536);

    const globalDefault = encodeGenerateContentRequest(
        { contents: [{ parts: [{ text: "hi" }], role: "user" }], generationConfig: {} },
        "m",
        { defaultMaxOutputTokens: 4096 }
    );
    assert.equal(globalDefault.wire[3][3], 4096);
});

test("encodes tool functionDeclarations with projected parameter schema", () => {
    const { wire } = encodeGenerateContentRequest(
        {
            contents: [{ parts: [{ text: "weather?" }], role: "user" }],
            generationConfig: { maxOutputTokens: 100 },
            tools: [
                {
                    functionDeclarations: [
                        {
                            description: "Get weather",
                            name: "get_weather",
                            parameters: {
                                properties: { city: { description: "City name", type: "string" } },
                                required: ["city"],
                                type: "object",
                            },
                        },
                    ],
                },
            ],
        },
        "m",
        {}
    );

    const tool = wire[6][0];
    assert.equal(tool[0], null);
    const decl = tool[1][0];
    assert.equal(decl[0], "get_weather");
    assert.equal(decl[1], "Get weather");
    const params = decl[2];
    assert.equal(params[0], 6); // object
    assert.deepEqual(params[6], [["city", [1, null, "City name"]]]);
    assert.deepEqual(params[7], ["city"]);
});

test("encodes built-in google tools and server-side tool flag", () => {
    const { wire } = encodeGenerateContentRequest(
        {
            contents: [{ parts: [{ text: "search this" }], role: "user" }],
            generationConfig: { maxOutputTokens: 100 },
            toolConfig: { includeServerSideToolInvocations: true },
            tools: [{ functionDeclarations: [{ name: "ping" }] }, { googleSearch: {} }],
        },
        "m",
        {}
    );
    assert.deepEqual(wire[6][0], [null, [["ping", "", [6]]]]);
    assert.deepEqual(wire[6][1], [null, null, null, [null, [[]]]]);
    assert.deepEqual(wire[13], [null, null, true]);
});

test("toolConfig mode NONE drops tools entirely", () => {
    const { wire } = encodeGenerateContentRequest(
        {
            contents: [{ parts: [{ text: "hi" }], role: "user" }],
            generationConfig: { maxOutputTokens: 100 },
            toolConfig: { functionCallingConfig: { mode: "NONE" } },
            tools: [{ functionDeclarations: [{ name: "ping" }] }],
        },
        "m",
        {}
    );
    assert.ok(!wire[6]);
    assert.ok(!wire[13]);
});

test("encodes inline data parts and normalizes urlsafe base64 in binding", () => {
    const { wire, binding } = encodeGenerateContentRequest(
        {
            contents: [
                {
                    parts: [{ inlineData: { data: "AAECA-_", mimeType: "image/png" } }, { text: "describe" }],
                    role: "user",
                },
            ],
            generationConfig: { maxOutputTokens: 100 },
        },
        "m",
        {}
    );
    const parts = wire[1][0][0];
    assert.deepEqual(parts[0], [null, null, ["image/png", "AAECA+/="]]);
    assert.deepEqual(parts[1], [null, "describe"]);
    assert.equal(binding, "AAECA+/= describe");
});
test("encodes function call and function response parts", () => {
    const { wire } = encodeGenerateContentRequest(
        {
            contents: [
                {
                    parts: [
                        {
                            functionCall: {
                                args: { city: "Paris", days: 3, nested: { a: true } },
                                name: "get_weather",
                            },
                            thoughtSignature: "sig-abc",
                        },
                    ],
                    role: "model",
                },
                {
                    parts: [{ functionResponse: { name: "get_weather", response: { output: "sunny" } } }],
                    role: "user",
                },
            ],
            generationConfig: { maxOutputTokens: 100 },
        },
        "m",
        {}
    );

    const callPart = wire[1][0][0][0];
    assert.equal(callPart[10][0], "get_weather");
    // Struct entries are sorted by key: city, days, nested
    assert.deepEqual(callPart[10][1], [
        [
            ["city", [null, null, "Paris"]],
            ["days", [null, 3]],
            ["nested", [null, null, null, null, [[["a", [null, null, null, true]]]]]],
        ],
    ]);
    assert.equal(callPart[14], "sig-abc");

    const responsePart = wire[1][1][0][0];
    assert.equal(responsePart[11][0], "get_weather");
    assert.deepEqual(responsePart[11][1], [[["output", [null, null, "sunny"]]]]);
});

test("fills skip_thought_signature_validator for unsigned function calls", () => {
    const { wire } = encodeGenerateContentRequest(
        {
            contents: [{ parts: [{ functionCall: { args: {}, name: "ping" } }], role: "model" }],
            generationConfig: { maxOutputTokens: 100 },
        },
        "m",
        {}
    );
    assert.equal(wire[1][0][0][0][14], "skip_thought_signature_validator");
});

test("encodes thought parts and thinkingConfig levels", () => {
    const { wire } = encodeGenerateContentRequest(
        {
            contents: [{ parts: [{ text: "thinking...", thought: true }], role: "model" }],
            generationConfig: { maxOutputTokens: 100, thinkingConfig: { thinkingLevel: "HIGH" } },
        },
        "m",
        {}
    );
    const part = wire[1][0][0][0];
    assert.equal(part[1], "thinking...");
    assert.equal(part[12], true);
    assert.deepEqual(wire[3][16], [1, null, null, 3]);

    const budget = encodeGenerateContentRequest(
        {
            contents: [{ parts: [{ text: "hi" }], role: "user" }],
            generationConfig: { maxOutputTokens: 100, thinkingConfig: { thinkingBudget: 2048 } },
        },
        "m",
        {}
    );
    assert.deepEqual(budget.wire[3][16], [1, 2048]);

    const minimal = encodeGenerateContentRequest(
        {
            contents: [{ parts: [{ text: "hi" }], role: "user" }],
            generationConfig: {
                maxOutputTokens: 100,
                thinkingConfig: { includeThoughts: true, thinkingLevel: "MINIMAL" },
            },
        },
        "m",
        {}
    );
    assert.deepEqual(minimal.wire[3][16], [1, null, null, 4]);
});

test("encodes JSON schemas including nullable unions and response schemas", () => {
    const wire = relayEncodeJSONSchema({
        properties: {
            count: { minimum: 1, type: "integer" },
            tags: { items: { type: "string" }, type: "array" },
            title: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["title"],
        type: "object",
    });
    assert.equal(wire[0], 6);
    const projected = relayProjectToolSchema(wire);
    const title = projected[6].find(entry => entry[0] === "title")[1];
    assert.equal(title[0], 1); // collapsed to string
    assert.equal(title[3], true); // nullable
    const count = projected[6].find(entry => entry[0] === "count")[1];
    assert.equal(count[0], 3);
    assert.equal(count[10], 1);
    const tags = projected[6].find(entry => entry[0] === "tags")[1];
    assert.equal(tags[0], 5);
    assert.deepEqual(tags[5], [1]);
    assert.deepEqual(projected[7], ["title"]);
});

test("projects untyped schema nodes onto carrier types", () => {
    assert.deepEqual(relayProjectToolSchema(relayEncodeJSONSchema(true)), [1]);
    const projected = relayProjectToolSchema(
        relayEncodeJSONSchema({ anyOf: [{ items: { type: "string" }, type: "array" }, true] })
    );
    // Untyped union root adopts the first variant's type/items.
    assert.equal(projected[0], 5);
    assert.deepEqual(projected[5], [1]);
});

test("encodes CountTokens simple and generateContentRequest forms", () => {
    const simple = encodeCountTokensRequest({ contents: [{ parts: [{ text: "hi" }], role: "user" }] }, "gemini-x");
    assert.deepEqual(simple, ["models/gemini-x", [[[[null, "hi"]], "user"]]]);

    const full = encodeCountTokensRequest(
        {
            generateContentRequest: {
                contents: [
                    { parts: [{ text: "hi" }, { inlineData: { data: "AAA", mimeType: "image/png" } }], role: "user" },
                ],
                model: "models/gemini-x",
            },
        },
        "gemini-x"
    );
    assert.equal(full[0], "models/gemini-x");
    assert.equal(full[1], null);
    assert.equal(full[2][0], "models/gemini-x");
    assert.equal(full[2][1].length, 1);
});

test("encodes wire structs with non-object wrapping and empty objects", () => {
    assert.deepEqual(relayEncodeWireStructJSON({ a: 1 }), [[["a", [null, 1]]]]);
    assert.deepEqual(relayEncodeWireStructJSON("raw"), [[["result", [null, null, "raw"]]]]);
    assert.deepEqual(relayEncodeWireStructJSON({}), []);
    assert.deepEqual(relayEncodeWireStructJSON(null), []);
});

test("normalizes base64 padding and urlsafe alphabet", () => {
    assert.equal(relayNormalizeBase64("AAECA-_"), "AAECA+/=");
    assert.equal(relayNormalizeBase64("AAEC"), "AAEC");
    assert.equal(relayNormalizeBase64("AAEC_A"), "AAEC/A==");
});

test("encodes Build proxy requests and extracts contents text", () => {
    const contents = [
        { parts: [{ text: "Hello" }, { inlineData: { data: "abc", mimeType: "image/png" } }], role: "user" },
        { parts: [{ text: "World" }], role: "model" },
        { parts: [{ functionCall: { args: {}, name: "ping" } }], role: "user" },
    ];
    assert.equal(relayContentsText(contents), "Hello World");

    const bodyJson = JSON.stringify({ contents });
    const stream = encodeBuildProxyRequest("/v1beta/models/gemini-2.5-flash:streamGenerateContent", bodyJson, false);
    assert.deepEqual(stream.wire, ["/v1beta/models/gemini-2.5-flash:streamGenerateContent", bodyJson, null]);
    assert.equal(stream.binding, `/v1beta/models/gemini-2.5-flash:streamGenerateContent ${bodyJson}`);

    const unary = encodeBuildProxyRequest("/v1beta/models/gemini-2.5-flash:generateContent", bodyJson, true);
    assert.deepEqual(unary.wire, ["/v1beta/models/gemini-2.5-flash:generateContent", bodyJson, null, "POST"]);

    const normalized = normalizeBuildRequestBody({
        contents: [{ parts: [{ functionCall: { name: "fn" } }], role: "user" }],
        tools: [{ functionDeclarations: [{ name: "fn", parameters: { type: "object" } }] }],
    });
    assert.deepEqual(normalized.tools[0].functionDeclarations[0].parametersJsonSchema, { type: "object" });
    assert.equal(normalized.contents[0].parts[0].thoughtSignature, "skip_thought_signature_validator");
});

test("build normalization keeps only parametersJsonSchema for kilocode declarations", () => {
    const normalized = normalizeBuildRequestBody({
        contents: [{ parts: [{ text: "hi" }], role: "user" }],
        tools: [
            {
                functionDeclarations: [
                    {
                        description: "Read a file from disk",
                        name: "read_file",
                        parameters: {
                            additionalProperties: false,
                            properties: { path: { description: "Absolute path", type: "string" } },
                            required: ["path"],
                            type: "object",
                        },
                    },
                ],
            },
        ],
    });
    const decl = normalized.tools[0].functionDeclarations[0];
    assert.equal(Object.prototype.hasOwnProperty.call(decl, "parameters"), false);
    assert.deepEqual(decl.parametersJsonSchema, {
        additionalProperties: false,
        properties: { path: { description: "Absolute path", type: "string" } },
        required: ["path"],
        type: "object",
    });

    const priority = normalizeBuildRequestBody({
        contents: [{ parts: [{ text: "x" }], role: "user" }],
        tools: [
            {
                functionDeclarations: [
                    {
                        name: "a",
                        parameters: { type: "object" },
                        parametersJsonSchema: { description: null, type: "string" },
                    },
                    { name: "b", parameters: true },
                    { name: "c", parameters: {} },
                ],
            },
        ],
    });
    const decls = priority.tools[0].functionDeclarations;
    assert.equal(Object.prototype.hasOwnProperty.call(decls[0], "parameters"), false);
    assert.deepEqual(decls[0].parametersJsonSchema, { type: "string" });
    assert.equal(Object.prototype.hasOwnProperty.call(decls[1], "parameters"), false);
    assert.deepEqual(decls[1].parametersJsonSchema, { type: "object" });
    assert.equal(Object.prototype.hasOwnProperty.call(decls[2], "parameters"), false);
    assert.deepEqual(decls[2].parametersJsonSchema, { type: "object" });
});

test("encodes kilocode tool declarations as positional wire with open-schema fallback", () => {
    const rawParams = {
        additionalProperties: false,
        properties: { path: { description: "Absolute path", type: "string" } },
        required: ["path"],
        type: "object",
    };
    const nestedRaw = {
        properties: { opts: { additionalProperties: { type: "string" }, type: "object" } },
        type: "object",
    };
    const { wire } = encodeGenerateContentRequest(
        {
            contents: [{ parts: [{ text: "read it" }], role: "user" }],
            generationConfig: { maxOutputTokens: 100 },
            tools: [
                {
                    functionDeclarations: [
                        { description: "Read a file", name: "read_file", parameters: rawParams },
                        { description: "Write options", name: "write_opts", parameters: nestedRaw },
                    ],
                },
            ],
        },
        "m",
        {}
    );

    // Tools mount at generate[6] as proto positional arrays: [null, [declaration, ...]].
    const tool = wire[6][0];
    assert.equal(tool[0], null);
    const [readDecl, writeDecl] = tool[1];
    assert.deepEqual(readDecl.slice(0, 2), ["read_file", "Read a file"]);
    const params = readDecl[2];
    assert.equal(params[0], 6); // typeCode: object
    assert.equal(params[1], null); // format
    assert.equal(params[3], null); // nullable
    assert.equal(params[4], null); // enum
    assert.equal(params[5], null); // items
    assert.deepEqual(params[6], [["path", [1, null, "Absolute path"]]]);
    assert.deepEqual(params[7], ["path"]);
    // Open-schema features fall back to the raw JSON Schema in the parameters description.
    assert.equal(params[2], `\nArguments must follow this JSON Schema: ${JSON.stringify(rawParams)}`);

    assert.deepEqual(writeDecl[2][6], [["opts", [6]]]);
    assert.equal(writeDecl[2][2], `\nArguments must follow this JSON Schema: ${JSON.stringify(nestedRaw)}`);
});

test("rejects invalid or unsupported request shapes", () => {
    assert.throws(() => encodeGenerateContentRequest({ contents: [] }, "m", {}), /contents must not be empty/);
    assert.throws(
        () =>
            encodeGenerateContentRequest(
                { contents: [{ parts: [{ fileData: { fileUri: "x" } }], role: "user" }] },
                "m",
                {}
            ),
        /fileData/
    );
    assert.throws(
        () =>
            encodeGenerateContentRequest(
                {
                    contents: [{ parts: [{ text: "x" }], role: "user" }],
                    generationConfig: { maxOutputTokens: 100 },
                    tools: [{ mysteryTool: {} }],
                },
                "m",
                {}
            ),
        /unsupported tool/
    );
    assert.throws(
        () =>
            encodeGenerateContentRequest(
                {
                    contents: [{ parts: [{ text: "x" }], role: "user" }],
                    generationConfig: { maxOutputTokens: 100, temperature: 5 },
                },
                "m",
                {}
            ),
        /temperature/
    );
    assert.throws(() => encodeCountTokensRequest({ contents: [] }, "m"), /countTokens contents must not be empty/);
});
