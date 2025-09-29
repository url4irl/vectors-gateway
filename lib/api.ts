import { createApp } from "./app";

import dotenv from "dotenv";
import { getConfig } from "./config";

// Load test environment variables
dotenv.config();

getConfig();

const app = createApp();
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Vectors Gateway is running on http://localhost:${PORT}`);
});
