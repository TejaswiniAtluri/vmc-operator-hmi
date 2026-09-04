import { db } from "./db.js";

function seedDatabase() {
  const workOrderCount = db
    .prepare("SELECT COUNT(*) AS count FROM work_order")
    .get().count;
  const machineChecksCount = db
    .prepare("SELECT COUNT(*) AS count FROM machine_checks")
    .get().count;
  const toolsCount = db
    .prepare("SELECT COUNT(*) AS count FROM tools")
    .get().count;
  const workpieceCount = db
    .prepare("SELECT COUNT(*) AS count FROM workpiece_setup")
    .get().count;

  const sessionRow = db.prepare("SELECT * FROM session WHERE id = 1").get();
  const sessionIsValid =
    sessionRow &&
    sessionRow.current_stage === "powerOn" &&
    machineChecksCount === 6 &&
    toolsCount === 4 &&
    workpieceCount === 1;

  if (sessionIsValid) {
    return;
  }

  db.exec(`
    DELETE FROM machine_checks;
    DELETE FROM tools;
    DELETE FROM workpiece_setup;
    DELETE FROM session;
    DELETE FROM work_order;
  `);

  const scenario = {
    workOrder: "WO-2026-0913",
    quantity: 25,
    operation: "Milling — Pocket & Drill, Op 20",
    material: "Aluminum 6061-T6",
    drawingRevision: "Rev C",
    cncProgram: { name: "O2031_POCKET_DRILL", revision: "v4.2" },
    fixture: "Vise Fixture #3 (soft jaws)",
    workOffset: "G54",
    workpiece: {
      orientation: "Datum face up, origin at top-left corner",
      clampingInstruction:
        "Clamp in soft jaws, 15mm stock protrusion, torque to spec",
    },
    requiredTools: [
      { toolNumber: "T01", type: "Face Mill Ø50mm", programRevision: "v4.2" },
      {
        toolNumber: "T02",
        type: "End Mill Ø10mm 4-flute",
        programRevision: "v4.2",
      },
      { toolNumber: "T03", type: "Center Drill Ø3mm", programRevision: "v4.2" },
      {
        toolNumber: "T04",
        type: "Twist Drill Ø8.5mm",
        programRevision: "v4.2",
      },
    ],
    machineChecks: [
      "Power / control available",
      "E-stop released",
      "Guard / door closed",
      "No active alarm",
      "Lubrication / coolant ready",
      "Reference return complete",
    ],
  };

  const workOrderResult = db
    .prepare(
      `
    INSERT INTO work_order (work_order, quantity, operation, material, drawing_revision, cnc_program_name, cnc_program_revision, fixture, work_offset)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      scenario.workOrder,
      scenario.quantity,
      scenario.operation,
      scenario.material,
      scenario.drawingRevision,
      scenario.cncProgram.name,
      scenario.cncProgram.revision,
      scenario.fixture,
      scenario.workOffset,
    );

  const workOrderId = workOrderResult.lastInsertRowid;

  scenario.machineChecks.forEach((item, index) => {
    db.prepare(
      "INSERT INTO machine_checks (work_order_id, item, sort_order, confirmed) VALUES (?, ?, ?, 0)",
    ).run(workOrderId, item, index + 1);
  });

  scenario.requiredTools.forEach((tool, index) => {
    db.prepare(
      "INSERT INTO tools (work_order_id, tool_number, tool_type, program_revision, sort_order, confirmed) VALUES (?, ?, ?, ?, ?, 0)",
    ).run(
      workOrderId,
      tool.toolNumber,
      tool.type,
      tool.programRevision,
      index + 1,
    );
  });

  db.prepare(
    `
    INSERT INTO workpiece_setup (work_order_id, material, drawing_revision, orientation, clamping_instruction, work_offset, confirmed)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `,
  ).run(
    workOrderId,
    scenario.material,
    scenario.drawingRevision,
    scenario.workpiece.orientation,
    scenario.workpiece.clampingInstruction,
    scenario.workOffset,
  );

  db.prepare(
    `
    INSERT INTO session (id, current_stage, operation_status, workpiece_confirmed, power_on_confirmed)
    VALUES (1, 'powerOn', 'READY', 0, 0)
  `,
  ).run();
}

export { seedDatabase };
