/**
 * openai-prefixed embedding models are available through Ollama (self-hosted).
 */
export function getEmbeddingModel(): string {
  return "openai/bge-m3:latest";
}
