/**
 * openai-prefixed embedding models are available through Ollama (self-hosted).
 */
export function getEmbeddingModel(): string {
  return process.env.DEFAULT_EMBEDDING_MODEL || "openai/bge-m3:latest";
}
