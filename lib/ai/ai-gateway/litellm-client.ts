import { getConfig } from "../../config";
import { EmbeddingResponse } from "./types";

export class LiteLLMClient {
  constructor(
    private baseURL: string,
    private apiKey: string,
    private userId: string
  ) {}

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await fetch(`${this.baseURL}/v1/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: getConfig().DEFAULT_EMBEDDING_MODEL,
          input: texts,
          tags: [`userId:${this.userId}`],
        }),
      });

      if (!response.ok) {
        throw new Error(`Error fetching embeddings: ${response.statusText}`);
      }

      const data: EmbeddingResponse = await response.json();

      // Extract embeddings from response
      const embeddings = data.data.map((item) => item.embedding);

      return embeddings;
    } catch (error) {
      console.error("Error getting embeddings:", error);
      throw error;
    }
  }
}
