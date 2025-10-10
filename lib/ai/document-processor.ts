import { QdrantService } from "./qdrant-service";
import {
  deleteDocumentVectorMetadata,
  upsertDocumentVectorMetadata,
  markDocumentAsVectorized,
} from "../db/vector-metadata";
import { LiteLLMClient } from "./sdk/litellm-client";
import { SemanticChunkingService } from "./semantic-chunking";
import { getConfig } from "../config";
import { VectorizationResult, ChunkedDocument } from "./vectorization";
import { langfuse } from "../clients/langfuse";

export class DocumentProcessor {
  private qdrantService: QdrantService;
  private litellmClient: LiteLLMClient;
  private semanticChunkingService: SemanticChunkingService;
  private traceId?: string;

  constructor(qdrantCollectionName: string = "documents", traceId?: string) {
    this.traceId = traceId;
    this.qdrantService = new QdrantService(qdrantCollectionName, 1024, traceId);
    const { LITELLM_BASE_URL, LITELLM_API_KEY } = getConfig();
    this.litellmClient = new LiteLLMClient(
      LITELLM_BASE_URL,
      LITELLM_API_KEY,
      "document-processor",
      traceId
    );
    this.semanticChunkingService = new SemanticChunkingService(
      this.litellmClient
    );
  }

