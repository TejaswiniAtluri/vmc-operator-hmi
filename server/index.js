import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeDb,
  getSessionSnapshot,
  confirmMachineCheck,
  confirmTool,
  confirmWorkpieceSetup,
  advanceStage,
  startOperation,
  stopOperation,
  resetCycle,
  getSessionRow,
  db,
} from "./db.js";
import { seedDatabase } from "./seed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

initializeDb();
seedDatabase();

const app = express();
const PORT = process.env.PORT || 3001;
const cors = require("cors");
app.use(cors({
  origin: "https://vmc-operator-hmi-p7t6.vercel.app",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));
app.use(express.json());

const handleStageNext = (_req, res) => {
  try {
    res.json(advanceStage());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const handleStartOperation = (_req, res) => {
  try {
    res.json(startOperation());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const handleStopOperation = (_req, res) => {
  try {
    res.json(stopOperation());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const handleResetCycle = (_req, res) => {
  try {
    res.json(resetCycle());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const handlePowerOn = (_req, res) => {
  try {
    const session = getSessionRow();
    if (session.current_stage !== "powerOn") {
      throw new Error(
        "Power-on confirmation is only required on the power-on stage.",
      );
    }
    db.prepare("UPDATE session SET power_on_confirmed = 1 WHERE id = 1").run();
    res.json(getSessionSnapshot());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "healthy" });
});

app.get("/api/session", (_req, res) => {
  try {
    res.json(getSessionSnapshot());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/stage/current", (_req, res) => {
  try {
    res.json(getSessionSnapshot());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/operation/status", (_req, res) => {
  try {
    const session = getSessionRow();
    res.json({ status: session.operation_status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/checks/:id/confirm", (req, res) => {
  try {
    const id = Number(req.params.id);
    res.json(confirmMachineCheck(id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/tools/:id/confirm", (req, res) => {
  try {
    const id = Number(req.params.id);
    res.json(confirmTool(id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/workpiece/confirm", (_req, res) => {
  try {
    res.json(confirmWorkpieceSetup());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/stage/next", handleStageNext);
app.post("/stage/next", handleStageNext);

app.post("/api/operation/start", handleStartOperation);
app.post("/operation/start", handleStartOperation);

app.post("/api/operation/stop", handleStopOperation);
app.post("/operation/stop", handleStopOperation);

app.post("/api/session/reset", handleResetCycle);
app.post("/api/reset", handleResetCycle);

app.post("/api/power-on/confirm", handlePowerOn);

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/stage") ||
    req.path.startsWith("/operation")
  ) {
    next();
    return;
  }
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`VMC HMI API listening on http://localhost:${PORT}`);
});
