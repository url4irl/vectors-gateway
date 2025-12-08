import dotenv from "dotenv";

dotenv.config();

interface Env {
  // Core Application
  NODE_ENV: string;
  PORT: number;

  // Storage
  DATABASE_URL: string;

  // Qdrant
  QDRANT_URL: string;
  QDRANT_API_KEY: string;
  QDRANT_COLLECTION_NAME: string;

  // LiteLLM
  LITELLM_API_KEY: string;
  LITELLM_BASE_URL: string;
  DEFAULT_EMBEDDING_MODEL: string;

  // Langfuse
  LANGFUSE_PUBLIC_KEY: string;
  LANGFUSE_SECRET_KEY: string;
  LANGFUSE_BASE_URL: string;

  // API
  API_KEY: string;

  // Authentication & Security
  ENCRYPTION_KEY: string;
  ALLOWED_IPS: string[];
  ALLOWED_DOMAINS: string[];

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  RATE_LIMIT_STRICT_WINDOW_MS: number;
  RATE_LIMIT_STRICT_MAX_REQUESTS: number;

  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
}

function validateRequiredEnvVar(
  name: string,
  value: string | undefined
): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `❌ Missing required environment variable: ${name}\n` +
        `   This variable is essential for the application to function properly.\n` +
        `   Please set ${name} in your environment configuration.`
    );
  }
  return value;
}

function validateOptionalEnvVar(
  name: string,
  value: string | undefined,
  defaultValue: string = ""
): string {
  return value || defaultValue;
}

function validateOptionalArrayEnvVar(
  name: string,
  value: string | undefined
): string[] {
  return value ? value.split(",").map((item) => item.trim()) : [];
}

function validateOptionalNumberEnvVar(
  name: string,
  value: string | undefined,
  defaultValue: number
): number {
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) {
    console.warn(
      `⚠️  Invalid value for ${name}: "${value}". Using default: ${defaultValue}`
    );
    return defaultValue;
  }
  return parsed;
}

function validateEncryptionKey(
  name: string,
  value: string | undefined
): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `❌ Missing required environment variable: ${name}\n` +
        `   This variable is essential for AES-256-GCM encryption.\n` +
        `   Generate a valid key with: openssl rand -hex 32`
    );
  }

  const trimmedValue = value.trim();

  // AES-256 requires 32 bytes (256 bits), which is 64 hex characters
  const EXPECTED_LENGTH = 64;
  if (trimmedValue.length !== EXPECTED_LENGTH) {
    throw new Error(
      `❌ Invalid ${name}: Expected ${EXPECTED_LENGTH} hexadecimal characters, got ${trimmedValue.length}\n` +
        `   AES-256-GCM requires a 256-bit key (32 bytes = 64 hex chars)\n` +
        `   Generate a valid key with: openssl rand -hex 32\n` +
        `   Example: a1b2c3d4e5f6... (64 characters total)`
    );
  }

  // Validate that it's a valid hex string
  const hexPattern = /^[0-9a-fA-F]{64}$/;
  if (!hexPattern.test(trimmedValue)) {
    throw new Error(
      `❌ Invalid ${name}: Must contain only hexadecimal characters (0-9, a-f, A-F)\n` +
        `   Generate a valid key with: openssl rand -hex 32`
    );
  }

  return trimmedValue;
}

