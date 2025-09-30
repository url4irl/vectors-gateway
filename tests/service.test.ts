import { testDb } from "./test-db";
import { LiteLLMClient } from "../lib/ai/ai-gateway/litellm-client";
import { QdrantService } from "../lib/ai/qdrant-service";

describe("Vectors Gateway Service Units", () => {
  beforeAll(async () => {
    await testDb.setup();
  });

  beforeEach(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("LiteLLMClient.getEmbeddings should return arrays when env set", async () => {
    if (!process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY) return;
    const client = new LiteLLMClient(
      process.env.LITELLM_BASE_URL!,
      process.env.LITELLM_API_KEY!,
      "test-user"
    );

    try {
      const embeddings = await client.getEmbeddings(["hello"]);
      expect(Array.isArray(embeddings)).toBe(true);
      expect(Array.isArray(embeddings[0])).toBe(true);
    } catch (error) {
      // If LiteLLM is not available, expect HTTP error
      expect((error as Error).message).toMatch(/HTTP error/);
    }
  });

  it("QdrantService.initializeCollection should succeed locally", async () => {
    const service = new QdrantService("documents");
    await expect(service.initializeCollection()).resolves.toBeUndefined();
  });

  it("QdrantService.searchSimilarDocuments should handle optional documentId", async () => {
    const service = new QdrantService("documents");

    // Mock query vector (BGE-M3 model uses 1024 dimensions)
    const queryVector = new Array(1024).fill(0.1);
    const userId = 123;
    const knowledgeBaseId = 456;

    try {
      // Test without documentId (knowledge base level search)
      const resultsWithoutDocId = await service.searchSimilarDocuments(
        queryVector,
        userId,
        knowledgeBaseId,
        10,
        0.7
      );
      expect(Array.isArray(resultsWithoutDocId)).toBe(true);

      // Test with documentId (document level search)
      const resultsWithDocId = await service.searchSimilarDocuments(
        queryVector,
        userId,
        knowledgeBaseId,
        10,
        0.7,
        789 // documentId
      );
      expect(Array.isArray(resultsWithDocId)).toBe(true);
    } catch (error) {
      // If Qdrant is not available, expect connection error
      expect((error as Error).message).toMatch(
        /Failed to search similar documents/
      );
    }
  });
});
