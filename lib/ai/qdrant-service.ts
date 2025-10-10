import { qdrantCient } from "../clients/qdrant";
import { getConfig } from "../config";
import { VectorizationResult } from "./vectorization";
import { langfuse } from "../clients/langfuse";

export interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload: {
    documentId: number;
    knowledgeBaseId: number;
    userId: number;
    chunkIndex: number;
    totalChunks: number;
    content: string;
    originalContent: string;
    createdAt: string;
    [key: string]: any;
  };
}

export interface SearchResult {
  id: string;
  score: number;
  payload: QdrantPoint["payload"];
}

export class QdrantService {
  private collectionName: string;
  private vectorSize: number;
  private traceId?: string;

  constructor(
    collectionName: string = "documents",
    vectorSize: number = 1024,
    traceId?: string
  ) {
    // Include embedding model name in collection name to ensure model-specific collections
    const embeddingModel = getConfig().DEFAULT_EMBEDDING_MODEL.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    this.collectionName = `${collectionName}_${embeddingModel}`;
    this.vectorSize = vectorSize;
    this.traceId = traceId;
  }

  /**
   * Initialize the Qdrant collection
   */
  async initializeCollection(): Promise<void> {
    const generation = this.traceId
      ? langfuse.span({
          name: "qdrant-initialize-collection",
          traceId: this.traceId,
          input: {
            collectionName: this.collectionName,
            vectorSize: this.vectorSize,
          },
          metadata: {
            collectionName: this.collectionName,
            vectorSize: this.vectorSize,
          },
        })
      : langfuse.generation({
          name: "qdrant-initialize-collection",
          input: {
            collectionName: this.collectionName,
            vectorSize: this.vectorSize,
          },
          metadata: {
            collectionName: this.collectionName,
            vectorSize: this.vectorSize,
          },
        });

    try {
      console.log(
        `[QdrantService] Initializing collection: ${this.collectionName}`
      );

      // Check if collection exists
      const collections = await qdrantCient.getCollections();
      const collectionExists = collections.collections.some(
        (col) => col.name === this.collectionName
      );

      if (!collectionExists) {
        console.log(`Creating Qdrant collection: ${this.collectionName}`);
        await qdrantCient.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: "Cosine",
          },
        });

