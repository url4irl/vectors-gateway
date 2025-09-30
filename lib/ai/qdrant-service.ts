import { qdrantCient } from "../clients/qdrant";
import { getConfig } from "../config";
import { VectorizationResult } from "./vectorization";

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

  constructor(collectionName: string = "documents", vectorSize: number = 1024) {
    // Include embedding model name in collection name to ensure model-specific collections
    const embeddingModel = getConfig().DEFAULT_EMBEDDING_MODEL.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    this.collectionName = `${collectionName}_${embeddingModel}`;
    this.vectorSize = vectorSize;
  }

  /**
   * Initialize the Qdrant collection
   */
  async initializeCollection(): Promise<void> {
    try {
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
      } else {
        console.log(`Qdrant collection ${this.collectionName} already exists`);
      }
    } catch (error) {
      console.error("Error initializing Qdrant collection:", error);
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
    try {
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
    } catch (error) {
      console.error("Error storing document vectors:", error);
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
    try {
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

      return searchResult.map((result) => ({
        id: result.id as string,
        score: result.score,
        payload: result.payload as QdrantPoint["payload"],
      }));
    } catch (error) {
      console.error("Error searching similar documents:", error);
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
    try {
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
    } catch (error) {
      console.error("Error deleting document vectors:", error);
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
    try {
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
    } catch (error) {
      console.error("Error deleting knowledge base vectors:", error);
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
    try {
      return await qdrantCient.getCollection(this.collectionName);
    } catch (error) {
      console.error("Error getting collection info:", error);
      throw new Error(
        `Failed to get collection info: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
