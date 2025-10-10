import { z } from "zod";
import fetch, { RequestInit } from "node-fetch";

// Zod Schemas

export const RetrievalSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required"),
  userId: z.union([z.string(), z.number()]).optional(),
  knowledgeBaseId: z.union([z.string(), z.number()]).optional(),
  documentId: z.union([z.string(), z.number()]).optional(),
  limit: z.number().int().positive().optional(),
  score_threshold: z.number().min(0).max(1).optional(),
});

export const StoreDocumentRequestSchema = z.object({
  content: z.string().min(1, "Content is required"),
  userId: z.number().int().positive("User ID must be a positive integer"),
  knowledgeBaseId: z
    .number()
    .int()
    .positive("Knowledge base ID must be a positive integer"),
  documentId: z
    .number()
    .int()
    .positive("Document ID must be a positive integer"),
});

export const DeleteDocumentRequestSchema = z.object({
  userId: z.number().int().positive("User ID must be a positive integer"),
  knowledgeBaseId: z
    .number()
    .int()
    .positive("Knowledge base ID must be a positive integer"),
});

// Type definitions
export type RetrievalSearchRequestInput = z.infer<
  typeof RetrievalSearchRequestSchema
>;
export type StoreDocumentRequestInput = z.infer<
  typeof StoreDocumentRequestSchema
>;
export type DeleteDocumentRequestInput = z.infer<
  typeof DeleteDocumentRequestSchema
>;

export interface RetrievalMatch {
  id: string;
  score: number;
  payload: Record<string, any>;
}

export interface RetrievalSearchResponse {
  query: string;
  matches: RetrievalMatch[];
}

export interface HealthCheckResponse {
  message: string;
  documentation: string;
  apiInfo: {
    endpoints: {
      embeddings: string;
      retrieval: string;
      documents: string;
    };
  };
}

export interface StoreDocumentResponse {
  message: string;
  documentId: number;
  knowledgeBaseId: number;
  userId: number;
  vectorCount: number;
}

export interface DeleteDocumentResponse {
  message: string;
  documentId: number;
  knowledgeBaseId: number;
  userId: number;
}

export interface ApiError {
  error: {
    message: string;
  };
}

// Trace Header Configuration
export interface TraceHeaders {
  traceId?: string;
  spanId?: string;
  parentTraceId?: string;
}

// Trace utilities
export class TraceUtils {
  /**
   * Generate a new trace ID (UUID v4 format)
   */
  static generateTraceId(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  /**
   * Generate a new span ID (UUID v4 format)
   */
  static generateSpanId(): string {
    return this.generateTraceId();
  }

  /**
   * Create trace headers with a new trace ID
   */
  static createTraceHeaders(traceId?: string): TraceHeaders {
    return {
      traceId: traceId || this.generateTraceId(),
    };
  }

  /**
   * Create trace headers for a child span
   */
  static createChildSpanHeaders(
    parentTraceId: string,
    spanId?: string
  ): TraceHeaders {
    return {
      traceId: parentTraceId,
      spanId: spanId || this.generateSpanId(),
      parentTraceId,
    };
  }
}

// API Client
export class VectorsGatewayClient {
  private baseUrl: string;
  private apiKey: string;
  private traceHeaders: TraceHeaders;

  constructor(
    apiKey: string,
    baseUrl: string,
    traceHeaders: TraceHeaders = {}
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.traceHeaders = traceHeaders;
  }

  /**
   * Update trace headers for this client instance
   */
  setTraceHeaders(traceHeaders: TraceHeaders): void {
    this.traceHeaders = { ...this.traceHeaders, ...traceHeaders };
  }

  /**
   * Create a new client instance with updated trace headers
   */
  withTraceHeaders(traceHeaders: TraceHeaders): VectorsGatewayClient {
    return new VectorsGatewayClient(this.apiKey, this.baseUrl, {
      ...this.traceHeaders,
      ...traceHeaders,
    });
  }

  /**
   * Get current trace headers
   */
  getTraceHeaders(): TraceHeaders {
    return { ...this.traceHeaders };
  }

  private async _request<T>(
    method: string,
    path: string,
    data: any = null,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    // Build trace headers
    const traceHeaders: Record<string, string> = {};
    if (this.traceHeaders.traceId) {
      traceHeaders["x-trace-id"] = this.traceHeaders.traceId;
    }
    if (this.traceHeaders.spanId) {
      traceHeaders["x-span-id"] = this.traceHeaders.spanId;
    }
    if (this.traceHeaders.parentTraceId) {
      traceHeaders["x-parent-trace-id"] = this.traceHeaders.parentTraceId;
    }

    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        ...traceHeaders,
        ...headers,
      },
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url.toString(), options);
    const json = await response.json();