        generation.end({
          output: {
            action: "created",
            collectionName: this.collectionName,
            vectorSize: this.vectorSize,
          },
        });
      } else {
        console.log(`Qdrant collection ${this.collectionName} already exists`);

        generation.end({
          output: {
            action: "already_exists",
            collectionName: this.collectionName,
            vectorSize: this.vectorSize,
          },
        });
      }

      await langfuse.flushAsync();
    } catch (error) {
      console.error("Error initializing Qdrant collection:", error);

      generation.end({
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await langfuse.flushAsync();
      throw new Error(
        `Failed to initialize Qdrant collection: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Store vectorized document chunks in Qdrant
   */
  async storeDocumentVectors(
    vectorizationResult: VectorizationResult
  ): Promise<void> {
    const generation = this.traceId
      ? langfuse.span({
          name: "qdrant-store-vectors",
          traceId: this.traceId,
          input: {
            documentId: vectorizationResult.chunks[0]?.metadata.documentId,
            knowledgeBaseId:
              vectorizationResult.chunks[0]?.metadata.knowledgeBaseId,
            userId: vectorizationResult.chunks[0]?.metadata.userId,
            chunkCount: vectorizationResult.chunks.length,
          },
          metadata: {
            collectionName: this.collectionName,
            chunkCount: vectorizationResult.chunks.length,
            documentId: vectorizationResult.chunks[0]?.metadata.documentId,
            knowledgeBaseId:
              vectorizationResult.chunks[0]?.metadata.knowledgeBaseId,
            userId: vectorizationResult.chunks[0]?.metadata.userId,
          },
        })
      : langfuse.generation({
          name: "qdrant-store-vectors",
          input: {
            documentId: vectorizationResult.chunks[0]?.metadata.documentId,
            knowledgeBaseId:
              vectorizationResult.chunks[0]?.metadata.knowledgeBaseId,
            userId: vectorizationResult.chunks[0]?.metadata.userId,
            chunkCount: vectorizationResult.chunks.length,
          },
          metadata: {
            collectionName: this.collectionName,
            chunkCount: vectorizationResult.chunks.length,
            documentId: vectorizationResult.chunks[0]?.metadata.documentId,
            knowledgeBaseId:
              vectorizationResult.chunks[0]?.metadata.knowledgeBaseId,
            userId: vectorizationResult.chunks[0]?.metadata.userId,
          },
        });

    try {
      console.log(
        `[QdrantService] Storing ${vectorizationResult.chunks.length} vectors for document ${vectorizationResult.chunks[0]?.metadata.documentId}`
      );

      await this.initializeCollection();

      const points: QdrantPoint[] = vectorizationResult.chunks.map(
        (chunk, index) => {
          const vector = vectorizationResult.embeddings[index];

          // Validate that we have a valid vector for this chunk
          if (!vector || !Array.isArray(vector) || vector.length === 0) {
            throw new Error(
              `Missing or invalid vector for chunk ${index} (id: ${chunk.id}): ` +
                `expected array, got ${typeof vector}`
            );
          }

          return {
            id: chunk.id,
            vector: vector,
            payload: {
              documentId: chunk.metadata.documentId,
              knowledgeBaseId: chunk.metadata.knowledgeBaseId,
              userId: chunk.metadata.userId,
              chunkIndex: chunk.metadata.chunkIndex,
              totalChunks: chunk.metadata.totalChunks,
              content: chunk.content,
              originalContent: chunk.metadata.originalContent,
              createdAt: new Date().toISOString(),
            },
          };
        }
      );

      // Upsert points to Qdrant
      await qdrantCient.upsert(this.collectionName, {
        points,
      });

      console.log(
        `Stored ${points.length} vectors for document ${vectorizationResult.chunks[0]?.metadata.documentId}`
      );

      generation.end({
        output: {
          action: "stored",
          pointsStored: points.length,
          documentId: vectorizationResult.chunks[0]?.metadata.documentId,
          knowledgeBaseId:
            vectorizationResult.chunks[0]?.metadata.knowledgeBaseId,
          userId: vectorizationResult.chunks[0]?.metadata.userId,
        },
      });

      await langfuse.flushAsync();
    } catch (error) {
      console.error("Error storing document vectors:", error);

      generation.end({
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await langfuse.flushAsync();
      throw new Error(
        `Failed to store document vectors: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Search for similar documents using vector similarity
   */
  async searchSimilarDocuments(
    queryVector: number[],
    userId: number,
    knowledgeBaseId: number,
    limit: number = 10,
    scoreThreshold: number = 0.7,
    documentId?: number
  ): Promise<SearchResult[]> {
    const generation = this.traceId
      ? langfuse.span({
          name: "qdrant-search-similar",
          traceId: this.traceId,
          input: {
            userId,
            knowledgeBaseId,
            limit,
            scoreThreshold,
            documentId,
            queryVectorDimensions: queryVector.length,
          },
          metadata: {
            collectionName: this.collectionName,
            userId,
            knowledgeBaseId,
            limit,
            scoreThreshold,
            documentId,
            queryVectorDimensions: queryVector.length,
          },
        })
      : langfuse.generation({
          name: "qdrant-search-similar",
          input: {
            userId,
            knowledgeBaseId,
            limit,
            scoreThreshold,
            documentId,
            queryVectorDimensions: queryVector.length,
          },
          metadata: {
            collectionName: this.collectionName,
            userId,
            knowledgeBaseId,
            limit,
            scoreThreshold,
            documentId,
            queryVectorDimensions: queryVector.length,
          },
        });

    try {
      console.log(
        `[QdrantService] Searching for similar documents - userId: ${userId}, knowledgeBaseId: ${knowledgeBaseId}, limit: ${limit}, scoreThreshold: ${scoreThreshold}`
      );

      // Build filter conditions
      const mustConditions = [
        {
          key: "userId",
          match: { value: userId },
        },
        {
          key: "knowledgeBaseId",
          match: { value: knowledgeBaseId },
        },
      ];

      // Add documentId filter if provided
      if (documentId !== undefined) {
        mustConditions.push({
          key: "documentId",
          match: { value: documentId },
        });
      }

      const filter = {
        must: mustConditions,
      };

      const searchResult = await qdrantCient.search(this.collectionName, {
        vector: queryVector,
        filter,
        limit,
        with_payload: true,
        score_threshold: scoreThreshold,
      });

      const results = searchResult.map((result) => ({
        id: result.id as string,
        score: result.score,
        payload: result.payload as QdrantPoint["payload"],
      }));

      console.log(`[QdrantService] Found ${results.length} similar documents`);

      generation.end({
        output: {
          action: "searched",
          resultsFound: results.length,
          userId,
          knowledgeBaseId,
          documentId,
          averageScore:
            results.length > 0
              ? results.reduce((sum, r) => sum + r.score, 0) / results.length
              : 0,
          topScore:
            results.length > 0 ? Math.max(...results.map((r) => r.score)) : 0,
        },
      });

      await langfuse.flushAsync();
      return results;
    } catch (error) {
      console.error("Error searching similar documents:", error);

      generation.end({
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await langfuse.flushAsync();
      throw new Error(
        `Failed to search similar documents: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Delete all vectors for a specific document within a knowledge base
   */
  async deleteDocumentVectors(
    documentId: number,
    knowledgeBaseId: number
  ): Promise<void> {
    const generation = this.traceId
      ? langfuse.span({
          name: "qdrant-delete-document-vectors",
          traceId: this.traceId,
          input: {
            documentId,
            knowledgeBaseId,
          },
          metadata: {
            collectionName: this.collectionName,
            documentId,
            knowledgeBaseId,
          },
        })
      : langfuse.generation({
          name: "qdrant-delete-document-vectors",
          input: {
            documentId,
            knowledgeBaseId,
          },
          metadata: {
            collectionName: this.collectionName,
            documentId,
            knowledgeBaseId,
          },
        });

    try {
      console.log(
        `[QdrantService] Deleting vectors for document ${documentId} in knowledge base ${knowledgeBaseId}`
      );

      const deleteFilter = {
        must: [
          {
            key: "documentId",
            match: { value: documentId },
          },
          {
            key: "knowledgeBaseId",
            match: { value: knowledgeBaseId },
          },
        ],
      };

      await qdrantCient.delete(this.collectionName, {
        filter: deleteFilter,
      });

      console.log(
        `Deleted vectors for document ${documentId} in knowledge base ${knowledgeBaseId}`
      );

      generation.end({
        output: {
          action: "deleted",
          documentId,
          knowledgeBaseId,
        },
      });

      await langfuse.flushAsync();
    } catch (error) {
      console.error("Error deleting document vectors:", error);

      generation.end({
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await langfuse.flushAsync();
      throw new Error(
        `Failed to delete document vectors: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Delete all vectors for a specific knowledge base
   */
  async deleteKnowledgeBaseVectors(knowledgeBaseId: number): Promise<void> {
    const generation = this.traceId
      ? langfuse.span({
          name: "qdrant-delete-knowledge-base-vectors",
          traceId: this.traceId,
          input: {
            knowledgeBaseId,
          },
          metadata: {
            collectionName: this.collectionName,
            knowledgeBaseId,
          },
        })
      : langfuse.generation({
          name: "qdrant-delete-knowledge-base-vectors",
          input: {
            knowledgeBaseId,
          },
          metadata: {
            collectionName: this.collectionName,
            knowledgeBaseId,
          },
        });

    try {
      console.log(
        `[QdrantService] Deleting vectors for knowledge base ${knowledgeBaseId}`
      );

      await qdrantCient.delete(this.collectionName, {
        filter: {
          must: [
            {
              key: "knowledgeBaseId",
              match: { value: knowledgeBaseId },
            },
          ],
        },
      });

      console.log(`Deleted vectors for knowledge base ${knowledgeBaseId}`);

      generation.end({
        output: {
          action: "deleted",
          knowledgeBaseId,
        },
      });

      await langfuse.flushAsync();
    } catch (error) {
      console.error("Error deleting knowledge base vectors:", error);

      generation.end({
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await langfuse.flushAsync();
      throw new Error(
        `Failed to delete knowledge base vectors: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(): Promise<any> {
    const generation = this.traceId
      ? langfuse.span({
          name: "qdrant-get-collection-info",
          traceId: this.traceId,
          input: {
            collectionName: this.collectionName,
          },
          metadata: {
            collectionName: this.collectionName,
          },
        })
      : langfuse.generation({
          name: "qdrant-get-collection-info",
          input: {
            collectionName: this.collectionName,
          },
          metadata: {
            collectionName: this.collectionName,
          },
        });

    try {
      console.log(
        `[QdrantService] Getting collection info for ${this.collectionName}`
      );

      const collectionInfo = await qdrantCient.getCollection(
        this.collectionName
      );

      generation.end({
        output: {
          action: "retrieved",
          collectionName: this.collectionName,
          pointsCount: collectionInfo.points_count,
          vectorsCount: collectionInfo.vectors_count,
        },
      });

      await langfuse.flushAsync();
      return collectionInfo;
    } catch (error) {
      console.error("Error getting collection info:", error);

      generation.end({
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await langfuse.flushAsync();
      throw new Error(
        `Failed to get collection info: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
