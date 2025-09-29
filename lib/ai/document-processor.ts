import { QdrantService } from "./qdrant-service";
import { deleteDocumentVectorMetadata } from "../db/vector-metadata";

export class DocumentProcessor {
  private qdrantService: QdrantService;

  constructor(qdrantCollectionName: string = "documents") {
    this.qdrantService = new QdrantService(qdrantCollectionName);
  }


  /**
   * Delete document vectors
   */
  async deleteDocumentVectors(documentId: number, knowledgeBaseId: number): Promise<boolean> {
    try {
      console.log(`Deleting vectors for document ${documentId} in knowledge base ${knowledgeBaseId}`);

      // Delete from Qdrant
      await this.qdrantService.deleteDocumentVectors(documentId, knowledgeBaseId);

      // Delete metadata
      await deleteDocumentVectorMetadata(documentId);

      console.log(`Successfully deleted vectors for document ${documentId} in knowledge base ${knowledgeBaseId}`);
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
