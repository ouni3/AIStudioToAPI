/**
 * File: src/relay/playground-wire-encoder.js
 * Description: Pure functions encoding Gemini REST JSON into AI Studio MakerSuite
 *              GenerateContent/CountTokens wire arrays (JSON+protobuf shape).
 *
 * Ported from the verified protocol of Mag1cFall/AIStudio2API (internal/aistudio:
 * generate.go / request.go / safety.go / tools.go / schema.go).
 *
 * This file is dual-environment:
 *   - Node (unit tests): loaded via require(), exports via module.exports.
 *   - Browser: concatenated verbatim before scripts/client/playground-relay.js,
 *     where the function declarations share the injected script scope.
 */

function RelayEncodeError(message) {
    const error = new Error(message);
    error.name = "RelayEncodeError";
    return error;
}

const RELAY_SCHEMA_TYPE_CODES = { array: 5, boolean: 4, integer: 3, number: 2, object: 6, string: 1 };

const RELAY_HARM_CATEGORY_CODES = {
    HARM_CATEGORY_CIVIC_INTEGRITY: 11,
    HARM_CATEGORY_DANGEROUS_CONTENT: 10,
    HARM_CATEGORY_HARASSMENT: 7,
    HARM_CATEGORY_HATE_SPEECH: 8,
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 9,
};

const RELAY_DEFAULT_HARM_CATEGORIES = [
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_DANGEROUS_CONTENT",
];

// Legal in Gemini API but not accepted by AI Studio models; silently ignored.
const RELAY_IGNORED_HARM_CATEGORIES = new Set([
    "HARM_CATEGORY_UNSPECIFIED",
    "HARM_CATEGORY_DEROGATORY",
    "HARM_CATEGORY_TOXICITY",
    "HARM_CATEGORY_VIOLENCE",
    "HARM_CATEGORY_SEXUAL",
    "HARM_CATEGORY_MEDICAL",
    "HARM_CATEGORY_DANGEROUS",
    "HARM_CATEGORY_IMAGE_HATE",
    "HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT",
    "HARM_CATEGORY_IMAGE_HARASSMENT",
    "HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_JAILBREAK",
]);

const RELAY_HARM_THRESHOLD_CODES = {
    BLOCK_LOW_AND_ABOVE: 1,
    BLOCK_MEDIUM_AND_ABOVE: 2,
    BLOCK_NONE: 4,
    BLOCK_ONLY_HIGH: 3,
    OFF: 5,
};

const RELAY_THINKING_LEVEL_CODES = { HIGH: 3, LOW: 1, MEDIUM: 2, MINIMAL: 4, NONE: 4 };

const RELAY_MEDIA_RESOLUTION_CODES = {
    MEDIA_RESOLUTION_HIGH: 3,
    MEDIA_RESOLUTION_LOW: 1,
    MEDIA_RESOLUTION_MEDIUM: 2,
};

function relaySetWireField(wire, index, value) {
    while (wire.length <= index) {
        wire.push(null);
    }
    wire[index] = value;
    return wire;
}

function relayNormalizeBase64(value) {
    let text = String(value || "").replace(/\s+/g, "");
    if (!text) return "";
    text = text.replace(/-/g, "+").replace(/_/g, "/");
    while (text.length % 4 !== 0) {
        text += "=";
    }
    return text;
}

// ---------- Struct (protobuf Value) encoding ----------

function relayEncodeWireValue(value) {
    if (value === null || value === undefined) return [0];
    if (typeof value === "number") return [null, value];
    if (typeof value === "string") return [null, null, value];
    if (typeof value === "boolean") return [null, null, null, value];
    if (Array.isArray(value)) {
        const items = value.map(relayEncodeWireValue);
        return [null, null, null, null, null, [items]];
    }
    if (typeof value === "object") {
        return [null, null, null, null, relayEncodeWireStruct(value)];
    }
    throw RelayEncodeError(`unsupported function argument type: ${typeof value}`);
}

function relayEncodeWireStruct(object) {
    const keys = Object.keys(object).sort();
    if (keys.length === 0) return [];
    const entries = keys.map(key => [key, relayEncodeWireValue(object[key])]);
    return [entries];
}

// Non-object JSON values are wrapped in a "result" field, mirroring the reference.
function relayEncodeWireStructJSON(value) {
    if (value === null || value === undefined) {
        return relayEncodeWireStruct({});
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return relayEncodeWireStruct(value);
    }
    return relayEncodeWireStruct({ result: value });
}

// ---------- JSON Schema encoding ----------

function relaySchemaInt(schema, name) {
    const value = schema[name];
    let number;
    if (typeof value === "string") {
        number = Number(value);
    } else if (typeof value === "number") {
        number = value;
    } else {
        throw RelayEncodeError(`schema.${name} must be a non-negative integer`);
    }
    if (!Number.isFinite(number) || number < 0 || Math.floor(number) !== number) {
        throw RelayEncodeError(`schema.${name} must be a non-negative integer`);
    }
    return number;
}

