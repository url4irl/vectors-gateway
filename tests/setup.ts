import path from "path";
import dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: path.join(__dirname, "..", ".env.test") });

// Ensure we're using the test database
if (!process.env.DATABASE_URL?.includes("test")) {
  throw new Error(
    "Test environment must use a test database. Check .env.test file."
  );
}

if (!process.env.LITELLM_API_KEY) {
  throw new Error("LITELLM_API_KEY is not set in environment variables.");
}

if (!process.env.LITELLM_BASE_URL) {
  throw new Error("LITELLM_BASE_URL is not set in environment variables.");
}
