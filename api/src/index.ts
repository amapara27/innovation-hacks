import dotenv from "dotenv";
import { createApp } from "./app.js";
import { ensureDatabaseSchema } from "./lib/ensureDatabase.js";

dotenv.config();

await ensureDatabaseSchema();

const app = createApp();
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🌱 CarbonIQ API running on http://localhost:${PORT}`);
});