function relayNormalizeNullableVariants(schema) {
    const rawType = schema.type;
    if (Array.isArray(rawType)) {
        const nonNull = rawType.filter(name => String(name).toLowerCase() !== "null");
        const nullable = rawType.some(name => String(name).toLowerCase() === "null");
        if (nonNull.length === 0) {
            throw RelayEncodeError("schema.type must contain a non-null type");
        }
        delete schema.type;
        if (nonNull.length === 1) {
            schema.type = nonNull[0];
        } else {
            schema.anyOf = (schema.anyOf || []).concat(nonNull.map(name => ({ type: name })));
        }
        if (nullable) schema.nullable = true;
    }
    for (const name of ["anyOf", "oneOf"]) {
        const variants = schema[name];
        if (!Array.isArray(variants)) continue;
        const filtered = [];
        let nullable = false;
        for (const variant of variants) {
            if (variant === true || variant === false) {
                filtered.push(variant);
                continue;
            }
            if (variant && typeof variant === "object" && !Array.isArray(variant)) {
                const variantType = Array.isArray(variant.type) ? variant.type[0] : variant.type;
                if (String(variantType || "").toLowerCase() === "null") {
                    nullable = true;
                    continue;
                }
            }
            filtered.push(variant);
        }
        if (nullable) {
            if (filtered.length === 0) {
                throw RelayEncodeError(`schema.${name} must contain a non-null variant`);
            }
            schema[name] = filtered;
            schema.nullable = true;
        }
    }
}

function relayNormalizeConstAndMetadata(schema) {
    delete schema.title;
    delete schema.$id;
    delete schema.$comment;
    if (schema.const !== undefined) {
        if (typeof schema.const !== "string") {
            throw RelayEncodeError("schema.const only supports string values");
        }
        if (schema.type !== undefined && String(schema.type).toLowerCase() !== "string") {
            throw RelayEncodeError("schema.const only supports string type");
        }
        schema.type = "string";
        schema.enum = [schema.const];
        delete schema.const;
    }
}

function relayNormalizeItemsFalse(schema) {
    if (schema.items === false) {
        if (schema.prefixItems !== undefined) {
            throw RelayEncodeError("prefixItems combined with items=false is not supported");
        }
        if (schema.minItems !== undefined && relaySchemaInt(schema, "minItems") > 0) {
            throw RelayEncodeError("schema.items=false is incompatible with a positive minItems");
        }
        schema.items = true;
        schema.maxItems = 0;
    }
}

function relayNormalizeImplicitType(schema) {
    if (schema.type === undefined) {
        if (schema.properties !== undefined) {
            schema.type = "object";
        } else if (schema.items !== undefined || schema.prefixItems !== undefined) {
            schema.type = "array";
        } else if (
            schema.enum !== undefined ||
            schema.pattern !== undefined ||
            schema.format !== undefined ||
            schema.minLength !== undefined ||
            schema.maxLength !== undefined
        ) {
            schema.type = "string";
        }
    }
    const typeName = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    if (String(typeName || "").toLowerCase() === "array" && schema.items === undefined) {
        schema.items = true;
    }
}

