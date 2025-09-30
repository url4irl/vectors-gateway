import { QdrantService } from "./qdrant-service";
import {
  deleteDocumentVectorMetadata,
  upsertDocumentVectorMetadata,
  markDocumentAsVectorized,
} from "../db/vector-metadata";
import { LiteLLMClient } from "./ai-gateway/litellm-client";
import { getConfig } from "../config";
import { VectorizationResult, ChunkedDocument } from "./vectorization";

export class DocumentProcessor {
  private qdrantService: QdrantService;
  private litellmClient: LiteLLMClient;

  constructor(qdrantCollectionName: string = "documents") {
    this.qdrantService = new QdrantService(qdrantCollectionName);
    const { LITELLM_BASE_URL, LITELLM_API_KEY } = getConfig();
    this.litellmClient = new LiteLLMClient(
      LITELLM_BASE_URL,
      LITELLM_API_KEY,
      "document-processor"
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
    try {
      console.log(
        `Processing document ${documentId} for user ${userId} in knowledge base ${knowledgeBaseId}`
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

      // Simple chunking strategy - split by sentences
      const sentences = content
        .split(/[.!?]+/)
        .filter((s) => s.trim().length > 0);
      const chunks: ChunkedDocument[] = sentences.map((sentence, index) => ({
        id: documentId * 1000 + index, // Generate unique integer IDs
        content: sentence.trim(),
        metadata: {
          documentId,
          knowledgeBaseId,
          userId,
          chunkIndex: index,
          totalChunks: sentences.length,
          originalContent: content,
        },
      }));

      // Generate embeddings for all chunks
      const chunkTexts = chunks.map((chunk) => chunk.content);

      console.log({ chunkTexts });
      const embeddings = await this.litellmClient.getEmbeddings(chunkTexts);
      console.log({ embeddings });

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
      await this.qdrantService.storeDocumentVectors(vectorizationResult);

      // Update metadata
      await markDocumentAsVectorized(documentId, chunks.length);

      console.log(
        `Successfully processed document ${documentId} with ${chunks.length} vectors`
      );

      return { vectorCount: chunks.length };
    } catch (error) {
      console.error(`Error processing document ${documentId}:`, error);
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
    try {
      console.log(
        `Deleting vectors for document ${documentId} in knowledge base ${knowledgeBaseId}`
      );

      // Delete from Qdrant
      await this.qdrantService.deleteDocumentVectors(
        documentId,
        knowledgeBaseId
      );

      // Delete metadata
      await deleteDocumentVectorMetadata(documentId);

      console.log(
        `Successfully deleted vectors for document ${documentId} in knowledge base ${knowledgeBaseId}`
      );
      return true;
    } catch (error) {
      console.error(
        `Error deleting vectors for document ${documentId} in knowledge base ${knowledgeBaseId}:`,
        error
      );
      return false;
    }
  }
}
