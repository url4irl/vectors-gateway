import dotenv from "dotenv";

// Load test environment variables
dotenv.config();

export function getConfig() {
  const {
    LITELLM_API_KEY,
    LITELLM_BASE_URL,
    DATABASE_URL,
    QDRANT_URL,
    QDRANT_API_KEY,
    API_KEY,
    QDRANT_COLLECTION_NAME,
    DEFAULT_EMBEDDING_MODEL,
    PORT,
    LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL,
    NODE_ENV,
  } = process.env;

  const missingVars = [];
  if (!LITELLM_API_KEY) missingVars.push("LITELLM_API_KEY");
  if (!LITELLM_BASE_URL) missingVars.push("LITELLM_BASE_URL");
  if (!DATABASE_URL) missingVars.push("DATABASE_URL");
  if (!QDRANT_URL) missingVars.push("QDRANT_URL");
  if (!API_KEY) missingVars.push("API_KEY");
  if (!LANGFUSE_PUBLIC_KEY) missingVars.push("LANGFUSE_PUBLIC_KEY");
  if (!LANGFUSE_SECRET_KEY) missingVars.push("LANGFUSE_SECRET_KEY");
  if (!LANGFUSE_BASE_URL) missingVars.push("LANGFUSE_BASE_URL");

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }

  return {
    LITELLM_API_KEY: LITELLM_API_KEY!,
    LITELLM_BASE_URL: LITELLM_BASE_URL!,
    DATABASE_URL: DATABASE_URL!,
    QDRANT_URL: QDRANT_URL!,
    QDRANT_API_KEY: QDRANT_API_KEY!,
    API_KEY: API_KEY!,
    QDRANT_COLLECTION_NAME: QDRANT_COLLECTION_NAME || "documents",
    DEFAULT_EMBEDDING_MODEL: DEFAULT_EMBEDDING_MODEL || "openai/bge-m3:latest",
    PORT: PORT ? parseInt(PORT, 10) : 4000,
    LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL,
    NODE_ENV: NODE_ENV || "development",
  };
}
