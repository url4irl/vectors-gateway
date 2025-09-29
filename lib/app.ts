import express from "express";
import swaggerUi from "swagger-ui-express";
import { jsDocSpecs } from "./docs";
import type { Application } from "express";
import { LiteLLMClient } from "./ai/ai-gateway/litellm-client";
import { QdrantService } from "./ai/qdrant-service";
import { DocumentProcessor } from "./ai/document-processor";

export function createApp(enableSwagger: boolean = true): Application {
  const app = express();
  const defaultCollection = process.env.QDRANT_COLLECTION_NAME || "documents";

  app.use(express.json());

  // API Key authentication middleware
  app.use((req, res, next) => {
    // Skip auth for health check and docs
    if (req.path === "/" || req.path.startsWith("/docs")) {
      return next();
    }

    const apiKey = req.header("x-api-key") || req.header("authorization")?.replace("Bearer ", "");
    
    if (!apiKey) {
      return res.status(401).json({
        error: { message: "API key is required. Provide it via 'x-api-key' header or 'Authorization: Bearer <key>' header" }
      });
    }

    // Validate API key (you can enhance this with a database lookup)
    const validApiKey = process.env.API_KEY;
    if (validApiKey && apiKey !== validApiKey) {
      return res.status(401).json({
        error: { message: "Invalid API key" }
      });
    }

    // Store API key in request for potential use
    (req as any).apiKey = apiKey;
    next();
  });

  // TODO: Re-enable Swagger documentation after fixing type compatibility
  // Swagger documentation route (only in non-test environments)
  if (enableSwagger) {
    try {
      app.use(
        "/docs",
        swaggerUi.serve as any,
        swaggerUi.setup(jsDocSpecs) as any
      );
    } catch (error) {
      console.warn("Failed to setup Swagger UI:", error);
    }
  }

  app.get("/", async (_, res) => {
    res.json({
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

  // Embeddings endpoint (LiteLLM/OpenAI compatible)
  app.post("/v1/embeddings", async (req, res) => {
    try {
      const { model, input, user } = req.body || {};
      if (!model || typeof model !== "string") {
        return res
          .status(400)
          .json({ error: { message: '"model" is required' } });
      }
      if (
        input === undefined ||
        (typeof input !== "string" && !Array.isArray(input))
      ) {
        return res
          .status(400)
          .json({
            error: { message: '"input" must be a string or array of strings' },
          });
      }

      const userIdHeader = req.header("x-user-id") || user;
      if (!userIdHeader) {
        return res
          .status(400)
          .json({
            error: {
              message: '"userId" is required (body or x-user-id header)',
            },
          });
      }

      const client = new LiteLLMClient(
        process.env.LITELLM_BASE_URL!,
        process.env.LITELLM_API_KEY!,
        String(userIdHeader)
      );

      const inputs: string[] = Array.isArray(input) ? input : [input];
      const embeddings = await client.getEmbeddings(inputs);

      const data = embeddings.map((embedding, index) => ({
        object: "embedding",
        index,
        embedding,
      }));

      return res.json({
        object: "list",
        data,
        model,
        usage: { prompt_tokens: 0, total_tokens: 0 },
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          error: { message: (error as any)?.message || "Internal error" },
        });
    }
  });

  // Retrieval endpoint (semantic search over Qdrant)
  app.post("/v1/retrieval/search", async (req, res) => {
    try {
      const { query, userId, knowledgeBaseId, documentId, limit, score_threshold } =
        req.body || {};
      if (!query || typeof query !== "string") {
        return res
          .status(400)
          .json({ error: { message: '"query" is required' } });
      }
      const resolvedUserId = userId ?? req.header("x-user-id");
      if (!resolvedUserId) {
        return res
          .status(400)
          .json({
            error: {
              message: '"userId" is required (body or x-user-id header)',
            },
          });
      }
      if (knowledgeBaseId === undefined || knowledgeBaseId === null) {
        return res
          .status(400)
          .json({
            error: {
              message: '"knowledgeBaseId" is required',
            },
          });
      }

      const client = new LiteLLMClient(
        process.env.LITELLM_BASE_URL!,
        process.env.LITELLM_API_KEY!,
        String(resolvedUserId)
      );
      const [queryVector] = await client.getEmbeddings([query]);

      const qdrant = new QdrantService(defaultCollection);
      const results = await qdrant.searchSimilarDocuments(
        queryVector,
        Number(resolvedUserId),
        Number(knowledgeBaseId),
        limit !== undefined ? Number(limit) : 10,
        score_threshold !== undefined ? Number(score_threshold) : 0.7,
        documentId !== undefined ? Number(documentId) : undefined
      );

      return res.json({
        query,
        matches: results.map((r) => ({
          id: r.id,
          score: r.score,
          payload: r.payload,
        })),
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          error: { message: (error as any)?.message || "Internal error" },
        });
    }
  });

  // Document removal endpoint
  app.delete("/v1/documents/:documentId", async (req, res) => {
    try {
      const { documentId } = req.params;
      const { userId, knowledgeBaseId } = req.body || {};

      if (!userId || typeof userId !== "number") {
        return res
          .status(400)
          .json({
            error: {
              message: '"userId" is required in request body',
            },
          });
      }

      if (!knowledgeBaseId || typeof knowledgeBaseId !== "number") {
        return res
          .status(400)
          .json({
            error: {
              message: '"knowledgeBaseId" is required in request body',
            },
          });
      }

      if (!documentId || isNaN(Number(documentId))) {
        return res
          .status(400)
          .json({
            error: {
              message: 'Invalid documentId parameter',
            },
          });
      }

      const liteLLMClient = new LiteLLMClient(
        process.env.LITELLM_BASE_URL!,
        process.env.LITELLM_API_KEY!,
        String(userId)
      );

      const documentProcessor = new DocumentProcessor(defaultCollection);
      const success = await documentProcessor.deleteDocumentVectors(
        Number(documentId),
        knowledgeBaseId
      );

      if (!success) {
        return res
          .status(500)
          .json({
            error: {
              message: "Failed to delete document vectors",
            },
          });
      }

      return res.json({
        message: "Document successfully removed",
        documentId: Number(documentId),
        knowledgeBaseId,
        userId,
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          error: { message: (error as any)?.message || "Internal error" },
        });
    }
  });

  return app;
}