function relayEncodeJSONSchema(rawSchema) {
    if (rawSchema === true) return [0];
    if (rawSchema === false) {
        throw RelayEncodeError("schema false forbids all values");
    }
    if (rawSchema === null || rawSchema === undefined || typeof rawSchema !== "object" || Array.isArray(rawSchema)) {
        throw RelayEncodeError("schema must be a JSON object or boolean");
    }

    const schema = { ...rawSchema };
    for (const key of ["type", "format", "description", "nullable", "enum", "items", "properties", "required"]) {
        if (schema[key] === null) delete schema[key];
    }
    relayNormalizeConstAndMetadata(schema);
    relayNormalizeNullableVariants(schema);
    relayNormalizeItemsFalse(schema);
    relayNormalizeImplicitType(schema);

    // Untyped schema nodes encode as type code 0 (TYPE_UNSPECIFIED) and are
    // later projected onto a carrier type by relayProjectToolSchema.
    let typeCode = 0;
    if (schema.type !== undefined) {
        const typeName = String(Array.isArray(schema.type) ? schema.type[0] : schema.type).toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(RELAY_SCHEMA_TYPE_CODES, typeName)) {
            throw RelayEncodeError(`unknown schema.type: ${schema.type}`);
        }
        typeCode = RELAY_SCHEMA_TYPE_CODES[typeName];
    }
    const wire = [typeCode];

    if (schema.format !== undefined) relaySetWireField(wire, 1, String(schema.format));
    if (schema.description !== undefined) relaySetWireField(wire, 2, String(schema.description));
    if (schema.nullable === true) relaySetWireField(wire, 3, true);
    if (schema.enum !== undefined) {
        if (!Array.isArray(schema.enum)) {
            throw RelayEncodeError("schema.enum must be an array of strings");
        }
        relaySetWireField(
            wire,
            4,
            schema.enum.map(item => String(item))
        );
    }
    if (schema.items !== undefined) {
        relaySetWireField(wire, 5, relayEncodeJSONSchema(schema.items));
    }
    for (const [name, index] of [
        ["minItems", 21],
        ["maxItems", 20],
        ["minProperties", 8],
        ["maxProperties", 9],
        ["minLength", 12],
        ["maxLength", 13],
    ]) {
        if (schema[name] !== undefined) {
            relaySetWireField(wire, index, relaySchemaInt(schema, name));
        }
    }
    if (schema.properties !== undefined && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
        const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
        const names = Object.keys(schema.properties).sort();
        const entries = [];
        for (const name of names) {
            const property = schema.properties[name];
            if (property === false && !required.includes(name)) continue;
            entries.push([name, relayEncodeJSONSchema(property)]);
        }
        if (entries.length > 0) {
            relaySetWireField(wire, 6, entries);
        }
    }
    if (schema.required !== undefined) {
        if (!Array.isArray(schema.required)) {
            throw RelayEncodeError("schema.required must be an array of strings");
        }
        relaySetWireField(wire, 7, schema.required.map(String));
    }
    if (schema.minimum !== undefined) relaySetWireField(wire, 10, Number(schema.minimum));
    if (schema.maximum !== undefined) relaySetWireField(wire, 11, Number(schema.maximum));
    if (schema.pattern !== undefined) relaySetWireField(wire, 14, String(schema.pattern));
    for (const [name, index] of [
        ["oneOf", 16],
        ["anyOf", 17],
        ["allOf", 18],
    ]) {
        if (Array.isArray(schema[name]) && schema[name].length > 0) {
            relaySetWireField(wire, index, schema[name].map(relayEncodeJSONSchema));
        }
    }
    if (schema.not !== undefined) {
        relaySetWireField(wire, 19, relayEncodeJSONSchema(schema.not));
    }
    if (schema.propertyOrdering !== undefined) {
        if (!Array.isArray(schema.propertyOrdering)) {
            throw RelayEncodeError("schema.propertyOrdering must be an array of strings");
        }
        relaySetWireField(wire, 22, schema.propertyOrdering.map(String));
    }
    return wire;
}

// Fill Playground-required carrier types for untyped schema nodes.
function relayProjectToolSchema(wire) {
    if (!Array.isArray(wire)) return wire;
    for (const index of [5, 19]) {
        if (wire.length > index && wire[index] !== null && wire[index] !== undefined) {
            relayProjectToolSchema(wire[index]);
        }
    }
    if (wire.length > 6 && wire[6] !== null && wire[6] !== undefined) {
        for (const entry of wire[6]) {
            relayProjectToolSchema(entry[1]);
        }
    }
    for (const index of [16, 17, 18]) {
        if (wire.length <= index || wire[index] === null || wire[index] === undefined) continue;
        for (const variant of wire[index]) {
            relayProjectToolSchema(variant);
        }
        if (wire[0] === 0) {
            const first = wire[index][0];
            wire[0] = first[0];
            if (first[0] === 5 && first.length > 5) {
                relaySetWireField(wire, 5, first[5]);
            }
        }
    }
    if (wire[0] === 0) {
        wire[0] = 1;
    }
    return wire;
}

function relaySchemaWireNeedsBuild(wire) {
    if (!Array.isArray(wire)) return false;
    if (wire.length > 0 && wire[0] === 0) return true;
    for (const index of [5, 19]) {
        if (wire.length > index && wire[index] !== null && wire[index] !== undefined) {
            if (relaySchemaWireNeedsBuild(wire[index])) return true;
        }
    }
    if (wire.length > 6 && wire[6] !== null && wire[6] !== undefined) {
        for (const entry of wire[6]) {
            if (relaySchemaWireNeedsBuild(entry[1])) return true;
        }
    }
    for (const index of [16, 17, 18]) {
        if (wire.length > index && wire[index] !== null && wire[index] !== undefined) {
            for (const variant of wire[index]) {
                if (relaySchemaWireNeedsBuild(variant)) return true;
            }
        }
    }
    return false;
}

const RELAY_RESPONSE_SCHEMA_NOTE = "The response must follow this JSON Schema: ";

function relayEncodeResponseSchema(rawSchema) {
    const wire = relayEncodeJSONSchema(rawSchema);
    if (!relaySchemaWireNeedsBuild(wire)) {
        return wire;
    }
    relayProjectToolSchema(wire);
    let description = "";
    if (wire.length > 2 && typeof wire[2] === "string") {
        description = wire[2];
    }
    if (!description.includes(RELAY_RESPONSE_SCHEMA_NOTE)) {
        relaySetWireField(wire, 2, `${description}\n${RELAY_RESPONSE_SCHEMA_NOTE}${JSON.stringify(rawSchema)}`);
    }
    return wire;
}

// ---------- Contents / parts ----------

