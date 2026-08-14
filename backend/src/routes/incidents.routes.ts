import { Router } from "express";
import { db } from "../db";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { incidentSchema, incidentUpdateSchema } from "../validators/schemas";
import { Incident } from "../types";

export const incidentsRouter = Router();

incidentsRouter.use(requireAuth);

const INCIDENT_LIST_QUERY = `
  SELECT i.*, z.name AS zone_name, z.road_name
  FROM incidents i
  LEFT JOIN zones z ON z.id = i.zone_id
`;

incidentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters: string[] = [];
    const params: Record<string, unknown> = {};
    if (req.query.status) {
      filters.push("i.status = @status");
      params.status = req.query.status;
    }
    if (req.query.severity) {
      filters.push("i.severity = @severity");
      params.severity = req.query.severity;
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = db.prepare(`${INCIDENT_LIST_QUERY} ${where} ORDER BY i.reported_at DESC LIMIT 500`).all(params);
    res.json(rows);
  }),
);

incidentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = db.prepare(`${INCIDENT_LIST_QUERY} WHERE i.id = @id`).get({ id: req.params.id });
    if (!row) throw new HttpError(404, "Incident not found");
    res.json(row);
  }),
);

incidentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = incidentSchema.parse(req.body);
    const result = db
      .prepare(
        `INSERT INTO incidents (zone_id, incident_type, severity, description, status)
         VALUES (@zone_id, @incident_type, @severity, @description, @status)`,
      )
      .run({
        zone_id: data.zone_id ?? null,
        incident_type: data.incident_type,
        severity: data.severity ?? "medium",
        description: data.description,
        status: data.status ?? "open",
      });
    const incident = db.prepare(`${INCIDENT_LIST_QUERY} WHERE i.id = @id`).get({ id: result.lastInsertRowid });
    res.status(201).json(incident);
  }),
);

incidentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = db.prepare("SELECT * FROM incidents WHERE id = ?").get(req.params.id) as Incident | undefined;
    if (!existing) throw new HttpError(404, "Incident not found");

    const data = incidentUpdateSchema.parse(req.body);
    const merged = { ...existing, ...data };
    const resolvedAt =
      merged.status === "resolved" && existing.status !== "resolved"
        ? new Date().toISOString()
        : merged.status === "resolved"
          ? existing.resolved_at
          : null;

    db.prepare(
      `UPDATE incidents SET zone_id=@zone_id, incident_type=@incident_type, severity=@severity,
       description=@description, status=@status, resolved_at=@resolved_at WHERE id=@id`,
    ).run({
      id: existing.id,
      zone_id: merged.zone_id ?? null,
      incident_type: merged.incident_type,
      severity: merged.severity,
      description: merged.description,
      status: merged.status,
      resolved_at: resolvedAt,
    });

    const incident = db.prepare(`${INCIDENT_LIST_QUERY} WHERE i.id = @id`).get({ id: existing.id });
    res.json(incident);
  }),
);

incidentsRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const result = db.prepare("DELETE FROM incidents WHERE id = ?").run(req.params.id);
    if (result.changes === 0) throw new HttpError(404, "Incident not found");
    res.status(204).send();
  }),
);
