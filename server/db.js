import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "vmc-hmi.db");

fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const STAGE_ORDER = [
  "powerOn",
  "machineChecks",
  "tools",
  "workpiece",
  "readyReview",
  "operation",
];

db.exec(`
    CREATE TABLE IF NOT EXISTS work_order (
      id INTEGER PRIMARY KEY,
      work_order TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      operation TEXT NOT NULL,
      material TEXT NOT NULL,
      drawing_revision TEXT NOT NULL,
      cnc_program_name TEXT NOT NULL,
      cnc_program_revision TEXT NOT NULL,
      fixture TEXT NOT NULL,
      work_offset TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS machine_checks (
      id INTEGER PRIMARY KEY,
      work_order_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_order_id) REFERENCES work_order(id)
    );

    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY,
      work_order_id INTEGER NOT NULL,
      tool_number TEXT NOT NULL,
      tool_type TEXT NOT NULL,
      program_revision TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_order_id) REFERENCES work_order(id)
    );

    CREATE TABLE IF NOT EXISTS workpiece_setup (
      id INTEGER PRIMARY KEY,
      work_order_id INTEGER NOT NULL,
      material TEXT NOT NULL,
      drawing_revision TEXT NOT NULL,
      orientation TEXT NOT NULL,
      clamping_instruction TEXT NOT NULL,
      work_offset TEXT NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_order_id) REFERENCES work_order(id)
    );

    CREATE TABLE IF NOT EXISTS session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_stage TEXT NOT NULL,
      operation_status TEXT NOT NULL,
      workpiece_confirmed INTEGER NOT NULL DEFAULT 0,
      power_on_confirmed INTEGER NOT NULL DEFAULT 0
    );
  `);

const sessionColumns = db.prepare("PRAGMA table_info(session)").all();
const hasPowerOn = sessionColumns.some(
  (column) => column.name === "power_on_confirmed",
);
if (!hasPowerOn) {
  db.exec(
    "ALTER TABLE session ADD COLUMN power_on_confirmed INTEGER NOT NULL DEFAULT 0",
  );
}

function initializeDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_order (
      id INTEGER PRIMARY KEY,
      work_order TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      operation TEXT NOT NULL,
      material TEXT NOT NULL,
      drawing_revision TEXT NOT NULL,
      cnc_program_name TEXT NOT NULL,
      cnc_program_revision TEXT NOT NULL,
      fixture TEXT NOT NULL,
      work_offset TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS machine_checks (
      id INTEGER PRIMARY KEY,
      work_order_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_order_id) REFERENCES work_order(id)
    );

    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY,
      work_order_id INTEGER NOT NULL,
      tool_number TEXT NOT NULL,
      tool_type TEXT NOT NULL,
      program_revision TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_order_id) REFERENCES work_order(id)
    );

    CREATE TABLE IF NOT EXISTS workpiece_setup (
      id INTEGER PRIMARY KEY,
      work_order_id INTEGER NOT NULL,
      material TEXT NOT NULL,
      drawing_revision TEXT NOT NULL,
      orientation TEXT NOT NULL,
      clamping_instruction TEXT NOT NULL,
      work_offset TEXT NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_order_id) REFERENCES work_order(id)
    );

    CREATE TABLE IF NOT EXISTS session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_stage TEXT NOT NULL,
      operation_status TEXT NOT NULL,
      workpiece_confirmed INTEGER NOT NULL DEFAULT 0,
      power_on_confirmed INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function getSessionRow() {
  const row = db.prepare("SELECT * FROM session WHERE id = 1").get();
  if (!row) {
    db.prepare(
      `
      INSERT INTO session (id, current_stage, operation_status, workpiece_confirmed, power_on_confirmed)
      VALUES (1, 'powerOn', 'READY', 0, 0)
    `,
    ).run();
    return getSessionRow();
  }
  return row;
}