function relaySetPartThoughtSignature(wire, signature) {
    if (!signature) return wire;
    relaySetWireField(wire, 14, signature);
    return wire;
}

function relayPartBindingValue(part) {
    if (typeof part.text === "string" && part.text !== "") return part.text;
    if (part.inlineData && typeof part.inlineData.data === "string") {
        return relayNormalizeBase64(part.inlineData.data);
    }
    if (part.functionCall) return "";
    if (part.functionResponse) return "";
    if (part.executableCode) return "";
    if (part.codeExecutionResult) return "";
    if (part.thoughtSignature) return "";
    return "";
}

function relayEncodePart(part) {
    if (!part || typeof part !== "object") {
        throw RelayEncodeError("content part must be an object");
    }

    const hasText = typeof part.text === "string" && part.text !== "";
    const hasInlineData = Boolean(part.inlineData);
    const hasFunctionCall = Boolean(part.functionCall);
    const hasFunctionResponse = Boolean(part.functionResponse);
    const hasExecutableCode = Boolean(part.executableCode);
    const hasCodeExecutionResult = Boolean(part.codeExecutionResult);

    const variantCount =
        (hasText ? 1 : 0) +
        (hasInlineData ? 1 : 0) +
        (hasFunctionCall ? 1 : 0) +
        (hasFunctionResponse ? 1 : 0) +
        (hasExecutableCode ? 1 : 0) +
        (hasCodeExecutionResult ? 1 : 0);

    if (variantCount === 0 && typeof part.thoughtSignature === "string" && part.thoughtSignature !== "") {
        return relaySetPartThoughtSignature([], part.thoughtSignature);
    }
    if (variantCount !== 1) {
        throw RelayEncodeError("each content part must set exactly one content variant");
    }

    if (hasText) {
        const wire = [null, part.text];
        if (part.thought === true) {
            relaySetWireField(wire, 12, true);
        }
        return relaySetPartThoughtSignature(wire, part.thoughtSignature);
    }

    if (hasInlineData) {
        const mime = part.inlineData.mimeType || part.inlineData.mime_type;
        const data = part.inlineData.data;
        if (!mime || typeof data !== "string" || data === "") {
            throw RelayEncodeError("inlineData requires mimeType and data");
        }
        return relaySetPartThoughtSignature([null, null, [mime, relayNormalizeBase64(data)]], part.thoughtSignature);
    }

    if (hasFunctionCall) {
        const call = part.functionCall;
        if (!call.name) {
            throw RelayEncodeError("functionCall requires a name");
        }
        const callWire = [call.name, relayEncodeWireStructJSON(call.args)];
        if (call.id) callWire.push(call.id);
        const wire = [];
        relaySetWireField(wire, 10, callWire);
        const signature = part.thoughtSignature || call.thoughtSignature || "skip_thought_signature_validator";
        return relaySetPartThoughtSignature(wire, signature);
    }

    if (hasFunctionResponse) {
        const response = part.functionResponse;
        if (!response.name) {
            throw RelayEncodeError("functionResponse requires a name");
        }
        const resultWire = [response.name, relayEncodeWireStructJSON(response.response)];
        if (response.id) resultWire.push(response.id);
        const wire = [];
        relaySetWireField(wire, 11, resultWire);
        return relaySetPartThoughtSignature(wire, part.thoughtSignature);
    }

    if (hasExecutableCode) {
        const languageCode = { LANGUAGE_UNSPECIFIED: 0, PYTHON: 1 }[part.executableCode.language];
        if (languageCode === undefined) {
            throw RelayEncodeError(`unknown executableCode language: ${part.executableCode.language}`);
        }
        const wire = [];
        relaySetWireField(wire, 7, [languageCode, part.executableCode.code || ""]);
        return relaySetPartThoughtSignature(wire, part.thoughtSignature);
    }

    const outcomeCode = {
        OUTCOME_DEADLINE_EXCEEDED: 3,
        OUTCOME_FAILED: 2,
        OUTCOME_OK: 1,
        OUTCOME_UNSPECIFIED: 0,
    }[part.codeExecutionResult.outcome];
    if (outcomeCode === undefined) {
        throw RelayEncodeError(`unknown codeExecutionResult outcome: ${part.codeExecutionResult.outcome}`);
    }
    const resultWire = [outcomeCode];
    const value = outcomeCode === 1 ? part.codeExecutionResult.output : part.codeExecutionResult.error;
    if (typeof value === "string" && value !== "") {
        resultWire.push(value);
    }
    const wire = [];
    relaySetWireField(wire, 8, resultWire);
    return relaySetPartThoughtSignature(wire, part.thoughtSignature);
}

function relayEncodeContent(content) {
    if (!content || !Array.isArray(content.parts) || content.parts.length === 0) {
        throw RelayEncodeError("each content must carry at least one part");
    }
    const role = String(content.role || "user").toLowerCase() === "model" ? "model" : "user";
    const parts = content.parts.map(relayEncodePart);
    return [parts, role];
}

