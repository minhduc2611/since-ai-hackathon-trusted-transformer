import cors from "cors";
import express from "express";
import { authRouter, requireAuth } from "./auth/index.js";
import { errorHandler } from "./http.js";
import { datasetsRouter } from "./routes/datasets.js";
import { jobsRouter } from "./routes/jobs.js";
import { resultsRouter } from "./routes/results.js";

const PORT = Number(process.env.PORT || 8787);

const app = express();
app.set("trust proxy", "loopback");
app.use(cors());
app.use(express.json());
app.get("/api/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});
app.use("/api/auth", authRouter);
app.use("/api", requireAuth);
app.use("/api", datasetsRouter);
app.use("/api", jobsRouter);
app.use("/api", resultsRouter);
app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`PETs API listening on http://localhost:${PORT}/api`);
});
