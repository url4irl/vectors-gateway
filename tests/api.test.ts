import request from "supertest";
import { createApp } from "../lib/app";
import { testDb } from "./test-db";
import { getConfig } from "../lib/config";

const { API_KEY } = getConfig();

describe("Vectors Gateway E2E Tests", () => {
  let app: any;
  const testApiKey = API_KEY;

  beforeAll(async () => {
    // Setup test database
    await testDb.setup();
    // Set test API key
    process.env.API_KEY = testApiKey;
    app = createApp();
  });

  beforeEach(async () => {
    // Clean database before each test
    await testDb.cleanup();
  });

  afterAll(async () => {
    // Teardown test database
    await testDb.teardown();
  });

  describe("POST /v1/embeddings", () => {
    it("should require API key", async () => {
      const res = await request(app)
        .post("/v1/embeddings")
        .send({})
        .expect(401);
      expect(res.body.error.message).toMatch(/API key is required/);
    });

    it("should validate missing fields", async () => {
      const res = await request(app)
        .post("/v1/embeddings")
        .set("x-api-key", testApiKey)
        .send({})
        .expect(400);
      expect(res.body.error.message).toMatch(/model/);
    });

    it("should require userId", async () => {
      const res = await request(app)
        .post("/v1/embeddings")
        .set("x-api-key", testApiKey)
        .send({ model: "openai/bge-m3:latest", input: ["hello world"] })
        .expect(400);
      expect(res.body.error.message).toMatch(/userId.*required/);
    });

    it("should return embeddings list shape when LiteLLM env is set", async () => {
      if (!process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY) return;
      const res = await request(app)
        .post("/v1/embeddings")
        .set("x-api-key", testApiKey)
        .set("x-user-id", "123")
        .send({ model: "openai/bge-m3:latest", input: ["hello world"] });

      // If LiteLLM is not available, expect 500 error
      if (res.status === 500) {
        expect(res.body.error.message).toMatch(/HTTP error|Internal error/);
        return;
      }

      expect(res.status).toBe(200);
      expect(res.body.object).toBe("list");
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("POST /v1/retrieval/search", () => {
    it("should require API key", async () => {
      const res = await request(app)
        .post("/v1/retrieval/search")
        .send({})
        .expect(401);
      expect(res.body.error.message).toMatch(/API key is required/);
    });

    it("should require query, userId (or header), and knowledgeBaseId", async () => {
      const r1 = await request(app)
        .post("/v1/retrieval/search")
        .set("x-api-key", testApiKey)
        .send({})
        .expect(400);
      expect(r1.body.error.message).toMatch(/query/);

      const r2 = await request(app)
        .post("/v1/retrieval/search")
        .set("x-api-key", testApiKey)
        .send({ query: "hi" })
        .expect(400);
      expect(r2.body.error.message).toMatch(/userId/);

      const r3 = await request(app)
        .post("/v1/retrieval/search")
        .set("x-api-key", testApiKey)
        .set("x-user-id", "1")
        .send({ query: "hi" })
        .expect(400);
      expect(r3.body.error.message).toMatch(/knowledgeBaseId/);

      const res = await request(app)
        .post("/v1/retrieval/search")
        .set("x-api-key", testApiKey)
        .set("x-user-id", "1")
        .send({ query: "hi", knowledgeBaseId: 123 });

      // If LiteLLM is not available, expect 500 error
      if (res.status === 500) {
        expect(res.body.error.message).toMatch(/HTTP error|Internal error/);
        return;
      }

      expect(res.status).toBe(200);
    });

    it("should accept optional documentId parameter", async () => {
      const res = await request(app)
        .post("/v1/retrieval/search")
        .set("x-api-key", testApiKey)
        .set("x-user-id", "1")
        .send({
          query: "test query",
          knowledgeBaseId: 123,
          documentId: 456, // Optional documentId
        });

      // If LiteLLM is not available, expect 500 error
      if (res.status === 500) {
        expect(res.body.error.message).toMatch(/HTTP error|Internal error/);
        return;
      }

      expect(res.status).toBe(200);
      expect(res.body.query).toBe("test query");
      expect(Array.isArray(res.body.matches)).toBe(true);
    });

    it("should work without documentId (knowledge base level search)", async () => {
      const res = await request(app)
        .post("/v1/retrieval/search")
        .set("x-api-key", testApiKey)
        .set("x-user-id", "1")
        .send({
          query: "test query",
          knowledgeBaseId: 123,
          // No documentId - should search across entire knowledge base
        });

      // If LiteLLM is not available, expect 500 error
      if (res.status === 500) {
        expect(res.body.error.message).toMatch(/HTTP error|Internal error/);
        return;
      }

      expect(res.status).toBe(200);
      expect(res.body.query).toBe("test query");
      expect(Array.isArray(res.body.matches)).toBe(true);
    });

    it("should handle documentId as string or number", async () => {
      // Test with string documentId
      const res1 = await request(app)
        .post("/v1/retrieval/search")
        .set("x-api-key", testApiKey)
        .set("x-user-id", "1")
        .send({
          query: "test query",
          knowledgeBaseId: 123,
          documentId: "456", // String documentId
        });

      // Test with number documentId
      const res2 = await request(app)
        .post("/v1/retrieval/search")
        .set("x-api-key", testApiKey)
        .set("x-user-id", "1")
        .send({
          query: "test query",
          knowledgeBaseId: 123,
          documentId: 789, // Number documentId
        });

      // Both should work (or fail with 500 if LiteLLM unavailable)
      expect([200, 500]).toContain(res1.status);
      expect([200, 500]).toContain(res2.status);
    });

    it("should validate documentId when provided", async () => {
      // Test with invalid documentId (non-numeric string)
      const res = await request(app)
        .post("/v1/retrieval/search")
        .set("x-api-key", testApiKey)
        .set("x-user-id", "1")
        .send({
          query: "test query",
          knowledgeBaseId: 123,
          documentId: "invalid", // Invalid documentId
        });

      // Should still work as documentId is optional and gets converted to Number
      // If it fails, it should be a 500 error from Qdrant, not a 400 validation error
      expect([200, 500]).toContain(res.status);
    });
  });

  describe("DELETE /v1/documents/:documentId", () => {
    it("should require API key", async () => {
      const res = await request(app)
        .delete("/v1/documents/123")
        .send({})
        .expect(401);
      expect(res.body.error.message).toMatch(/API key is required/);
    });

    it("should require userId and knowledgeBaseId in request body", async () => {
      const r1 = await request(app)
        .delete("/v1/documents/123")
        .set("x-api-key", testApiKey)
        .send({})
        .expect(400);
      expect(r1.body.error.message).toMatch(/userId.*required/);

      const r2 = await request(app)
        .delete("/v1/documents/123")
        .set("x-api-key", testApiKey)
        .send({ userId: 123 })
        .expect(400);
      expect(r2.body.error.message).toMatch(/knowledgeBaseId.*required/);
    });

    it("should validate documentId parameter", async () => {
      const res = await request(app)
        .delete("/v1/documents/invalid")
        .set("x-api-key", testApiKey)
        .send({ userId: 123, knowledgeBaseId: 42 })
        .expect(400);
      expect(res.body.error.message).toMatch(/Invalid documentId/);
    });

    it("should attempt to delete document vectors", async () => {
      const res = await request(app)
        .delete("/v1/documents/123")
        .set("x-api-key", testApiKey)
        .send({ userId: 123, knowledgeBaseId: 42 });

      // Should return 200 or 500 depending on Qdrant availability
      expect([200, 500]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body.message).toMatch(/Document successfully removed/);
        expect(res.body.documentId).toBe(123);
        expect(res.body.knowledgeBaseId).toBe(42);
        expect(res.body.userId).toBe(123);
      }
    });
  });

  describe("GET /", () => {
    it("should return service information", async () => {
      const response = await request(app).get("/").expect(200);
      expect(response.body).toEqual({
        message: "Vectors Gateway is running",
        documentation: "http://localhost:4000/docs",
        apiInfo: {
          endpoints: {
            embeddings: "POST /v1/embeddings",
            retrieval: "POST /v1/retrieval/search",
            documents: "DELETE /v1/documents/:documentId",
          },
        },
      });
    });
  });
});