function relayEncodeContents(contents) {
    if (!Array.isArray(contents)) {
        throw RelayEncodeError("contents must be an array");
    }
    const wire = [];
    for (const content of contents) {
        if (!content || !Array.isArray(content.parts) || content.parts.length === 0) continue;
        wire.push(relayEncodeContent(content));
    }
    return wire;
}

function relaySystemInstructionText(systemInstruction) {
    if (typeof systemInstruction === "string") return systemInstruction;
    if (systemInstruction && Array.isArray(systemInstruction.parts)) {
        return systemInstruction.parts
            .map(part => (part && typeof part.text === "string" ? part.text : ""))
            .filter(text => text !== "")
            .join("\n");
    }
    return "";
}

function relayEncodeSystemInstruction(systemText) {
    // Shape per verified reference: [ [ parts ], "user" ] with parts = [ [null, text] ].
    return [[[[null, systemText]]], "user"];
}

// ---------- Safety settings ----------

function relayResolveSafetySettings(restSettings) {
    const thresholds = new Map();
    for (const category of RELAY_DEFAULT_HARM_CATEGORIES) {
        thresholds.set(category, "OFF");
    }
    if (Array.isArray(restSettings)) {
        for (const setting of restSettings || []) {
            const category = String((setting && setting.category) || "")
                .toUpperCase()
                .trim();
            const threshold = String((setting && setting.threshold) || "")
                .toUpperCase()
                .trim();
            if (!Object.prototype.hasOwnProperty.call(RELAY_HARM_CATEGORY_CODES, category)) {
                if (RELAY_IGNORED_HARM_CATEGORIES.has(category)) continue;
                throw RelayEncodeError(`unsupported safetySettings category: ${setting && setting.category}`);
            }
            if (threshold === "" || threshold === "HARM_BLOCK_THRESHOLD_UNSPECIFIED") continue;
            if (!Object.prototype.hasOwnProperty.call(RELAY_HARM_THRESHOLD_CODES, threshold)) {
                throw RelayEncodeError(`unsupported safetySettings threshold: ${setting && setting.threshold}`);
            }
            thresholds.set(category, threshold);
        }
    }
    const wire = [];
    for (const [category, threshold] of thresholds) {
        wire.push([null, null, RELAY_HARM_CATEGORY_CODES[category], RELAY_HARM_THRESHOLD_CODES[threshold]]);
    }
    return wire;
}

// ---------- Tools ----------

// Schema keys fully projected onto the positional parameters wire. Any other
// key (e.g. additionalProperties) cannot be expressed positionally and is
// preserved by appending the raw JSON Schema to the parameters description.
const RELAY_PROJECTED_SCHEMA_KEYS = new Set([
    "$comment",
    "$id",
    "allOf",
    "anyOf",
    "const",
    "description",
    "enum",
    "format",
    "items",
    "maximum",
    "maxItems",
    "maxLength",
    "maxProperties",
    "minimum",
    "minItems",
    "minLength",
    "minProperties",
    "not",
    "nullable",
    "oneOf",
    "pattern",
    "properties",
    "propertyOrdering",
    "required",
    "title",
    "type",
]);

const RELAY_TOOL_SCHEMA_NOTE = "\nArguments must follow this JSON Schema: ";

function relaySchemaHasUnprojectedKeys(schema) {
    if (schema === null || typeof schema !== "object") return false;
    if (Array.isArray(schema)) {
        return schema.some(relaySchemaHasUnprojectedKeys);
    }
    for (const key of Object.keys(schema)) {
        if (!RELAY_PROJECTED_SCHEMA_KEYS.has(key)) return true;
    }
    for (const key of ["allOf", "anyOf", "oneOf"]) {
        const variants = schema[key];
        if (Array.isArray(variants) && variants.some(relaySchemaHasUnprojectedKeys)) return true;
    }
    if (relaySchemaHasUnprojectedKeys(schema.items)) return true;
    if (relaySchemaHasUnprojectedKeys(schema.not)) return true;
    if (schema.properties !== null && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
        for (const value of Object.values(schema.properties)) {
            if (relaySchemaHasUnprojectedKeys(value)) return true;
        }
    }
    return false;
}

function relayEncodeFunctionDeclaration(declaration) {
    if (!declaration || !declaration.name) {
        throw RelayEncodeError("function declaration requires a name");
    }
    let parameters = declaration.parameters;
    if (parameters === undefined || parameters === null || parameters === true) {
        parameters = { type: "object" };
    }
    const parametersWire = relayProjectToolSchema(relayEncodeJSONSchema(parameters));
    if (relaySchemaHasUnprojectedKeys(parameters)) {
        const description = parametersWire.length > 2 && typeof parametersWire[2] === "string" ? parametersWire[2] : "";
        if (!description.includes(RELAY_TOOL_SCHEMA_NOTE)) {
            relaySetWireField(
                parametersWire,
                2,
                `${description}${RELAY_TOOL_SCHEMA_NOTE}${JSON.stringify(parameters)}`
            );
        }
    }
    return [declaration.name, declaration.description || "", parametersWire];
}

