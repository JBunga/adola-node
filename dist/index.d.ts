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
export declare class AdolaAPIError extends Error {
    readonly statusCode?: number;
    readonly requestId?: string;
    readonly response?: Response;
    constructor(message: string, options?: {
        statusCode?: number;
        requestId?: string;
        response?: Response;
    });
}
export declare class Adola {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly fetchImpl;
    constructor(options?: AdolaOptions);
    models(): Promise<Model[]>;
    compress(request: CompressRequest): Promise<CompressResponse>;
    batchCompress(requests: CompressRequest[]): Promise<CompressResponse[]>;
    private request;
}
//# sourceMappingURL=index.d.ts.map