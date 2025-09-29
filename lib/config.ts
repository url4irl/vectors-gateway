export function getConfig() {
  const { LITELLM_API_KEY, LITELLM_BASE_URL, DATABASE_URL } = process.env;

  if (!LITELLM_API_KEY || !LITELLM_BASE_URL || !DATABASE_URL) {
    throw new Error("Missing required environment variables");
  }

  return {
    LITELLM_API_KEY,
    LITELLM_BASE_URL,
    DATABASE_URL,
  };
}