function relayEncodeTools(restTools) {
    if (!Array.isArray(restTools) || restTools.length === 0) {
        return { hasFunctions: false, hasGoogleTools: false, wire: null };
    }
    const wire = [];
    let hasFunctions = false;
    let hasGoogleTools = false;
    let searchEncoded = false;
    let hasMaps = false;
    let hasCode = false;
    let hasUrlContext = false;

    for (const tool of restTools) {
        if (!tool || typeof tool !== "object") {
            throw RelayEncodeError("each tool must be an object");
        }
        if (Array.isArray(tool.functionDeclarations)) {
            if (tool.functionDeclarations.length > 0) {
                const declarations = tool.functionDeclarations.map(relayEncodeFunctionDeclaration);
                wire.push([null, declarations]);
                hasFunctions = true;
            }
            continue;
        }
        if (tool.codeExecution) {
            wire.push([[]]);
            hasCode = true;
            hasGoogleTools = true;
            continue;
        }
        if (tool.googleSearch || tool.googleSearchRetrieval) {
            if (!searchEncoded) {
                wire.push([null, null, null, [null, [[]]]]);
                searchEncoded = true;
            }
            hasGoogleTools = true;
            continue;
        }
        if (tool.urlContext) {
            const urlTool = [];
            relaySetWireField(urlTool, 7, [[]]);
            wire.push(urlTool);
            hasUrlContext = true;
            hasGoogleTools = true;
            continue;
        }
        if (tool.googleMaps) {
            const mapsTool = [];
            relaySetWireField(mapsTool, 10, [[]]);
            wire.push(mapsTool);
            hasMaps = true;
            hasGoogleTools = true;
            continue;
        }
        throw RelayEncodeError(`unsupported tool: ${JSON.stringify(Object.keys(tool))}`);
    }

    if (hasMaps && (hasCode || hasUrlContext)) {
        throw RelayEncodeError("googleMaps cannot be combined with codeExecution or urlContext");
    }
    if (wire.length === 0) {
        return { hasFunctions, hasGoogleTools, wire: null };
    }
    return { hasFunctions, hasGoogleTools, wire };
}

// ---------- Generation config ----------

function relayEncodeGenerationConfig(restConfig, options) {
    const config = restConfig || {};
    const wire = [];

    if (Array.isArray(config.stopSequences) && config.stopSequences.length > 0) {
        relaySetWireField(wire, 1, config.stopSequences.map(String));
    }

    const modelLimit = options && typeof options.modelOutputLimit === "number" ? options.modelOutputLimit : null;
    let maxOutput = null;
    if (typeof config.maxOutputTokens === "number" && config.maxOutputTokens > 0) {
        maxOutput = config.maxOutputTokens;
        if (modelLimit !== null) {
            maxOutput = Math.min(maxOutput, modelLimit);
        }
    } else if (modelLimit !== null) {
        maxOutput = modelLimit;
    } else if (options && typeof options.defaultMaxOutputTokens === "number" && options.defaultMaxOutputTokens > 0) {
        maxOutput = options.defaultMaxOutputTokens;
    }
    if (maxOutput === null) {
        throw RelayEncodeError("missing output token limit for generation config");
    }
    relaySetWireField(wire, 3, maxOutput);

    if (typeof config.temperature === "number") {
        if (config.temperature < 0 || config.temperature > 2) {
            throw RelayEncodeError("temperature must be between 0 and 2");
        }
        relaySetWireField(wire, 4, config.temperature);
    }
    if (typeof config.topP === "number") {
        if (config.topP < 0 || config.topP > 1) {
            throw RelayEncodeError("topP must be between 0 and 1");
        }
        relaySetWireField(wire, 5, config.topP);
    }
    if (typeof config.topK === "number" && config.topK >= 0) {
        relaySetWireField(wire, 6, config.topK);
    }
    if (typeof config.responseMimeType === "string" && config.responseMimeType !== "") {
        relaySetWireField(wire, 7, config.responseMimeType);
    }
    if (config.responseSchema !== undefined && config.responseSchema !== null) {
        relaySetWireField(wire, 8, relayEncodeResponseSchema(config.responseSchema));
    }
    relaySetWireField(wire, 13, 1);

    const thinking = config.thinkingConfig;
    if (thinking && typeof thinking === "object") {
        const levelName = thinking.thinkingLevel ? String(thinking.thinkingLevel).toUpperCase() : null;
        const levelCode = levelName ? RELAY_THINKING_LEVEL_CODES[levelName] : undefined;
        if (levelName && levelCode === undefined) {
            throw RelayEncodeError(`unknown thinkingLevel: ${thinking.thinkingLevel}`);
        }
        let thinkingWire = [1];
        if (levelCode !== undefined) {
            thinkingWire = [1, null, null, levelCode];
        }
        if (typeof thinking.thinkingBudget === "number") {
            thinkingWire = [1, thinking.thinkingBudget];
            if (levelCode !== undefined) {
                thinkingWire = [1, thinking.thinkingBudget, null, levelCode];
            }
        }
        relaySetWireField(wire, 16, thinkingWire);
    }

    if (typeof config.mediaResolution === "string" && config.mediaResolution !== "") {
        const code = RELAY_MEDIA_RESOLUTION_CODES[config.mediaResolution.toUpperCase()];
        if (code === undefined) {
            throw RelayEncodeError(`unsupported mediaResolution: ${config.mediaResolution}`);
        }
        relaySetWireField(wire, 17, code);
    }
    if (typeof config.seed === "number") {
        relaySetWireField(wire, 18, config.seed);
    }
    return wire;
}

