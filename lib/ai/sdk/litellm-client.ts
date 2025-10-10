import { getConfig } from "../../config";
import { EmbeddingResponse } from "./types";
import { langfuse } from "../../clients/langfuse";

export class LiteLLMClient {
  constructor(
    private baseURL: string,
    private apiKey: string,
    private userId: string,
    private traceId?: string
  ) {}

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    // Start Langfuse generation/span for embeddings
    const generation = this.traceId
      ? langfuse.span({
          name: "embeddings-call",
          traceId: this.traceId,
          input: texts,
          metadata: {
            userId: this.userId,
            textCount: texts.length,
            baseURL: this.baseURL,
            model: getConfig().DEFAULT_EMBEDDING_MODEL,
          },
        })
      : langfuse.generation({
          name: "embeddings-call",
          model: getConfig().DEFAULT_EMBEDDING_MODEL,
          input: texts,
          metadata: {
            userId: this.userId,
            textCount: texts.length,
            baseURL: this.baseURL,
          },
        });

    try {
      console.log(
        `[LiteLLMClient] Getting embeddings for ${texts.length} texts`
      );

      // Process each text individually to work with Ollama's behavior,
      // as well as any other provider that might not support batch requests
      const embeddingPromises = texts.map(async (text, index) => {
        const textGeneration = langfuse.span({
          name: "embedding-text",
          traceId: this.traceId || generation.traceId,
          input: text,
          metadata: {
            textIndex: index,
            textLength: text.length,
            userId: this.userId,
          },
        });

        try {
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
            const errorMessage = `Error fetching embeddings: ${response.statusText}`;
            textGeneration.end({
              output: { error: errorMessage },
            });
            throw new Error(errorMessage);
          }

          const data: EmbeddingResponse = await response.json();
          const embedding = data.data[0].embedding;

          textGeneration.end({
            output: {
              embedding: embedding.slice(0, 5), // Log first 5 dimensions for debugging
              dimensions: embedding.length,
              usage: data.usage,
            },
          });

          return embedding;
        } catch (error) {
          textGeneration.end({
            output: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          throw error;
        }
      });

      const embeddings = await Promise.all(embeddingPromises);

      // Update main generation with successful result
      generation.end({
        output: {
          embeddings: embeddings.map((emb) => emb.slice(0, 5)), // Log first 5 dimensions of each embedding
          totalEmbeddings: embeddings.length,
          embeddingDimensions: embeddings[0]?.length || 0,
        },
      });

      await langfuse.flushAsync();

      console.log(
        `[LiteLLMClient] Successfully generated ${embeddings.length} embeddings`
      );
      return embeddings;
    } catch (error) {
      console.error("Error getting embeddings:", error);

      // Update generation with error
      generation.end({
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await langfuse.flushAsync();
      throw error;
    }
  }
}
