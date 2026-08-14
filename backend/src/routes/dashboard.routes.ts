import { Router } from "express";
import { db } from "../db";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const totals = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM zones) AS zone_count,
          (SELECT COUNT(*) FROM vehicles) AS vehicle_count,
          (SELECT COUNT(*) FROM violations) AS violation_count,
          (SELECT COUNT(*) FROM incidents WHERE status != 'resolved') AS open_incident_count,
          (SELECT COALESCE(SUM(fine_amount), 0) FROM violations) AS total_fines,
          (SELECT COALESCE(SUM(fine_amount), 0) FROM violations WHERE status = 'paid') AS collected_fines`,
      )
      .get();

    const severityBreakdown = db
      .prepare(`SELECT severity, COUNT(*) AS count FROM violations GROUP BY severity`)
      .all();

    const violationsByZone = db
      .prepare(
        `SELECT z.id, z.name, COUNT(v.id) AS violation_count
         FROM zones z LEFT JOIN violations v ON v.zone_id = z.id
         GROUP BY z.id ORDER BY violation_count DESC LIMIT 10`,
      )
      .all();

    const recentViolations = db
      .prepare(
        `SELECT v.id, v.recorded_speed_kph, v.speed_limit_kph, v.severity, v.fine_amount, v.status, v.recorded_at,
                veh.plate_number, z.name AS zone_name
         FROM violations v
         JOIN vehicles veh ON veh.id = v.vehicle_id
         JOIN zones z ON z.id = v.zone_id
         ORDER BY v.recorded_at DESC LIMIT 8`,
      )
      .all();

    const recentIncidents = db
      .prepare(
        `SELECT i.id, i.incident_type, i.severity, i.status, i.reported_at, z.name AS zone_name
         FROM incidents i LEFT JOIN zones z ON z.id = i.zone_id
         ORDER BY i.reported_at DESC LIMIT 8`,
      )
      .all();

    const violationsPerDay = db
      .prepare(
        `SELECT date(recorded_at) AS day, COUNT(*) AS count
         FROM violations
         WHERE recorded_at >= datetime('now', '-13 days')
         GROUP BY day ORDER BY day ASC`,
      )
      .all();

    res.json({
      totals,
      severityBreakdown,
      violationsByZone,
      recentViolations,
      recentIncidents,
      violationsPerDay,
    });
  }),
);