// ---------- Top-level requests ----------

function relayWireModelName(model) {
    const trimmed = String(model || "").trim();
    return trimmed.startsWith("models/") ? trimmed : `models/${trimmed}`;
}

/**
 * Encode a Gemini REST generateContent body into the MakerSuite wire array.
 * Returns { wire, binding } where wire[4] is reserved (null) for the WAA proof.
 */
function encodeGenerateContentRequest(restBody, model, options) {
    if (!restBody || typeof restBody !== "object") {
        throw RelayEncodeError("request body must be a JSON object");
    }
    // Drive-backed files are unreachable from the playground relay.
    if (relayBodyHasFileData(restBody)) {
        throw RelayEncodeError("fileData parts are not supported by the playground relay");
    }

    const contents = relayEncodeContents(restBody.contents);
    if (contents.length === 0) {
        throw RelayEncodeError("contents must not be empty");
    }

    const safetyWire = relayResolveSafetySettings(restBody.safetySettings);
    const configWire = relayEncodeGenerationConfig(restBody.generationConfig, options || {});
    const systemText = relaySystemInstructionText(restBody.systemInstruction);

    let toolsWire = null;
    let hasFunctions = false;
    let hasGoogleTools = false;
    if (Array.isArray(restBody.tools)) {
        const toolsMode = String(restBody.toolConfig?.functionCallingConfig?.mode || "").toUpperCase();
        if (toolsMode === "NONE") {
            toolsWire = null;
        } else {
            const encoded = relayEncodeTools(restBody.tools);
            toolsWire = encoded.wire;
            hasFunctions = encoded.hasFunctions;
            hasGoogleTools = encoded.hasGoogleTools;
        }
    }
    const serverSideTools = hasFunctions && hasGoogleTools;

    const binding = [];
    for (const content of restBody.contents) {
        if (!content || !Array.isArray(content.parts) || content.parts.length === 0) continue;
        for (const part of content.parts) {
            binding.push(relayPartBindingValue(part));
        }
    }

    const wire = [];
    relaySetWireField(wire, 0, relayWireModelName(model));
    relaySetWireField(wire, 1, contents);
    if (safetyWire.length > 0) {
        relaySetWireField(wire, 2, safetyWire);
    }
    relaySetWireField(wire, 3, configWire);
    relaySetWireField(wire, 4, null);
    if (systemText !== "") {
        relaySetWireField(wire, 5, relayEncodeSystemInstruction(systemText));
    }
    if (toolsWire !== null) {
        relaySetWireField(wire, 6, toolsWire);
    }
    relaySetWireField(wire, 10, 1);
    if (serverSideTools) {
        relaySetWireField(wire, 13, [null, null, true]);
    }
    return { binding: binding.join(" "), wire };
}

function relayBodyHasFileData(restBody) {
    for (const content of restBody.contents || []) {
        for (const part of (content && content.parts) || []) {
            if (part && part.fileData) return true;
        }
    }
    return false;
}

