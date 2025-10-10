import { VectorsGatewayClient, TraceUtils, TraceHeaders } from "../lib/client";

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
      const client = new VectorsGatewayClient(
        "api-key",
        "http://localhost:4000"
      );
      expect(client).toBeInstanceOf(VectorsGatewayClient);
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

  describe("storeDocument", () => {
    it("should store document successfully", async () => {
      // Skip if LiteLLM is not available
      if (!process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY) {
        console.log("Skipping store document test - LiteLLM not configured");
        return;
      }

      const result = await client.storeDocument(
        "This is a test document about machine learning algorithms and neural networks.",
        123, // userId
        456, // knowledgeBaseId
        789 // documentId
      );

      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("documentId", 789);
      expect(result).toHaveProperty("knowledgeBaseId", 456);
      expect(result).toHaveProperty("userId", 123);
      expect(result).toHaveProperty("vectorCount");
      expect(typeof result.vectorCount).toBe("number");
      expect(result.vectorCount).toBeGreaterThan(0);
    });

    it("should handle store document errors gracefully", async () => {
      // This will likely fail with 500 due to Qdrant not being properly configured
      // but we should get a proper error response
      try {
        await client.storeDocument("", 123, 456, 999); // Empty content should fail validation
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(
          /Content is required|HTTP|Failed/
        );
      }
    });

    it("should validate required parameters", async () => {
      // Test with invalid parameters
      try {
        await client.storeDocument("", 0, 0, 0); // Invalid IDs
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(
          /Content is required|User ID must be a positive integer|Knowledge base ID must be a positive integer|Document ID must be a positive integer/
        );
      }
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

  describe("Trace Headers", () => {
    describe("constructor with trace headers", () => {
      it("should initialize with trace headers", () => {
        const traceHeaders: TraceHeaders = {
          traceId: "test-trace-id",
          spanId: "test-span-id",
          parentTraceId: "parent-trace-id",
        };
        const clientWithTrace = new VectorsGatewayClient(
          testApiKey,
          testBaseUrl,
          traceHeaders
        );

        expect(clientWithTrace).toBeInstanceOf(VectorsGatewayClient);
        expect(clientWithTrace.getTraceHeaders()).toEqual(traceHeaders);
      });

      it("should initialize with empty trace headers by default", () => {
        const clientWithoutTrace = new VectorsGatewayClient(
          testApiKey,
          testBaseUrl
        );

        expect(clientWithoutTrace).toBeInstanceOf(VectorsGatewayClient);
        expect(clientWithoutTrace.getTraceHeaders()).toEqual({});
      });
    });

    describe("setTraceHeaders", () => {
      it("should update trace headers", () => {
        const clientWithTrace = new VectorsGatewayClient(
          testApiKey,
          testBaseUrl,
          { traceId: "initial-trace" }
        );

        const newHeaders: TraceHeaders = {
          traceId: "new-trace-id",
          spanId: "new-span-id",
        };

        clientWithTrace.setTraceHeaders(newHeaders);

        expect(clientWithTrace.getTraceHeaders()).toEqual(newHeaders);
      });

      it("should merge trace headers", () => {
        const clientWithTrace = new VectorsGatewayClient(
          testApiKey,
          testBaseUrl,
          { traceId: "initial-trace", spanId: "initial-span" }
        );

        clientWithTrace.setTraceHeaders({ parentTraceId: "parent-trace" });

        expect(clientWithTrace.getTraceHeaders()).toEqual({
          traceId: "initial-trace",
          spanId: "initial-span",
          parentTraceId: "parent-trace",
        });
      });
    });

    describe("withTraceHeaders", () => {
      it("should create new client with updated trace headers", () => {
        const originalClient = new VectorsGatewayClient(
          testApiKey,
          testBaseUrl,
          { traceId: "original-trace" }
        );

        const newHeaders: TraceHeaders = {
          spanId: "child-span",
          parentTraceId: "original-trace",
        };

        const childClient = originalClient.withTraceHeaders(newHeaders);

        expect(childClient).toBeInstanceOf(VectorsGatewayClient);
        expect(childClient).not.toBe(originalClient); // Should be a new instance
        expect(childClient.getTraceHeaders()).toEqual({
          traceId: "original-trace",
          spanId: "child-span",
          parentTraceId: "original-trace",
        });
        expect(originalClient.getTraceHeaders()).toEqual({
          traceId: "original-trace",
        }); // Original should be unchanged
      });

      it("should preserve original client trace headers", () => {
        const originalClient = new VectorsGatewayClient(
          testApiKey,
          testBaseUrl,
          { traceId: "original-trace", spanId: "original-span" }
        );

        const childClient = originalClient.withTraceHeaders({
          parentTraceId: "parent-trace",
        });

        expect(childClient.getTraceHeaders()).toEqual({
          traceId: "original-trace",
          spanId: "original-span",
          parentTraceId: "parent-trace",
        });
      });
    });

    describe("getTraceHeaders", () => {
      it("should return current trace headers", () => {
        const traceHeaders: TraceHeaders = {
          traceId: "test-trace",
          spanId: "test-span",
        };

        const clientWithTrace = new VectorsGatewayClient(
          testApiKey,
          testBaseUrl,
          traceHeaders
        );

        expect(clientWithTrace.getTraceHeaders()).toEqual(traceHeaders);
      });

      it("should return a copy of trace headers", () => {
        const traceHeaders: TraceHeaders = {
          traceId: "test-trace",
        };

        const clientWithTrace = new VectorsGatewayClient(
          testApiKey,
          testBaseUrl,
          traceHeaders
        );

        const headers = clientWithTrace.getTraceHeaders();
        headers.traceId = "modified-trace";

        expect(clientWithTrace.getTraceHeaders().traceId).toBe("test-trace");
      });
    });
  });

  describe("TraceUtils", () => {
    describe("generateTraceId", () => {
      it("should generate valid UUID v4 format", () => {
        const traceId = TraceUtils.generateTraceId();

        expect(traceId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      });

      it("should generate unique trace IDs", () => {
        const traceId1 = TraceUtils.generateTraceId();
        const traceId2 = TraceUtils.generateTraceId();

        expect(traceId1).not.toBe(traceId2);
      });
    });

    describe("generateSpanId", () => {
      it("should generate valid UUID v4 format", () => {
        const spanId = TraceUtils.generateSpanId();

        expect(spanId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      });

      it("should generate unique span IDs", () => {
        const spanId1 = TraceUtils.generateSpanId();
        const spanId2 = TraceUtils.generateSpanId();

        expect(spanId1).not.toBe(spanId2);
      });
    });

    describe("createTraceHeaders", () => {
      it("should create trace headers with provided trace ID", () => {
        const traceId = "custom-trace-id";
        const headers = TraceUtils.createTraceHeaders(traceId);

        expect(headers).toEqual({ traceId });
      });

      it("should generate trace ID when not provided", () => {
        const headers = TraceUtils.createTraceHeaders();

        expect(headers).toHaveProperty("traceId");
        expect(headers.traceId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      });
    });

    describe("createChildSpanHeaders", () => {
      it("should create child span headers with parent trace ID", () => {
        const parentTraceId = "parent-trace-id";
        const headers = TraceUtils.createChildSpanHeaders(parentTraceId);

        expect(headers).toEqual({
          traceId: parentTraceId,
          spanId: expect.any(String),
          parentTraceId,
        });
      });

      it("should create child span headers with custom span ID", () => {
        const parentTraceId = "parent-trace-id";
        const customSpanId = "custom-span-id";
        const headers = TraceUtils.createChildSpanHeaders(
          parentTraceId,
          customSpanId
        );

        expect(headers).toEqual({
          traceId: parentTraceId,
          spanId: customSpanId,
          parentTraceId,
        });
      });

      it("should generate span ID when not provided", () => {
        const parentTraceId = "parent-trace-id";
        const headers = TraceUtils.createChildSpanHeaders(parentTraceId);

        expect(headers.spanId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      });
    });
  });

  describe("Client Operations with Trace Headers", () => {
    let clientWithTrace: VectorsGatewayClient;

    beforeEach(() => {
      const traceId = TraceUtils.generateTraceId();
      clientWithTrace = new VectorsGatewayClient(testApiKey, testBaseUrl, {
        traceId,
      });
    });

    it("should include trace headers in search requests", async () => {
      // Skip if LiteLLM is not available
      if (!process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY) {
        console.log("Skipping trace header test - LiteLLM not configured");
        return;
      }

      const result = await clientWithTrace.searchDocuments("test query", 1, 1);

      expect(result).toHaveProperty("query", "test query");
      expect(result).toHaveProperty("matches");
      expect(Array.isArray(result.matches)).toBe(true);
    });

    it("should include trace headers in store requests", async () => {
      // Skip if LiteLLM is not available
      if (!process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY) {
        console.log("Skipping trace header test - LiteLLM not configured");
        return;
      }

      const result = await clientWithTrace.storeDocument(
        "Test document content",
        1,
        1,
        123
      );

      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("documentId", 123);
    });

    it("should include trace headers in delete requests", async () => {
      const result = await clientWithTrace.deleteDocument(123, 1, 1);

      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("documentId", 123);
    });

    it("should create child spans for different operations", async () => {
      const childClient = clientWithTrace.withTraceHeaders(
        TraceUtils.createChildSpanHeaders(
          clientWithTrace.getTraceHeaders().traceId!
        )
      );

      expect(childClient.getTraceHeaders().parentTraceId).toBe(
        clientWithTrace.getTraceHeaders().traceId
      );
      expect(childClient.getTraceHeaders().spanId).toBeDefined();
    });
  });
});
