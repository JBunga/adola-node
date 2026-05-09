const DEFAULT_BASE_URL = "https://api.adola.app";
const USER_AGENT = "adola-node/0.1.0";
export class AdolaAPIError extends Error {
    statusCode;
    requestId;
    response;
    constructor(message, options = {}) {
        super(message);
        this.name = "AdolaAPIError";
        this.statusCode = options.statusCode;
        this.requestId = options.requestId;
        this.response = options.response;
    }
}
export class Adola {
    apiKey;
    baseUrl;
    timeoutMs;
    fetchImpl;
    constructor(options = {}) {
        const apiKey = options.apiKey ?? process.env.ADOLA_API_KEY;
        if (!apiKey) {
            throw new Error("apiKey or ADOLA_API_KEY is required");
        }
        const fetchImpl = options.fetch ?? globalThis.fetch;
        if (!fetchImpl) {
            throw new Error("fetch is required; use Node.js 18+ or pass a fetch implementation");
        }
        this.apiKey = apiKey;
        this.baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.ADOLA_BASE_URL ?? DEFAULT_BASE_URL);
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.fetchImpl = fetchImpl;
    }
    models() {
        return this.request("GET", "/v1/models");
    }
    compress(request) {
        if (!request.input && (!request.spans || request.spans.length === 0)) {
            throw new Error("input or spans is required");
        }
        return this.request("POST", "/v1/compress", request);
    }
    batchCompress(requests) {
        if (requests.length === 0) {
            throw new Error("requests must not be empty");
        }
        return this.request("POST", "/v1/batch/compress", { requests });
    }
    async request(method, path, body) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                    "User-Agent": USER_AGENT,
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal,
            });
            if (response.ok) {
                return (await response.json());
            }
            throw new AdolaAPIError(await errorMessage(response), {
                statusCode: response.status,
                requestId: response.headers.get("x-request-id") ?? undefined,
                response,
            });
        }
        catch (error) {
            if (error instanceof AdolaAPIError) {
                throw error;
            }
            if (error instanceof DOMException && error.name === "AbortError") {
                throw new AdolaAPIError("Request timed out");
            }
            throw new AdolaAPIError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
async function errorMessage(response) {
    const text = await response.text();
    if (!text) {
        return response.statusText;
    }
    try {
        const body = JSON.parse(text);
        if (typeof body.detail === "string") {
            return body.detail;
        }
        if (Array.isArray(body.detail)) {
            const messages = body.detail
                .map((item) => (isRecord(item) && typeof item.msg === "string" ? item.msg : undefined))
                .filter((message) => Boolean(message));
            if (messages.length > 0) {
                return messages.join("; ");
            }
        }
    }
    catch {
        return text;
    }
    return text;
}
function normalizeBaseUrl(baseUrl) {
    return baseUrl.replace(/\/+$/, "");
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
