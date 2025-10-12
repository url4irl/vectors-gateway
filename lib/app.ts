import express from "express";
import swaggerUi from "swagger-ui-express";
import { jsDocSpecs } from "./docs";
import type { Application } from "express";
import { LiteLLMClient } from "./ai/sdk/litellm-client";
import { QdrantService } from "./ai/qdrant-service";
import { DocumentProcessor } from "./ai/document-processor";
import { getConfig } from "./config";
import { traceMiddleware, getTraceContext } from "./utils/tracing";
import { langfuse } from "./clients/langfuse";
import { qdrantCient } from "./clients/qdrant";

const { QDRANT_COLLECTION_NAME, LITELLM_API_KEY, LITELLM_BASE_URL, API_KEY } =
  getConfig();

export function createApp(enableSwagger: boolean = true): Application {
  const app = express();
  const defaultCollection = QDRANT_COLLECTION_NAME;

  // Increase body size limit for large documents (10MB)
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // Add distributed tracing middleware
  app.use(traceMiddleware);

  // API Key authentication middleware
  app.use((req, res, next) => {
    // Skip auth for health check and docs
    if (req.path === "/" || req.path.startsWith("/docs")) {
      return next();
    }

    const apiKey =
      req.header("x-api-key") ||
      req.header("authorization")?.replace("Bearer ", "");

    if (!apiKey) {
      return res.status(401).json({
        error: {
          message:
            "API key is required. Provide it via 'x-api-key' header or 'Authorization: Bearer <key>' header",
        },
      });
    }

    // Validate API key (you can enhance this with a database lookup)
    const validApiKey = API_KEY;
    if (validApiKey && apiKey !== validApiKey) {
      return res.status(401).json({
        error: { message: "Invalid API key" },
      });
    }

    // Store API key in request for potential use
    (req as any).apiKey = apiKey;
    next();
  });

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
    const langfuseConnected = await langfuse.api.healthHealth();
    if (langfuseConnected?.status !== "OK") {
      return res.status(503).json({
        error: {
          message: "Langfuse API is not available",
        },
      });
    }

    const qdrantConnected = await qdrantCient.healthCheck();
    if (!qdrantConnected) {
      return res.status(503).json({
        error: {
          message: "Qdrant API is not available",
        },
      });
    }

    res.json({
      message: "Vectors Gateway is running",
      documentation: "http://localhost:4000/docs",
      apiInfo: {
        endpoints: {
          retrieval: "POST /v1/retrieval/search",
          documents:
            "POST /v1/documents (ingest), DELETE /v1/documents/:documentId (remove)",
        },
      },
    });
  });

  // Retrieval endpoint (semantic search over Qdrant)
  app.post("/v1/retrieval/search", async (req, res) => {
    const traceContext = getTraceContext(req);
    const trace = langfuse.trace({
      name: "retrieval-search",
      id: traceContext.traceId,
      input: {
        query: req.body?.query,
        userId: req.body?.userId || req.header("x-user-id"),
        knowledgeBaseId: req.body?.knowledgeBaseId,
        documentId: req.body?.documentId,
        limit: req.body?.limit,
        score_threshold: req.body?.score_threshold,
      },
      metadata: {
        endpoint: "/v1/retrieval/search",
        method: "POST",
        userAgent: req.header("user-agent"),
        ip: req.ip,
      },
    });

    try {
      const {
        query,
        userId,
        knowledgeBaseId,
        documentId,
        limit,
        score_threshold,
      } = req.body || {};

      if (!query || typeof query !== "string") {
        trace.update({
          output: { error: "Query is required" },
        });
        await langfuse.flushAsync();
        return res
          .status(400)
          .json({ error: { message: '"query" is required' } });
      }

      const resolvedUserId = userId ?? req.header("x-user-id");
      if (!resolvedUserId) {
        trace.update({
          output: { error: "UserId is required" },
        });
        await langfuse.flushAsync();
        return res.status(400).json({
          error: {
            message: '"userId" is required (body or x-user-id header)',
          },
        });
      }

      if (knowledgeBaseId === undefined || knowledgeBaseId === null) {
        trace.update({
          output: { error: "KnowledgeBaseId is required" },
        });
        await langfuse.flushAsync();
        return res.status(400).json({
          error: {
            message: '"knowledgeBaseId" is required',
          },
        });
      }

      const client = new LiteLLMClient(
        LITELLM_BASE_URL,
        LITELLM_API_KEY,
        String(resolvedUserId),
        traceContext.traceId
      );
      const [queryVector] = await client.getEmbeddings([query]);

      const qdrant = new QdrantService(
        defaultCollection,
        1024,
        traceContext.traceId
      );
      const results = await qdrant.searchSimilarDocuments(
        queryVector,
        Number(resolvedUserId),
        Number(knowledgeBaseId),
        limit !== undefined ? Number(limit) : 10,
        score_threshold !== undefined ? Number(score_threshold) : 0.5,
        documentId !== undefined ? Number(documentId) : undefined
      );

      const response = {
        query,
        matches: results.map((r) => ({
          id: r.id,
          score: r.score,
          payload: r.payload,
        })),
      };

      trace.update({
        output: {
          matchesFound: results.length,
          averageScore:
            results.length > 0
              ? results.reduce((sum, r) => sum + r.score, 0) / results.length
              : 0,
          topScore:
            results.length > 0 ? Math.max(...results.map((r) => r.score)) : 0,
        },
      });

      await langfuse.flushAsync();
      return res.json(response);
    } catch (error) {
      trace.update({
        output: {
          error: (error as any)?.message || "Internal error",
        },
      });
      await langfuse.flushAsync();
      return res.status(500).json({
        error: { message: (error as any)?.message || "Internal error" },
      });
    }
  });

  // Document ingestion endpoint
  app.post("/v1/documents", async (req, res) => {
    const traceContext = getTraceContext(req);
    const trace = langfuse.trace({
      name: "document-ingestion",
      id: traceContext.traceId,
      input: {
        documentId: req.body?.documentId,
        knowledgeBaseId: req.body?.knowledgeBaseId,
        userId: req.body?.userId,
        contentLength: req.body?.content?.length,
      },
      metadata: {
        endpoint: "/v1/documents",
        method: "POST",
        userAgent: req.header("user-agent"),
        ip: req.ip,
      },
    });

    try {
      const { content, userId, knowledgeBaseId, documentId } = req.body || {};

      if (!content || typeof content !== "string") {
        trace.update({
          output: { error: "Content is required and must be a string" },
        });
        await langfuse.flushAsync();
        return res.status(400).json({
          error: { message: '"content" is required and must be a string' },
        });
      }

      if (!userId || typeof userId !== "number") {
        trace.update({
          output: { error: "UserId is required and must be a number" },
        });
        await langfuse.flushAsync();
        return res.status(400).json({
          error: { message: '"userId" is required and must be a number' },
        });
      }

      if (!knowledgeBaseId || typeof knowledgeBaseId !== "number") {
        trace.update({
          output: { error: "KnowledgeBaseId is required and must be a number" },
        });
        await langfuse.flushAsync();
        return res.status(400).json({
          error: {
            message: '"knowledgeBaseId" is required and must be a number',
          },
        });
      }

      if (!documentId || typeof documentId !== "number") {
        trace.update({
          output: { error: "DocumentId is required and must be a number" },
        });
        await langfuse.flushAsync();
        return res.status(400).json({
          error: { message: '"documentId" is required and must be a number' },
        });
      }

      const documentProcessor = new DocumentProcessor(
        defaultCollection,
        traceContext.traceId
      );
      const result = await documentProcessor.processDocument(
        content,
        documentId,
        knowledgeBaseId,
        userId
      );

      const response = {
        message: "Document successfully processed and stored",
        documentId,
        knowledgeBaseId,
        userId,
        vectorCount: result.vectorCount,
      };

      trace.update({
        output: {
          vectorCount: result.vectorCount,
          documentId,
          knowledgeBaseId,
          userId,
        },
      });

      await langfuse.flushAsync();
      return res.json(response);
    } catch (error) {
      trace.update({
        output: {
          error: (error as any)?.message || "Internal error",
        },
      });
      await langfuse.flushAsync();
      return res.status(500).json({
        error: { message: (error as any)?.message || "Internal error" },
      });
    }
  });

  // Document removal endpoint
  app.delete("/v1/documents/:documentId", async (req, res) => {
    const traceContext = getTraceContext(req);
    const trace = langfuse.trace({
      name: "document-removal",
      id: traceContext.traceId,
      input: {
        documentId: req.params.documentId,
        userId: req.body?.userId,
        knowledgeBaseId: req.body?.knowledgeBaseId,
      },
      metadata: {
        endpoint: "/v1/documents/:documentId",
        method: "DELETE",
        userAgent: req.header("user-agent"),
        ip: req.ip,
      },
    });

    try {
      const { documentId } = req.params;
      const { userId, knowledgeBaseId } = req.body || {};

      if (!userId || typeof userId !== "number") {
        trace.update({
          output: { error: "UserId is required in request body" },
        });
        await langfuse.flushAsync();
        return res.status(400).json({
          error: {
            message: '"userId" is required in request body',
          },
        });
      }

      if (!knowledgeBaseId || typeof knowledgeBaseId !== "number") {
        trace.update({
          output: { error: "KnowledgeBaseId is required in request body" },
        });
        await langfuse.flushAsync();
        return res.status(400).json({
          error: {
            message: '"knowledgeBaseId" is required in request body',
          },
        });
      }

      if (!documentId || isNaN(Number(documentId))) {
        trace.update({
          output: { error: "Invalid documentId parameter" },
        });
        await langfuse.flushAsync();
        return res.status(400).json({
          error: {
            message: "Invalid documentId parameter",
          },
        });
      }

      const documentProcessor = new DocumentProcessor(
        defaultCollection,
        traceContext.traceId
      );
      const success = await documentProcessor.deleteDocumentVectors(
        Number(documentId),
        knowledgeBaseId
      );

      if (!success) {
        trace.update({
          output: { error: "Failed to delete document vectors" },
        });
        await langfuse.flushAsync();
        return res.status(500).json({
          error: {
            message: "Failed to delete document vectors",
          },
        });
      }

      const response = {
        message: "Document successfully removed",
        documentId: Number(documentId),
        knowledgeBaseId,
        userId,
      };

      trace.update({
        output: {
          documentId: Number(documentId),
          knowledgeBaseId,
          userId,
        },
      });

      await langfuse.flushAsync();
      return res.json(response);
    } catch (error) {
      trace.update({
        output: {
          error: (error as any)?.message || "Internal error",
        },
      });
      await langfuse.flushAsync();
      return res.status(500).json({
        error: { message: (error as any)?.message || "Internal error" },
      });
    }
  });

  return app;
}
