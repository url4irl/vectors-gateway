import { LiteLLMClient } from "./ai-gateway/litellm-client";

export interface ChunkedDocument {
  id: string;
  content: string;
  metadata: {
    documentId: number;
    knowledgeBaseId: number;
    userId: number;
    chunkIndex: number;
    totalChunks: number;
    originalContent: string;
    [key: string]: any;
  };
}

export interface VectorizationResult {
  chunks: ChunkedDocument[];
  embeddings: number[][];
}

export class DocumentVectorizer {
  private liteLLMClient: LiteLLMClient;
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(
    liteLLMClient: LiteLLMClient,
    chunkSize: number = 1000,
    chunkOverlap: number = 200
  ) {
    this.liteLLMClient = liteLLMClient;
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  /**
   * Chunk a document into smaller pieces for vectorization
   */
  private chunkDocument(
    content: string,
    documentId: number,
    knowledgeBaseId: number,
    userId: number
  ): ChunkedDocument[] {
    const chunks: ChunkedDocument[] = [];
    const sentences = this.splitIntoSentences(content);

    let currentChunk = "";
    let chunkIndex = 0;

    for (const sentence of sentences) {
      // If adding this sentence would exceed chunk size, finalize current chunk
      if (
        currentChunk.length + sentence.length > this.chunkSize &&
        currentChunk.length > 0
      ) {
        chunks.push({
          id: `${documentId}-${chunkIndex}`,
          content: currentChunk.trim(),
          metadata: {
            documentId,
            knowledgeBaseId,
            userId,
            chunkIndex,
            totalChunks: 0, // Will be updated after all chunks are created
            originalContent: content,
          },
        });

        // Start new chunk with overlap
        const overlap = this.getOverlapText(currentChunk);
        currentChunk = overlap + sentence;
        chunkIndex++;
      } else {
        currentChunk += (currentChunk ? " " : "") + sentence;
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: `${documentId}-${chunkIndex}`,
        content: currentChunk.trim(),
        metadata: {
          documentId,
          knowledgeBaseId,
          userId,
          chunkIndex,
          totalChunks: 0, // Will be updated
          originalContent: content,
        },
      });
    }

    // Update total chunks count
    chunks.forEach((chunk) => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Split text into sentences for better chunking
   */
  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - can be enhanced with more sophisticated NLP
    return text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Get overlap text from the end of a chunk
   */
  private getOverlapText(text: string): string {
    const words = text.split(" ");
    const overlapWords = Math.min(this.chunkOverlap / 10, words.length); // Rough word count
    return words.slice(-overlapWords).join(" ");
  }

  /**
   * Vectorize a document by chunking and embedding
   */
  async vectorizeDocument(
    content: string,
    documentId: number,
    knowledgeBaseId: number,
    userId: number
  ): Promise<VectorizationResult> {
    try {
      // Chunk the document
      const chunks = this.chunkDocument(
        content,
        documentId,
        knowledgeBaseId,
        userId
      );

      if (chunks.length === 0) {
        return { chunks: [], embeddings: [] };
      }

      // Extract content for embedding
      const chunkContents = chunks.map((chunk) => chunk.content);

      // Get embeddings for all chunks
      const embeddings = await this.liteLLMClient.getEmbeddings(chunkContents);

      return {
        chunks,
        embeddings,
      };
    } catch (error) {
      console.error("Error vectorizing document:", error);
      throw new Error(
        `Failed to vectorize document: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Vectorize a single text chunk
   */
  async vectorizeText(text: string): Promise<number[]> {
    try {
      const embeddings = await this.liteLLMClient.getEmbeddings([text]);
      return embeddings[0] || [];
    } catch (error) {
      console.error("Error vectorizing text:", error);
      throw new Error(
        `Failed to vectorize text: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
