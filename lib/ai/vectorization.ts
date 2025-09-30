export interface ChunkedDocument {
  id: string | number;
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