function getEnv(): Env {
  // Validate required environment variables (excluding ENCRYPTION_KEY - validated separately)
  const requiredVars = {
    DATABASE_URL: process.env.DATABASE_URL,
    QDRANT_URL: process.env.QDRANT_URL,
    LITELLM_API_KEY: process.env.LITELLM_API_KEY,
    LITELLM_BASE_URL: process.env.LITELLM_BASE_URL,
    API_KEY: process.env.API_KEY,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
  };

  // Check all required variables at once for better error reporting
  const missingVars: string[] = [];
  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value || value.trim() === "") {
      missingVars.push(key);
    }
  }

  if (missingVars.length > 0) {
    throw new Error(
      `❌ Missing required environment variables: ${missingVars.join(", ")}\n` +
        `   These variables are essential for the application to function properly.\n` +
        `   Please set the following environment variables:\n` +
        missingVars.map((varName) => `   - ${varName}`).join("\n")
    );
  }

  return {
    // Core Application
    NODE_ENV: validateOptionalEnvVar(
      "NODE_ENV",
      process.env.NODE_ENV,
      "development"
    ),
    PORT: validateOptionalNumberEnvVar("PORT", process.env.PORT, 4000),

    // Storage
    DATABASE_URL: validateRequiredEnvVar(
      "DATABASE_URL",
      process.env.DATABASE_URL
    ),

    // Qdrant
    QDRANT_URL: validateRequiredEnvVar("QDRANT_URL", process.env.QDRANT_URL),
    QDRANT_API_KEY: validateOptionalEnvVar(
      "QDRANT_API_KEY",
      process.env.QDRANT_API_KEY
    ),
    QDRANT_COLLECTION_NAME: validateOptionalEnvVar(
      "QDRANT_COLLECTION_NAME",
      process.env.QDRANT_COLLECTION_NAME,
      "documents"
    ),

    // LiteLLM
    LITELLM_API_KEY: validateRequiredEnvVar(
      "LITELLM_API_KEY",
      process.env.LITELLM_API_KEY
    ),
    LITELLM_BASE_URL: validateRequiredEnvVar(
      "LITELLM_BASE_URL",
      process.env.LITELLM_BASE_URL
    ),
    DEFAULT_EMBEDDING_MODEL: validateOptionalEnvVar(
      "DEFAULT_EMBEDDING_MODEL",
      process.env.DEFAULT_EMBEDDING_MODEL,
      "openai/bge-m3:latest"
    ),

    // Langfuse
    LANGFUSE_PUBLIC_KEY: validateRequiredEnvVar(
      "LANGFUSE_PUBLIC_KEY",
      process.env.LANGFUSE_PUBLIC_KEY
    ),
    LANGFUSE_SECRET_KEY: validateRequiredEnvVar(
      "LANGFUSE_SECRET_KEY",
      process.env.LANGFUSE_SECRET_KEY
    ),
    LANGFUSE_BASE_URL: validateRequiredEnvVar(
      "LANGFUSE_BASE_URL",
      process.env.LANGFUSE_BASE_URL
    ),

    // API
    API_KEY: validateRequiredEnvVar("API_KEY", process.env.API_KEY),

    // Authentication & Security
    ALLOWED_IPS: validateOptionalArrayEnvVar(
      "ALLOWED_IPS",
      process.env.ALLOWED_IPS
    ),
    ALLOWED_DOMAINS: validateOptionalArrayEnvVar(
      "ALLOWED_DOMAINS",
      process.env.ALLOWED_DOMAINS
    ),
    ENCRYPTION_KEY: validateEncryptionKey(
      "ENCRYPTION_KEY",
      process.env.ENCRYPTION_KEY
    ),

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: validateOptionalNumberEnvVar(
      "RATE_LIMIT_WINDOW_MS",
      process.env.RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000 // 15 minutes default
    ),
    RATE_LIMIT_MAX_REQUESTS: validateOptionalNumberEnvVar(
      "RATE_LIMIT_MAX_REQUESTS",
      process.env.RATE_LIMIT_MAX_REQUESTS,
      100 // 100 requests per window default
    ),
    RATE_LIMIT_STRICT_WINDOW_MS: validateOptionalNumberEnvVar(
      "RATE_LIMIT_STRICT_WINDOW_MS",
      process.env.RATE_LIMIT_STRICT_WINDOW_MS,
      60 * 1000 // 1 minute default
    ),
    RATE_LIMIT_STRICT_MAX_REQUESTS: validateOptionalNumberEnvVar(
      "RATE_LIMIT_STRICT_MAX_REQUESTS",
      process.env.RATE_LIMIT_STRICT_MAX_REQUESTS,
      10 // 10 requests per window default
    ),

    // OpenTelemetry
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  };
}

export const config = getEnv();
