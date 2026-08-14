import { Router } from "express";
import { db } from "../db";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { violationSchema, violationStatusSchema } from "../validators/schemas";
import { calculateViolation } from "../lib/violationCalc";
import { Zone } from "../types";

export const violationsRouter = Router();

violationsRouter.use(requireAuth);

const VIOLATION_LIST_QUERY = `
  SELECT v.*, veh.plate_number, veh.make, veh.model, veh.owner_name,
         z.name AS zone_name, z.road_name
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

violationsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = db.prepare(`${VIOLATION_LIST_QUERY} WHERE v.id = @id`).get({ id: req.params.id });
    if (!row) throw new HttpError(404, "Violation not found");
    res.json(row);
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

    const calc = calculateViolation(data.recorded_speed_kph, zone.speed_limit_kph);

    const result = db
      .prepare(
        `INSERT INTO violations
         (vehicle_id, zone_id, recorded_speed_kph, speed_limit_kph, over_limit_kph, severity, fine_amount, recorded_at, notes)
         VALUES (@vehicle_id, @zone_id, @recorded_speed_kph, @speed_limit_kph, @over_limit_kph, @severity, @fine_amount, @recorded_at, @notes)`,
      )
      .run({
        vehicle_id: data.vehicle_id,
        zone_id: data.zone_id,
        recorded_speed_kph: data.recorded_speed_kph,
        speed_limit_kph: zone.speed_limit_kph,
        over_limit_kph: calc.overLimitKph,
        severity: calc.severity,
        fine_amount: calc.fineAmount,
        recorded_at: data.recorded_at ?? new Date().toISOString(),
        notes: data.notes ?? null,
      });

    const violation = db.prepare(`${VIOLATION_LIST_QUERY} WHERE v.id = @id`).get({ id: result.lastInsertRowid });
    res.status(201).json(violation);
  }),
);

violationsRouter.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = violationStatusSchema.parse(req.body);
    const result = db.prepare("UPDATE violations SET status = ? WHERE id = ?").run(status, req.params.id);
    if (result.changes === 0) throw new HttpError(404, "Violation not found");
    const violation = db.prepare(`${VIOLATION_LIST_QUERY} WHERE v.id = @id`).get({ id: req.params.id });
    res.json(violation);
  }),
);

violationsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = db.prepare("DELETE FROM violations WHERE id = ?").run(req.params.id);
    if (result.changes === 0) throw new HttpError(404, "Violation not found");
    res.status(204).send();
  }),
);
