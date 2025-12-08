import { Langfuse } from "langfuse";
import pkg from "../../package.json";
import { config } from "../config";

// Create a centralized Langfuse client instance
export const langfuse = new Langfuse({
  publicKey: config.LANGFUSE_PUBLIC_KEY,
  secretKey: config.LANGFUSE_SECRET_KEY,
  baseUrl: config.LANGFUSE_BASE_URL,
  environment: config.NODE_ENV,
  release: pkg.version,
});

// Add error handling debugging
langfuse.on("error", (error) => {
  console.error("🚨 Langfuse Error:", error);
});
