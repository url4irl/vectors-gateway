// AI utilities and services
export { QdrantService } from "./qdrant-service";
export { DocumentProcessor } from "./document-processor";
export { LiteLLMClient } from "./ai-gateway/litellm-client";

// Import for internal use
import { LiteLLMClient as LiteLLMClientClass } from "./ai-gateway/litellm-client";
import { DocumentProcessor as DocumentProcessorClass } from "./document-processor";

// Utility function to create a document processor instance
export function createDocumentProcessor(userId: string) {
  const liteLLMClient = new LiteLLMClientClass(
    process.env.LITELLM_BASE_URL!,
    process.env.LITELLM_API_KEY!,
    userId
  );

  return new DocumentProcessorClass("documents");
}
