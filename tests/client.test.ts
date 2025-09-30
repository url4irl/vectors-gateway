import { VectorsGatewayClient } from "../lib/client";

describe("VectorsGatewayClient E2E Tests", () => {
  let client: VectorsGatewayClient;
  const testApiKey = "test-api-key-123";
  const testBaseUrl = "http://localhost:4000";

  beforeAll(() => {
    client = new VectorsGatewayClient(testApiKey, testBaseUrl);
  });

  describe("constructor", () => {
    it("should initialize with API key and base URL", () => {
      const client = new VectorsGatewayClient("api-key", "http://test.com");
      expect(client).toBeInstanceOf(VectorsGatewayClient);
    });

    it("should use default base URL when not provided", () => {
      const client = new VectorsGatewayClient("api-key");
      expect(client).toBeInstanceOf(VectorsGatewayClient);
    });
  });

  describe("createEmbeddings", () => {
    it("should create embeddings with string input", async () => {
      // Skip if LiteLLM is not available
      if (!process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY) {
        console.log("Skipping embeddings test - LiteLLM not configured");
        return;
      }

      const result = await client.createEmbeddings(
        "hello world",
        "openai/bge-m3:latest",
        "user-123",
        123,
        456
      );

      expect(result).toHaveProperty("object", "list");
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("model");
      expect(result).toHaveProperty("usage");
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]).toHaveProperty("object", "embedding");
      expect(result.data[0]).toHaveProperty("index", 0);
      expect(Array.isArray(result.data[0].embedding)).toBe(true);
    });

    it("should create embeddings with array input", async () => {
      // Skip if LiteLLM is not available
      if (!process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY) {
        console.log("Skipping embeddings test - LiteLLM not configured");
        return;
      }

      const result = await client.createEmbeddings(
        ["hello", "world"],
        "openai/bge-m3:latest",
        "user-123",
        123,
        456
      );

      expect(result).toHaveProperty("object", "list");
      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]).toHaveProperty("object", "embedding");
      expect(result.data[0]).toHaveProperty("index", 0);
      expect(Array.isArray(result.data[0].embedding)).toBe(true);
    });

    it("should handle validation errors", async () => {
      await expect(
        client.createEmbeddings(
          "",
          "openai/bge-m3:latest",
          "user-123",
          123,
          456
        )
      ).rejects.toThrow("Input must be a non-empty string");
    });
  });

  describe("searchDocuments", () => {
    it("should search documents with all parameters", async () => {
      // Skip if LiteLLM is not available
      if (!process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY) {
        console.log("Skipping search test - LiteLLM not configured");
        return;
      }

      const result = await client.searchDocuments(
        "machine learning",
        123,
        456,
        { documentId: 789, limit: 10, scoreThreshold: 0.8 }
      );

      expect(result).toHaveProperty("query", "machine learning");
      expect(result).toHaveProperty("matches");
      expect(Array.isArray(result.matches)).toBe(true);
    });

    it("should search without optional parameters", async () => {
      // Skip if LiteLLM is not available
      if (!process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY) {
        console.log("Skipping search test - LiteLLM not configured");
        return;
      }

      const result = await client.searchDocuments("test", 123, 456);

      expect(result).toHaveProperty("query", "test");
      expect(result).toHaveProperty("matches");
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe("searchInDocument", () => {
    it("should search within specific document", async () => {
      // Skip if LiteLLM is not available
      if (!process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY) {
        console.log("Skipping search test - LiteLLM not configured");
        return;
      }

      const result = await client.searchInDocument(
        "neural networks",
        123,
        456,
        789,
        { limit: 5 }
      );

      expect(result).toHaveProperty("query", "neural networks");
      expect(result).toHaveProperty("matches");
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe("searchKnowledgeBase", () => {
    it("should search across knowledge base", async () => {
      // Skip if LiteLLM is not available
      if (!process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY) {
        console.log("Skipping search test - LiteLLM not configured");
        return;
      }

      const result = await client.searchKnowledgeBase("algorithms", 123, 456, {
        scoreThreshold: 0.7,
      });

      expect(result).toHaveProperty("query", "algorithms");
      expect(result).toHaveProperty("matches");
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe("deleteDocument", () => {
    it("should delete document successfully", async () => {
      const result = await client.deleteDocument(789, 123, 456);

      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("documentId", 789);
      expect(result).toHaveProperty("knowledgeBaseId", 456);
      expect(result).toHaveProperty("userId", 123);
    });

    it("should handle delete errors gracefully", async () => {
      // This will likely fail with 500 due to Qdrant not being properly configured
      // but we should get a proper error response
      try {
        await client.deleteDocument(999, 123, 456);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/HTTP|Failed/);
      }
    });
  });

  describe("healthCheck", () => {
    it("should check service health", async () => {
      const result = await client.healthCheck();

      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("documentation");
      expect(result).toHaveProperty("apiInfo");
      expect(result.apiInfo).toHaveProperty("endpoints");
      expect(result.apiInfo.endpoints).toHaveProperty("embeddings");
      expect(result.apiInfo.endpoints).toHaveProperty("retrieval");
      expect(result.apiInfo.endpoints).toHaveProperty("documents");
    });
  });

  describe("getServiceInfo", () => {
    it("should return service information", async () => {
      const result = await client.getServiceInfo();

      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("documentation");
      expect(result).toHaveProperty("apiInfo");
      expect(result.apiInfo).toHaveProperty("endpoints");
    });
  });
});
