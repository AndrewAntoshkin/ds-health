import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeUrl } from "./analyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/analyze", async (req, res) => {
  try {
    const report = await analyzeUrl(req.body?.url || "");
    res.json({ ok: true, report });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown analysis error",
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`ds-health running on http://localhost:${port}`);
});