    if (!response.ok) {
      const error = json as ApiError;
      throw new Error(
        error.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`
      );
    }
    return json as T;
  }

  /**
   * Search for similar documents using semantic search
   *
   * @param query - The search query string
   * @param userId - User ID for data isolation
   * @param knowledgeBaseId - Knowledge base ID for data isolation
   * @param options - Additional search options
   * @returns Promise with search results
   *
   * @example
   * ```typescript
   * // Basic search
   * const results = await client.searchDocuments("machine learning", 1, 1);
   *
   * // Search with trace headers
   * const clientWithTrace = client.withTraceHeaders({ traceId: "my-trace-id" });
   * const results = await clientWithTrace.searchDocuments("AI", 1, 1);
   * ```
   */
  async searchDocuments(
    query: string,
    userId: number,
    knowledgeBaseId: number,
    options: {
      documentId?: number;
      limit?: number;
      scoreThreshold?: number;
    } = {}
  ): Promise<RetrievalSearchResponse> {
    const data = RetrievalSearchRequestSchema.parse({
      query,
      userId,
      knowledgeBaseId,
      documentId: options.documentId,
      limit: options.limit,
      score_threshold: options.scoreThreshold,
    });

    return this._request<RetrievalSearchResponse>(
      "POST",
      "/v1/retrieval/search",
      data
    );
  }

  /**
   * Search within a specific document
   */
  async searchInDocument(
    query: string,
    userId: number,
    knowledgeBaseId: number,
    documentId: number,
    options: {
      limit?: number;
      scoreThreshold?: number;
    } = {}
  ): Promise<RetrievalSearchResponse> {
    return this.searchDocuments(query, userId, knowledgeBaseId, {
      documentId,
      ...options,
    });
  }

  /**
   * Search across entire knowledge base
   */
  async searchKnowledgeBase(
    query: string,
    userId: number,
    knowledgeBaseId: number,
    options: {
      limit?: number;
      scoreThreshold?: number;
    } = {}
  ): Promise<RetrievalSearchResponse> {
    return this.searchDocuments(query, userId, knowledgeBaseId, options);
  }

  /**
   * Store a document in the knowledge base
   *
   * @param content - Document content to store
   * @param userId - User ID for data isolation
   * @param knowledgeBaseId - Knowledge base ID for data isolation
   * @param documentId - Unique document identifier
   * @returns Promise with storage confirmation
   *
   * @example
   * ```typescript
   * // Basic document storage
   * const result = await client.storeDocument("Document content", 1, 1, 123);
   *
   * // Store with trace headers
   * const clientWithTrace = client.withTraceHeaders({ traceId: "my-trace-id" });
   * const result = await clientWithTrace.storeDocument("Content", 1, 1, 123);
   * ```
   */
  async storeDocument(
    content: string,
    userId: number,
    knowledgeBaseId: number,
    documentId: number
  ): Promise<StoreDocumentResponse> {
    const data = StoreDocumentRequestSchema.parse({
      content,
      userId,
      knowledgeBaseId,
      documentId,
    });

    return this._request<StoreDocumentResponse>("POST", "/v1/documents", data);
  }

  /**
   * Delete a document and all its vectors
   *
   * @param documentId - Document ID to delete
   * @param userId - User ID for data isolation
   * @param knowledgeBaseId - Knowledge base ID for data isolation
   * @returns Promise with deletion confirmation
   *
   * @example
   * ```typescript
   * // Basic document deletion
   * const result = await client.deleteDocument(123, 1, 1);
   *
   * // Delete with trace headers
   * const clientWithTrace = client.withTraceHeaders({ traceId: "my-trace-id" });
   * const result = await clientWithTrace.deleteDocument(123, 1, 1);
   * ```
   */
  async deleteDocument(
    documentId: number,
    userId: number,
    knowledgeBaseId: number
  ): Promise<DeleteDocumentResponse> {
    const data = DeleteDocumentRequestSchema.parse({
      userId,
      knowledgeBaseId,
    });

    return this._request<DeleteDocumentResponse>(
      "DELETE",
      `/v1/documents/${documentId}`,
      data
    );
  }

  /**
   * Check service health and get API information
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    return this._request<HealthCheckResponse>("GET", "/");
  }

  /**
   * Get service information and available endpoints
   */
  async getServiceInfo(): Promise<HealthCheckResponse> {
    return this.healthCheck();
  }
}

export default VectorsGatewayClient;

/**
 * Example usage with distributed tracing:
 *
 * ```typescript
 * import { VectorsGatewayClient, TraceUtils } from '@url4irl/vectors-gateway';
 *
 * // Basic client without tracing
 * const client = new VectorsGatewayClient('your-api-key', 'http://your-vectors-gateway-url');
 *
 * // Client with trace headers for distributed tracing
 * const traceId = TraceUtils.generateTraceId();
 * const clientWithTrace = client.withTraceHeaders({ traceId });
 *
 * // Store a document with tracing
 * const storeResult = await clientWithTrace.storeDocument(
 *   'This is a document about machine learning algorithms...',
 *   123, // userId
 *   456, // knowledgeBaseId
 *   789  // documentId
 * );
 *
 * // Search across knowledge base with the same trace
 * const results = await clientWithTrace.searchKnowledgeBase(
 *   'machine learning algorithms',
 *   123,
 *   456,
 *   { limit: 10, scoreThreshold: 0.8 }
 * );
 *
 * // Search within specific document with the same trace
 * const docResults = await clientWithTrace.searchInDocument(
 *   'neural networks',
 *   123,
 *   456,
 *   789, // documentId
 *   { limit: 5 }
 * );
 *
 * // Delete a document with the same trace
 * await clientWithTrace.deleteDocument(789, 123, 456);
 *
 * // All operations will be linked in the same trace in Langfuse
 * console.log('Found', results.matches.length, 'similar documents');
 * ```
 */
