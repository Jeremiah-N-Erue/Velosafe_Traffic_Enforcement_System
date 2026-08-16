import { Router } from "express";
import { db } from "../db";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { violationSchema, violationStatusSchema } from "../validators/schemas";
import { calculateViolation, calculateRedLightViolation } from "../lib/violationCalc";
import { saveEvidenceFile, readEvidenceFile } from "../lib/evidenceStore";
import { Zone, Violation, User } from "../types";

export const violationsRouter = Router();

violationsRouter.use(requireAuth);

const VIOLATION_LIST_QUERY = `
  SELECT v.*, veh.plate_number, veh.make, veh.model, veh.owner_name,
         z.name AS zone_name, z.road_name,
         (SELECT COUNT(*) FROM violation_evidence e WHERE e.violation_id = v.id) AS evidence_count
  FROM violations v
  JOIN vehicles veh ON veh.id = v.vehicle_id
  JOIN zones z ON z.id = v.zone_id
`;

violationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters: string[] = [];
    const params: Record<string, unknown> = {};

    if (req.query.severity) {
      filters.push("v.severity = @severity");
      params.severity = req.query.severity;
    }
    if (req.query.status) {
      filters.push("v.status = @status");
      params.status = req.query.status;
    }
    if (req.query.violation_type) {
      filters.push("v.violation_type = @violation_type");
      params.violation_type = req.query.violation_type;
    }
    if (req.query.zone_id) {
      filters.push("v.zone_id = @zone_id");
      params.zone_id = req.query.zone_id;
    }
    if (req.query.vehicle_id) {
      filters.push("v.vehicle_id = @vehicle_id");
      params.vehicle_id = req.query.vehicle_id;
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = db.prepare(`${VIOLATION_LIST_QUERY} ${where} ORDER BY v.recorded_at DESC LIMIT 500`).all(params);
    res.json(rows);
  }),
);

// Admin oversight — read-only audit trail of every review decision (who, what, when).
// Registered before "/:id" so it can never be shadowed by the single-segment param route.
violationsRouter.get(
  "/audit/log",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const filters: string[] = [];
    const params: Record<string, unknown> = {};
    if (req.query.changed_by) {
      filters.push("h.changed_by = @changed_by");
      params.changed_by = req.query.changed_by;
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `SELECT h.*, u.display_name AS changed_by_name, u.username AS changed_by_username,
                veh.plate_number, v.violation_type, v.severity, v.fine_amount
         FROM violation_status_history h
         LEFT JOIN users u ON u.id = h.changed_by
         JOIN violations v ON v.id = h.violation_id
         JOIN vehicles veh ON veh.id = v.vehicle_id
         ${where}
         ORDER BY h.changed_at DESC LIMIT 500`,
      )
      .all(params);
    res.json(rows);
  }),
);

violationsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = db.prepare(`${VIOLATION_LIST_QUERY} WHERE v.id = @id`).get({ id: req.params.id });
    if (!row) throw new HttpError(404, "Violation not found");

    const evidence = db
      .prepare(
        `SELECT id, mime_type, file_hash, uploaded_by, uploaded_at FROM violation_evidence
         WHERE violation_id = ? ORDER BY uploaded_at ASC`,
      )
      .all(req.params.id);

    const history = db
      .prepare(
        `SELECT h.*, u.display_name AS changed_by_name
         FROM violation_status_history h LEFT JOIN users u ON u.id = h.changed_by
         WHERE h.violation_id = ? ORDER BY h.changed_at ASC`,
      )
      .all(req.params.id);

    res.json({ ...(row as object), evidence, history });
  }),
);

violationsRouter.get(
  "/:id/evidence/:evidenceId/file",
  asyncHandler(async (req, res) => {
    const evidence = db
      .prepare("SELECT * FROM violation_evidence WHERE id = ? AND violation_id = ?")
      .get(req.params.evidenceId, req.params.id) as { file_path: string; mime_type: string } | undefined;
    if (!evidence) throw new HttpError(404, "Evidence not found");

    const buffer = readEvidenceFile(evidence.file_path);
    res.setHeader("Content-Type", evidence.mime_type);
    res.send(buffer);
  }),
);

violationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = violationSchema.parse(req.body);

    const vehicle = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(data.vehicle_id);
    if (!vehicle) throw new HttpError(404, "Vehicle not found");

    const zone = db.prepare("SELECT * FROM zones WHERE id = ?").get(data.zone_id) as Zone | undefined;
    if (!zone) throw new HttpError(404, "Zone not found");

    const isSpeed = data.violation_type === "speed";
    const calc = isSpeed
      ? calculateViolation(data.recorded_speed_kph, zone.speed_limit_kph)
      : calculateRedLightViolation(data.seconds_after_red);

    const insertViolation = db.prepare(
      `INSERT INTO violations
       (vehicle_id, zone_id, violation_type, recorded_speed_kph, speed_limit_kph, over_limit_kph,
        seconds_after_red, severity, fine_amount, status, recorded_at, notes, source_device_id)
       VALUES (@vehicle_id, @zone_id, @violation_type, @recorded_speed_kph, @speed_limit_kph, @over_limit_kph,
        @seconds_after_red, @severity, @fine_amount, 'pending', @recorded_at, @notes, NULL)`,
    );

    const insertTx = db.transaction(() => {
      const result = insertViolation.run({
        vehicle_id: data.vehicle_id,
        zone_id: data.zone_id,
        violation_type: data.violation_type,
        recorded_speed_kph: isSpeed ? data.recorded_speed_kph : null,
        speed_limit_kph: isSpeed ? zone.speed_limit_kph : null,
        over_limit_kph: isSpeed ? calc.overLimitKph : null,
        seconds_after_red: isSpeed ? null : data.seconds_after_red,
        severity: calc.severity,
        fine_amount: calc.fineAmount,
        recorded_at: data.recorded_at ?? new Date().toISOString(),
        notes: data.notes ?? null,
      });
      const violationId = Number(result.lastInsertRowid);

      const insertEvidence = db.prepare(
        `INSERT INTO violation_evidence (violation_id, file_path, mime_type, file_hash, uploaded_by)
         VALUES (@violation_id, @file_path, @mime_type, @file_hash, @uploaded_by)`,
      );
      for (const item of data.evidence) {
        const saved = saveEvidenceFile(item);
        insertEvidence.run({
          violation_id: violationId,
          file_path: saved.filePath,
          mime_type: saved.mimeType,
          file_hash: saved.fileHash,
          uploaded_by: req.user!.sub,
        });
      }

      db.prepare(
        `INSERT INTO violation_status_history (violation_id, from_status, to_status, changed_by, is_override, note)
         VALUES (@violation_id, NULL, 'pending', @changed_by, 0, 'Logged, awaiting review')`,
      ).run({ violation_id: violationId, changed_by: req.user!.sub });

      return violationId;
    });

    const violationId = insertTx();
    const violation = db.prepare(`${VIOLATION_LIST_QUERY} WHERE v.id = @id`).get({ id: violationId });
    res.status(201).json(violation);
  }),
);

// A "review" is the normal pending -> issued/dismissed decision (any authenticated user).
// A normal post-issuance lifecycle move is issued -> paid/disputed (any authenticated user).
// Anything else — including reversing an already-decided violation — is an OVERRIDE, and
// requires the requesting user's can_override_reviews flag to be set.
function isNormalTransition(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === "pending" && (toStatus === "issued" || toStatus === "dismissed")) return true;
  if (fromStatus === "issued" && (toStatus === "paid" || toStatus === "disputed")) return true;
  return false;
}

violationsRouter.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status, note } = violationStatusSchema.parse(req.body);
    const existing = db.prepare("SELECT * FROM violations WHERE id = ?").get(req.params.id) as
      | Violation
      | undefined;
    if (!existing) throw new HttpError(404, "Violation not found");

    if (existing.status === status) {
      const violation = db.prepare(`${VIOLATION_LIST_QUERY} WHERE v.id = @id`).get({ id: req.params.id });
      res.json(violation);
      return;
    }

    const normal = isNormalTransition(existing.status, status);
    if (!normal) {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.sub) as User | undefined;
      if (!user?.can_override_reviews) {
        throw new HttpError(
          403,
          "This change reverses or skips a prior review decision, which requires override permission you don't have",
        );
      }
    }

    const updateTx = db.transaction(() => {
      db.prepare("UPDATE violations SET status = ? WHERE id = ?").run(status, req.params.id);
      db.prepare(
        `INSERT INTO violation_status_history (violation_id, from_status, to_status, changed_by, is_override, note)
         VALUES (@violation_id, @from_status, @to_status, @changed_by, @is_override, @note)`,
      ).run({
        violation_id: Number(req.params.id),
        from_status: existing.status,
        to_status: status,
        changed_by: req.user!.sub,
        is_override: normal ? 0 : 1,
        note: note ?? null,
      });
    });
    updateTx();

    const violation = db.prepare(`${VIOLATION_LIST_QUERY} WHERE v.id = @id`).get({ id: req.params.id });
    res.json(violation);
  }),
);

violationsRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const result = db.prepare("DELETE FROM violations WHERE id = ?").run(req.params.id);
    if (result.changes === 0) throw new HttpError(404, "Violation not found");
    res.status(204).send();
  }),
);
