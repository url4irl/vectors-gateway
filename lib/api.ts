import { createApp } from "./app";

import { config } from "./config";

const { PORT } = config;

const app = createApp();

app.listen(PORT, () => {
  console.log(`Vectors Gateway is running on http://localhost:${PORT}`);
});