function getWorkOrderRow() {
  return db.prepare("SELECT * FROM work_order ORDER BY id DESC LIMIT 1").get();
}

function getMachineChecks() {
  return db
    .prepare("SELECT * FROM machine_checks ORDER BY sort_order ASC")
    .all()
    .map((row) => ({
      id: row.id,
      item: row.item,
      confirmed: Boolean(row.confirmed),
    }));
}

function getTools() {
  return db
    .prepare("SELECT * FROM tools ORDER BY sort_order ASC")
    .all()
    .map((row) => ({
      id: row.id,
      toolNumber: row.tool_number,
      type: row.tool_type,
      programRevision: row.program_revision,
      confirmed: Boolean(row.confirmed),
    }));
}

function getWorkpieceSetup() {
  const row = db
    .prepare("SELECT * FROM workpiece_setup ORDER BY id DESC LIMIT 1")
    .get();
  if (!row) return null;
  return {
    id: row.id,
    material: row.material,
    drawingRevision: row.drawing_revision,
    orientation: row.orientation,
    clampingInstruction: row.clamping_instruction,
    workOffset: row.work_offset,
    confirmed: Boolean(row.confirmed),
  };
}

function allMachineChecksConfirmed() {
  return getMachineChecks().every((item) => item.confirmed);
}

function allToolsConfirmed() {
  return getTools().every((item) => item.confirmed);
}

function workpieceConfirmed() {
  const sessionRow = getSessionRow();
  return Boolean(sessionRow.workpiece_confirmed);
}

function getSessionSnapshot() {
  const workOrder = getWorkOrderRow();
  const sessionRow = getSessionRow();
  const workpiece = getWorkpieceSetup();

  return {
    workOrder: {
      workOrder: workOrder?.work_order || "WO-2026-0913",
      quantity: workOrder?.quantity || 25,
      operation: workOrder?.operation || "Milling — Pocket & Drill, Op 20",
      material: workOrder?.material || "Aluminum 6061-T6",
      drawingRevision: workOrder?.drawing_revision || "Rev C",
      cncProgram: {
        name: workOrder?.cnc_program_name || "O2031_POCKET_DRILL",
        revision: workOrder?.cnc_program_revision || "v4.2",
      },
      fixture: workOrder?.fixture || "Vise Fixture #3 (soft jaws)",
      workOffset: workOrder?.work_offset || "G54",
    },
    machineChecks: getMachineChecks(),
    tools: getTools(),
    workpiece: workpiece
      ? {
          material: workpiece.material,
          drawingRevision: workpiece.drawingRevision,
          orientation: workpiece.orientation,
          clampingInstruction: workpiece.clampingInstruction,
          workOffset: workpiece.workOffset,
          confirmed: workpiece.confirmed,
        }
      : {
          material: "Aluminum 6061-T6",
          drawingRevision: "Rev C",
          orientation: "Datum face up, origin at top-left corner",
          clampingInstruction:
            "Clamp in soft jaws, 15mm stock protrusion, torque to spec",
          workOffset: "G54",
          confirmed: false,
        },
    session: {
      currentStage: sessionRow.current_stage,
      operationStatus: sessionRow.operation_status,
      powerOnConfirmed: Boolean(sessionRow.power_on_confirmed),
      stageOrder: STAGE_ORDER,
    },
  };
}

function confirmMachineCheck(id) {
  const target = db
    .prepare("SELECT * FROM machine_checks WHERE id = ?")
    .get(id);
  if (!target) throw new Error("Machine check not found");
  db.prepare("UPDATE machine_checks SET confirmed = 1 WHERE id = ?").run(id);
  return getSessionSnapshot();
}

function confirmTool(id) {
  const target = db.prepare("SELECT * FROM tools WHERE id = ?").get(id);
  if (!target) throw new Error("Tool not found");
  db.prepare("UPDATE tools SET confirmed = 1 WHERE id = ?").run(id);
  return getSessionSnapshot();
}

