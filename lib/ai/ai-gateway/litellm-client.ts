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
      // Process each text individually to work with Ollama's behavior,
      // as well as any other provider that might not support batch requests
      const embeddingPromises = texts.map(async (text) => {
        const response = await fetch(`${this.baseURL}/v1/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: getConfig().DEFAULT_EMBEDDING_MODEL,
            input: text, // Single text, not array
            tags: [`userId:${this.userId}`],
          }),
        });

        if (!response.ok) {
          throw new Error(`Error fetching embeddings: ${response.statusText}`);
        }

        const data: EmbeddingResponse = await response.json();
        return data.data[0].embedding;
      });

      const embeddings = await Promise.all(embeddingPromises);

      return embeddings;
    } catch (error) {
      console.error("Error getting embeddings:", error);
      throw error;
    }
  }
}
