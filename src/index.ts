const DEFAULT_BASE_URL = "https://api.adola.app";
const USER_AGENT = "adola-node/0.1.0";

export interface CompressionOptions {
  target_ratio?: number;
  max_output_tokens?: number | null;
  keep?: number | null;
  preserve_order?: boolean;
}

export interface ProtectedOptions {
  xml_tags?: string[];
  patterns?: string[];
}

export interface Span {
  id: string;
  text: string;
  protected?: boolean;
  metadata?: Record<string, string>;
}

export interface CompressRequest {
  model?: "rose-1";
  query?: string | null;
  input?: string | null;
  spans?: Span[] | null;
  compression?: CompressionOptions;
  protected?: ProtectedOptions;
  include_spans?: boolean;
}

export interface Risk {
  level: string;
  flags: string[];
}

export interface Receipt {
  original_tokens: number;
  output_tokens: number;
  tokens_saved: number;
  compression_ratio: number;
  selected_count: number;
  total_spans: number;
  protected_tokens: number;
  latency_ms: number;
  risk: Risk;
}

export interface SelectedSpan {
  id: string;
  index: number;
  text: string;
  tokens: number;
  protected: boolean;
}

export interface CompressResponse {
  model: "rose-1";
  output: string;
  receipt: Receipt;
  selected_spans: SelectedSpan[];
}

export interface Model {
  id: "rose-1";
  name: string;
  mode: "context-compression";
  target: "production-llm-systems";
}

export interface AdolaOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class AdolaAPIError extends Error {
  readonly statusCode?: number;
  readonly requestId?: string;
  readonly response?: Response;

  constructor(
    message: string,
    options: { statusCode?: number; requestId?: string; response?: Response } = {},
  ) {
    super(message);
    this.name = "AdolaAPIError";
    this.statusCode = options.statusCode;
    this.requestId = options.requestId;
    this.response = options.response;
  }
}

export class Adola {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AdolaOptions = {}) {
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

  models(): Promise<Model[]> {
    return this.request<Model[]>("GET", "/v1/models");
  }

  compress(request: CompressRequest): Promise<CompressResponse> {
    if (!request.input && (!request.spans || request.spans.length === 0)) {
      throw new Error("input or spans is required");
    }
    return this.request<CompressResponse>("POST", "/v1/compress", request);
  }

  batchCompress(requests: CompressRequest[]): Promise<CompressResponse[]> {
    if (requests.length === 0) {
      throw new Error("requests must not be empty");
    }
    return this.request<CompressResponse[]>("POST", "/v1/batch/compress", { requests });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
        return (await response.json()) as T;
      }
      throw new AdolaAPIError(await errorMessage(response), {
        statusCode: response.status,
        requestId: response.headers.get("x-request-id") ?? undefined,
        response,
      });
    } catch (error) {
      if (error instanceof AdolaAPIError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AdolaAPIError("Request timed out");
      }
      throw new AdolaAPIError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return response.statusText;
  }
  try {
    const body = JSON.parse(text) as { detail?: unknown };
    if (typeof body.detail === "string") {
      return body.detail;
    }
    if (Array.isArray(body.detail)) {
      const messages = body.detail
        .map((item) => (isRecord(item) && typeof item.msg === "string" ? item.msg : undefined))
        .filter((message): message is string => Boolean(message));
      if (messages.length > 0) {
        return messages.join("; ");
      }
    }
  } catch {
    return text;
  }
  return text;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