function confirmWorkpieceSetup() {
  db.prepare(
    "UPDATE workpiece_setup SET confirmed = 1 WHERE id = (SELECT id FROM workpiece_setup ORDER BY id DESC LIMIT 1)",
  ).run();
  db.prepare("UPDATE session SET workpiece_confirmed = 1 WHERE id = 1").run();
  return getSessionSnapshot();
}

function advanceStage() {
  const sessionRow = getSessionRow();
  const currentStage = sessionRow.current_stage;

  if (currentStage === "powerOn" && !powerOnConfirmed()) {
    throw new Error("Power must be confirmed before moving to machine checks.");
  }

  if (currentStage === "machineChecks" && !allMachineChecksConfirmed()) {
    throw new Error("All machine checks must be confirmed before moving on.");
  }

  if (currentStage === "tools" && !allToolsConfirmed()) {
    throw new Error("All tools must be confirmed before moving on.");
  }

  if (currentStage === "workpiece" && !workpieceConfirmed()) {
    throw new Error("Workpiece setup must be confirmed before moving on.");
  }

  if (currentStage === "readyReview") {
    db.prepare(
      "UPDATE session SET current_stage = 'operation', operation_status = 'READY' WHERE id = 1",
    ).run();
    return getSessionSnapshot();
  }

  const index = STAGE_ORDER.indexOf(currentStage);
  const nextStage = STAGE_ORDER[index + 1];
  if (!nextStage) {
    throw new Error("No next stage available.");
  }

  db.prepare("UPDATE session SET current_stage = ? WHERE id = 1").run(
    nextStage,
  );
  return getSessionSnapshot();
}

function startOperation() {
  const sessionRow = getSessionRow();
  if (sessionRow.current_stage !== "operation") {
    throw new Error("Operation can only start on the operation stage.");
  }
  if (sessionRow.operation_status !== "READY") {
    throw new Error("Operation must be READY before it can start.");
  }
  if (
    !allMachineChecksConfirmed() ||
    !allToolsConfirmed() ||
    !workpieceConfirmed()
  ) {
    throw new Error(
      "All previous stages must be complete before starting the operation.",
    );
  }

  db.prepare(
    "UPDATE session SET operation_status = 'RUNNING' WHERE id = 1",
  ).run();
  return getSessionSnapshot();
}

function stopOperation() {
  const sessionRow = getSessionRow();
  if (sessionRow.current_stage !== "operation") {
    throw new Error("Operation can only be stopped on the operation stage.");
  }
  if (sessionRow.operation_status !== "RUNNING") {
    throw new Error("Operation must be RUNNING before it can be stopped.");
  }

  db.prepare(
    "UPDATE session SET operation_status = 'STOPPED' WHERE id = 1",
  ).run();
  return getSessionSnapshot();
}

function resetCycle() {
  db.prepare("UPDATE machine_checks SET confirmed = 0").run();
  db.prepare("UPDATE tools SET confirmed = 0").run();
  db.prepare(
    "UPDATE workpiece_setup SET confirmed = 0 WHERE id = (SELECT id FROM workpiece_setup ORDER BY id DESC LIMIT 1)",
  ).run();
  db.prepare(
    "UPDATE session SET current_stage = ?, operation_status = ?, workpiece_confirmed = 0, power_on_confirmed = 0 WHERE id = 1",
  ).run("powerOn", "READY");
  return getSessionSnapshot();
}

function powerOnConfirmed() {
  const sessionRow = getSessionRow();
  return Boolean(sessionRow.power_on_confirmed);
}

export {
  db,
  STAGE_ORDER,
  initializeDb,
  getSessionSnapshot,
  getSessionRow,
  confirmMachineCheck,
  confirmTool,
  confirmWorkpieceSetup,
  advanceStage,
  startOperation,
  stopOperation,
  resetCycle,
  allMachineChecksConfirmed,
  allToolsConfirmed,
  workpieceConfirmed,
  powerOnConfirmed,
};
