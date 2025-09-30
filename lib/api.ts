import { createApp } from "./app";

import { getConfig } from "./config";

const { PORT } = getConfig();

const app = createApp();

app.listen(PORT, () => {
  console.log(`Vectors Gateway is running on http://localhost:${PORT}`);
});