function relayCountTokensNeedsGenerateRequest(restBody) {
    for (const content of restBody.contents || []) {
        for (const part of (content && content.parts) || []) {
            if (!part) continue;
            if (
                part.inlineData ||
                part.functionCall ||
                part.functionResponse ||
                part.executableCode ||
                part.codeExecutionResult
            ) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Encode a Gemini REST countTokens body into the MakerSuite CountTokens wire array.
 * Supports both the simple form ({contents}) and the full form ({generateContentRequest}).
 */
function encodeCountTokensRequest(restBody, model) {
    if (!restBody || typeof restBody !== "object") {
        throw RelayEncodeError("request body must be a JSON object");
    }
    const wireModel = relayWireModelName(model);

    if (restBody.generateContentRequest && typeof restBody.generateContentRequest === "object") {
        const request = restBody.generateContentRequest;
        const contents = relayEncodeContents(request.contents);
        const systemText = relaySystemInstructionText(request.systemInstruction);
        let toolsWire = null;
        if (Array.isArray(request.tools)) {
            toolsWire = relayEncodeTools(request.tools).wire;
        }
        const explicitTools = toolsWire !== null;
        const complex = systemText !== "" || explicitTools || relayCountTokensNeedsGenerateRequest(request);
        if (!complex) {
            if (contents.length === 0) {
                throw RelayEncodeError("countTokens contents must not be empty");
            }
            return [wireModel, contents];
        }
        const generate = [];
        relaySetWireField(generate, 0, wireModel);
        if (contents.length > 0) {
            relaySetWireField(generate, 1, contents);
        }
        if (systemText !== "") {
            relaySetWireField(generate, 5, relayEncodeSystemInstruction(systemText));
        }
        if (explicitTools) {
            relaySetWireField(generate, 6, toolsWire);
        }
        return [wireModel, null, generate];
    }

    const contents = relayEncodeContents(restBody.contents);
    if (contents.length === 0) {
        throw RelayEncodeError("countTokens contents must not be empty");
    }
    if (relayCountTokensNeedsGenerateRequest(restBody)) {
        const generate = [wireModel, contents];
        return [wireModel, null, generate];
    }
    return [wireModel, contents];
}

// ---------- Build channel encoding (ProxyStreamedCall / ProxyUnaryCall) ----------

/**
 * Extract all text parts across contents joined by single spaces.
 * Used as the page prompt written to the textarea for Build channel WAA proof.
 */
function relayContentsText(contents) {
    if (!Array.isArray(contents)) return "";
    const texts = [];
    for (const content of contents) {
        if (!content || !Array.isArray(content.parts)) continue;
        for (const part of content.parts) {
            if (part && typeof part.text === "string" && part.text !== "") {
                texts.push(part.text);
            }
        }
    }
    return texts.join(" ");
}

/**
 * Normalize a function parameters schema for the Build channel: null keys are
 * stripped and empty/boolean schemas collapse to a plain object schema.
 */
function relayNormalizeBuildSchema(schema) {
    if (schema === undefined || schema === null || schema === true) {
        return { type: "object" };
    }
    if (typeof schema !== "object" || Array.isArray(schema)) {
        return schema;
    }
    const normalized = { ...schema };
    for (const key of Object.keys(normalized)) {
        if (normalized[key] === null) {
            delete normalized[key];
        }
    }
    if (Object.keys(normalized).length === 0) {
        return { type: "object" };
    }
    return normalized;
}

/**
 * Normalize a Gemini REST body for Build channel:
 * 1. Ensure function declarations carry parameters solely via
 *    parametersJsonSchema (Google rejects bodies where parameters and
 *    parametersJsonSchema coexist) with normalized null-free schemas.
 * 2. Ensure unsigned function calls have a dummy thoughtSignature.
 */
function normalizeBuildRequestBody(restBody) {
    if (!restBody || typeof restBody !== "object") return restBody;
    const body = { ...restBody };
    if (Array.isArray(body.tools)) {
        body.tools = body.tools.map(tool => {
            if (!tool || !Array.isArray(tool.functionDeclarations)) return tool;
            const functionDeclarations = tool.functionDeclarations.map(decl => {
                if (!decl) return decl;
                const normalized = { ...decl };
                const rawSchema =
                    normalized.parametersJsonSchema === undefined || normalized.parametersJsonSchema === null
                        ? normalized.parameters
                        : normalized.parametersJsonSchema;
                normalized.parametersJsonSchema = relayNormalizeBuildSchema(rawSchema);
                delete normalized.parameters;
                return normalized;
            });
            return { ...tool, functionDeclarations };
        });
    }
    if (Array.isArray(body.contents)) {
        body.contents = body.contents.map(content => {
            if (!content || !Array.isArray(content.parts)) return content;
            const parts = content.parts.map(part => {
                if (part && part.functionCall && !part.thoughtSignature) {
                    return { ...part, thoughtSignature: "skip_thought_signature_validator" };
                }
                return part;
            });
            return { ...content, parts };
        });
    }
    return body;
}

/**
 * Encode a Build proxy request array:
 *   ProxyStreamedCall: [path, bodyJsonString, proof]
 *   ProxyUnaryCall:    [path, bodyJsonString, proof, "POST"]
 * Proof slot (index 2) is initialized to null and injected after WAA proof generation.
 * Binding is: `${path} ${bodyJsonString}`
 */
function encodeBuildProxyRequest(path, bodyJsonString, unary = false) {
    const cleanPath = String(path || "").startsWith("/") ? path : `/${path}`;
    const binding = `${cleanPath} ${bodyJsonString}`;
    const wire = unary ? [cleanPath, bodyJsonString, null, "POST"] : [cleanPath, bodyJsonString, null];
    return { binding, wire };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        encodeBuildProxyRequest,
        encodeCountTokensRequest,
        encodeGenerateContentRequest,
        normalizeBuildRequestBody,
        relayContentsText,
        RelayEncodeError,
        relayEncodeJSONSchema,
        relayEncodeWireStructJSON,
        relayNormalizeBase64,
        relayProjectToolSchema,
    };
}
