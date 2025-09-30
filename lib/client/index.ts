import { z } from "zod";
import fetch, { RequestInit } from "node-fetch";

const BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:4000"
    : "https://vectors-gateway.url4irl.com";

// Zod Schemas
export const EmbeddingsRequestSchema = z.object({
  model: z.string().min(1, "Model is required"),
  input: z.union([
    z.string().min(1, "Input must be a non-empty string"),
    z.array(z.string().min(1, "Input array items must be non-empty strings")),
  ]),
  user: z.string().optional(),
  knowledgeBaseId: z
    .number()
    .int()
    .positive("Knowledge base ID must be a positive integer"),
  documentId: z
    .number()
    .int()
    .positive("Document ID must be a positive integer"),
});

export const RetrievalSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required"),
  userId: z.union([z.string(), z.number()]).optional(),
  knowledgeBaseId: z.union([z.string(), z.number()]).optional(),
  documentId: z.union([z.string(), z.number()]).optional(),
  limit: z.number().int().positive().optional(),
  score_threshold: z.number().min(0).max(1).optional(),
});

export const DeleteDocumentRequestSchema = z.object({
  userId: z.number().int().positive("User ID must be a positive integer"),
  knowledgeBaseId: z
    .number()
    .int()
    .positive("Knowledge base ID must be a positive integer"),
});

// Type definitions
export type EmbeddingsRequestInput = z.infer<typeof EmbeddingsRequestSchema>;
export type RetrievalSearchRequestInput = z.infer<
  typeof RetrievalSearchRequestSchema
>;
export type DeleteDocumentRequestInput = z.infer<
  typeof DeleteDocumentRequestSchema
>;

export interface EmbeddingData {
  object: "embedding";
  index: number;
  embedding: number[];
}

export interface EmbeddingsResponse {
  object: "list";
  data: EmbeddingData[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

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

// API Client
export class VectorsGatewayClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async _request<T>(
    method: string,
    path: string,
    data: any = null,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
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
   * Create embeddings for text using LiteLLM
   */
  async createEmbeddings(
    input: string | string[],
    model: string = "openai/bge-m3:latest",
    userId: string = "default-user",
    knowledgeBaseId: number,
    documentId: number
  ): Promise<EmbeddingsResponse> {
    const data = EmbeddingsRequestSchema.parse({
      model,
      input,
      user: userId,
      knowledgeBaseId,
      documentId,
    });

    return this._request<EmbeddingsResponse>("POST", "/v1/embeddings", data, {
      "x-user-id": userId,
    });
  }

  /**
   * Search for similar documents using semantic search
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
   * Delete a document and all its vectors
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
 * Example usage:
 *
 * ```typescript
 * import { VectorsGatewayClient } from './lib/client';
 *
 * const client = new VectorsGatewayClient('your-api-key');
 *
 * // Create embeddings
 * const embeddings = await client.createEmbeddings('Hello world');
 * // Or with custom model and user
 * const customEmbeddings = await client.createEmbeddings(
 *   'Hello world',
 *   'openai/bge-m3:latest',
 *   'user-123'
 * );
 *
 * // Search across knowledge base
 * const results = await client.searchKnowledgeBase(
 *   'machine learning algorithms',
 *   123,
 *   456,
 *   { limit: 10, scoreThreshold: 0.8 }
 * );
 *
 * // Search within specific document
 * const docResults = await client.searchInDocument(
 *   'neural networks',
 *   123,
 *   456,
 *   789, // documentId
 *   { limit: 5 }
 * );
 *
 * // Delete a document
 * await client.deleteDocument(789, 123, 456);
 *
 * // Check service health
 * const health = await client.healthCheck();
 * ```
 */
