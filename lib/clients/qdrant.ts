import { QdrantClient } from "@qdrant/qdrant-js";
import { getConfig } from "../config";

const { QDRANT_URL, QDRANT_API_KEY } = getConfig();

// Create a wrapper class to maintain the same interface as the custom client
class QdrantHttpClient {
  private client: QdrantClient;

  constructor() {
    const url = QDRANT_URL;
    const apiKey = QDRANT_API_KEY;

    this.client = new QdrantClient({
      url: url.replace(/\/$/, ""),
      apiKey: apiKey,
    });
  }

  async getCollections(): Promise<{ collections: Array<{ name: string }> }> {
    const result = await this.client.getCollections();
    return {
      collections: result.collections.map((col) => ({ name: col.name })),
    };
  }

  async getCollection(name: string): Promise<any> {
    return await this.client.getCollection(name);
  }

  async createCollection(
    name: string,
    body: { vectors: { size: number; distance: "Cosine" | "Euclid" | "Dot" } }
  ): Promise<void> {
    await this.client.createCollection(name, {
      vectors: {
        size: body.vectors.size,
        distance: body.vectors.distance,
      },
    });
  }

  async upsert<P = any>(
    name: string,
    body: {
      points: Array<{ id: string | number; vector: number[]; payload?: P }>;
    }
  ): Promise<void> {
    await this.client.upsert(name, {
      points: body.points.map((point) => ({
        id: point.id,
        vector: point.vector,
        payload: point.payload as Record<string, unknown> | undefined,
      })),
      wait: true,
    });
  }

  async search(
    name: string,
    body: {
      vector: number[];
      filter?: any;
      limit?: number;
      with_payload?: boolean;
      score_threshold?: number;
    }
  ): Promise<Array<{ id: string | number; score: number; payload?: any }>> {
    const result = await this.client.search(name, {
      vector: body.vector,
      filter: body.filter,
      limit: body.limit,
      with_payload: body.with_payload,
      score_threshold: body.score_threshold,
    });
    return result;
  }

  async delete(name: string, body: { filter: any }): Promise<void> {
    await this.client.delete(name, {
      filter: body.filter,
      wait: true,
    });
  }
}

export const qdrantCient = new QdrantHttpClient();