  /**
   * Process and store a document
   */
  async processDocument(
    content: string,
    documentId: number,
    knowledgeBaseId: number,
    userId: number
  ): Promise<{ vectorCount: number }> {
    const generation = this.traceId
      ? langfuse.span({
          name: "document-processor",
          traceId: this.traceId,
          input: {
            documentId,
            knowledgeBaseId,
            userId,
            contentLength: content.length,
          },
          metadata: {
            documentId,
            knowledgeBaseId,
            userId,
            contentLength: content.length,
          },
        })
      : langfuse.generation({
          name: "document-processor",
          input: {
            documentId,
            knowledgeBaseId,
            userId,
            contentLength: content.length,
          },
          metadata: {
            documentId,
            knowledgeBaseId,
            userId,
            contentLength: content.length,
          },
        });

    try {
      console.log(
        `[DocumentProcessor] Processing document ${documentId} for user ${userId} in knowledge base ${knowledgeBaseId}`
      );

      // Create or update document metadata
      await upsertDocumentVectorMetadata({
        documentId,
        knowledgeBaseId,
        userId,
        vectorCount: 0,
        isVectorized: false,
      });

      // If this is an update, delete existing vectors first
      try {
        await this.qdrantService.deleteDocumentVectors(
          documentId,
          knowledgeBaseId
        );
        console.log(
          `Deleted existing vectors for document ${documentId} before re-processing`
        );
      } catch (error) {
        // It's okay if there are no existing vectors to delete
        console.log(`No existing vectors found for document ${documentId}`);
      }

      // Use semantic chunking for better content understanding
      const chunkingSpan = langfuse.span({
        name: "semantic-chunking",
        traceId: this.traceId || generation.traceId,
        input: { contentLength: content.length },
        metadata: { documentId, knowledgeBaseId, userId },
      });

      const semanticChunks =
        await this.semanticChunkingService.performSemanticChunking(
          content,
          1, // bufferSize
          90 // percentileThreshold
        );

      chunkingSpan.end({
        output: {
          chunksCreated: semanticChunks.length,
        },
      });

      // Convert semantic chunks to ChunkedDocument format
      const chunks: ChunkedDocument[] = semanticChunks.map(
        (chunkContent, index) => ({
          id: documentId * 1000 + index,
          content: chunkContent,
          metadata: {
            documentId,
            knowledgeBaseId,
            userId,
            chunkIndex: index,
            totalChunks: semanticChunks.length,
            originalContent: content,
          },
        })
      );

      // Generate embeddings for all chunks
      const chunkTexts = chunks.map((chunk) => chunk.content);
      console.log(
        `Processing ${chunkTexts.length} chunks for document ${documentId}`
      );

      // Validate chunk sizes before sending to embedding service
      const oversizedChunks = chunkTexts.filter((text) => text.length > 8000);
      if (oversizedChunks.length > 0) {
        console.warn(
          `Warning: ${oversizedChunks.length} chunks exceed 8k characters and may fail with embedding service`
        );
      }

      const embeddingSpan = langfuse.span({
        name: "generate-embeddings",
        traceId: this.traceId || generation.traceId,
        input: { chunkCount: chunkTexts.length },
        metadata: { documentId, knowledgeBaseId, userId },
      });

      const embeddings = await this.litellmClient.getEmbeddings(chunkTexts);

      embeddingSpan.end({
        output: {
          embeddingsGenerated: embeddings.length,
          embeddingDimensions: embeddings[0]?.length || 0,
        },
      });

      // Validate that we have embeddings for all chunks
      if (embeddings.length !== chunks.length) {
        throw new Error(
          `Embedding mismatch: expected ${chunks.length} embeddings, got ${embeddings.length}. ` +
            `Chunk texts: ${chunkTexts.length}, Embeddings: ${embeddings.length}`
        );
      }

      // Validate that all embeddings are valid arrays
      for (let i = 0; i < embeddings.length; i++) {
        if (!Array.isArray(embeddings[i]) || embeddings[i].length === 0) {
          throw new Error(
            `Invalid embedding at index ${i}: expected array, got ${typeof embeddings[
              i
            ]}`
          );
        }
      }

      // Create vectorization result
      const vectorizationResult: VectorizationResult = {
        chunks,
        embeddings,
      };

      console.log({
        vectorizationResult: {
          chunks: chunks.length,
          embeddings: embeddings.length,
          chunkTexts: chunkTexts.length,
        },
      });

      // Store vectors in Qdrant
      const storageSpan = langfuse.span({
        name: "store-vectors",
        traceId: this.traceId || generation.traceId,
        input: { vectorCount: embeddings.length },
        metadata: { documentId, knowledgeBaseId, userId },
      });

      await this.qdrantService.storeDocumentVectors(vectorizationResult);

      storageSpan.end({
        output: {
          vectorsStored: embeddings.length,
        },
      });

      // Update metadata
      await markDocumentAsVectorized(documentId, chunks.length);

      console.log(
        `[DocumentProcessor] Successfully processed document ${documentId} with ${chunks.length} vectors`
      );

      generation.end({
        output: {
          action: "processed",
          vectorCount: chunks.length,
          documentId,
          knowledgeBaseId,
          userId,
          chunksCreated: chunks.length,
        },
      });

      await langfuse.flushAsync();
      return { vectorCount: chunks.length };
    } catch (error) {
      console.error(`Error processing document ${documentId}:`, error);

      generation.end({
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await langfuse.flushAsync();
      throw new Error(
        `Failed to process document: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Delete document vectors
   */
  async deleteDocumentVectors(
    documentId: number,
    knowledgeBaseId: number
  ): Promise<boolean> {
    const generation = this.traceId
      ? langfuse.span({
          name: "document-processor-delete",
          traceId: this.traceId,
          input: {
            documentId,
            knowledgeBaseId,
          },
          metadata: {
            documentId,
            knowledgeBaseId,
          },
        })
      : langfuse.generation({
          name: "document-processor-delete",
          input: {
            documentId,
            knowledgeBaseId,
          },
          metadata: {
            documentId,
            knowledgeBaseId,
          },
        });

    try {
      console.log(
        `[DocumentProcessor] Deleting vectors for document ${documentId} in knowledge base ${knowledgeBaseId}`
      );

      // Delete from Qdrant
      await this.qdrantService.deleteDocumentVectors(
        documentId,
        knowledgeBaseId
      );

      // Delete metadata
      await deleteDocumentVectorMetadata(documentId);

      console.log(
        `[DocumentProcessor] Successfully deleted vectors for document ${documentId} in knowledge base ${knowledgeBaseId}`
      );

      generation.end({
        output: {
          action: "deleted",
          documentId,
          knowledgeBaseId,
        },
      });

      await langfuse.flushAsync();
      return true;
    } catch (error) {
      console.error(
        `Error deleting vectors for document ${documentId} in knowledge base ${knowledgeBaseId}:`,
        error
      );

      generation.end({
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await langfuse.flushAsync();
      return false;
    }
  }
}
