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
    z.array(z.string().min(1, "Input array items must be non-empty strings"))
  ]),
  user: z.string().optional(),
});

export const RetrievalSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required"),
  userId: z.union([z.string(), z.number()]).optional(),
  knowledgeBaseId: z.union([z.string(), z.number()]).optional(),
  documentId: z.union([z.string(), z.number()]).optional(),
  limit: z.number().int().positive().optional(),
  score_threshold: z.number().min(0).max(1).optional(),
});

// Type definitions
export type EmbeddingsRequestInput = z.infer<typeof EmbeddingsRequestSchema>;
export type RetrievalSearchRequestInput = z.infer<typeof RetrievalSearchRequestSchema>;

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
    };
  };
}

// API Client
export class VectorsGatewayClient {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async _request<T>(
    method: string,
    path: string,
    data: any = null,
    queryParams: Record<string, string> | null = null
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (queryParams) {
      Object.keys(queryParams).forEach((key) =>
        url.searchParams.append(key, queryParams[key])
      );
    }

    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url.toString(), options);
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error || "Something went wrong");
    }
    return json as T;
  }

  async getEmbeddings(
    embeddingsData: EmbeddingsRequestInput,
    userId: string
  ): Promise<EmbeddingsResponse> {
    const parsedData = EmbeddingsRequestSchema.parse(embeddingsData);
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-user-id": userId,
    };

    const options: RequestInit = {
      method: "POST",
      headers,
      body: JSON.stringify(parsedData),
    };

    const response = await fetch(`${this.baseUrl}/v1/embeddings`, options);
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error?.message || "Something went wrong");
    }
    return json as EmbeddingsResponse;
  }

  async searchRetrieval(
    searchData: RetrievalSearchRequestInput,
    userId: string
  ): Promise<RetrievalSearchResponse> {
    const parsedData = RetrievalSearchRequestSchema.parse(searchData);
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-user-id": userId,
    };

    const options: RequestInit = {
      method: "POST",
      headers,
      body: JSON.stringify(parsedData),
    };

    const response = await fetch(`${this.baseUrl}/v1/retrieval/search`, options);
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error?.message || "Something went wrong");
    }
    return json as RetrievalSearchResponse;
  }

  async healthCheck(): Promise<HealthCheckResponse> {
    return this._request<HealthCheckResponse>("GET", "/");
  }
}

export default VectorsGatewayClient;
