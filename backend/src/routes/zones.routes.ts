import { Router } from "express";
import { db } from "../db";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { zoneSchema, zoneUpdateSchema } from "../validators/schemas";
import { Zone, ZoneHistoryAction } from "../types";

export const zonesRouter = Router();

zonesRouter.use(requireAuth);

// Zone configuration (speed limits, road metadata) is administrative — only
// admins can create, edit, or remove zones. Operators can still view them.

function recordZoneHistory(
  zoneId: number,
  action: ZoneHistoryAction,
  before: unknown,
  after: unknown,
  changedBy: number | undefined,
) {
  db.prepare(
    `INSERT INTO zone_history (zone_id, action, before_data, after_data, changed_by)
     VALUES (@zone_id, @action, @before_data, @after_data, @changed_by)`,
  ).run({
    zone_id: zoneId,
    action,
    before_data: before ? JSON.stringify(before) : null,
    after_data: after ? JSON.stringify(after) : null,
    changed_by: changedBy ?? null,
  });
}

zonesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const zones = db.prepare("SELECT * FROM zones ORDER BY name ASC").all();
    res.json(zones);
  }),
);

// Zone change log — read-only, admin-only, and there is no corresponding DELETE route anywhere
// in this router: customers cannot purge it themselves. Registered before "/:id" so it can never
// be shadowed by the single-segment param route.
zonesRouter.get(
  "/audit/log",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const filters: string[] = [];
    const params: Record<string, unknown> = {};
    if (req.query.zone_id) {
      filters.push("h.zone_id = @zone_id");
      params.zone_id = req.query.zone_id;
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `SELECT h.*, u.display_name AS changed_by_name, z.name AS current_zone_name
         FROM zone_history h
         LEFT JOIN users u ON u.id = h.changed_by
         LEFT JOIN zones z ON z.id = h.zone_id
         ${where}
         ORDER BY h.changed_at DESC LIMIT 500`,
      )
      .all(params);
    res.json(rows);
  }),
);

zonesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const zone = db.prepare("SELECT * FROM zones WHERE id = ?").get(req.params.id);
    if (!zone) throw new HttpError(404, "Zone not found");
    res.json(zone);
  }),
);

zonesRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const data = zoneSchema.parse(req.body);
    const result = db
      .prepare(
        `INSERT INTO zones (name, road_name, speed_limit_kph, zone_type, latitude, longitude, active)
         VALUES (@name, @road_name, @speed_limit_kph, @zone_type, @latitude, @longitude, @active)`,
      )
      .run({
        name: data.name,
        road_name: data.road_name,
        speed_limit_kph: data.speed_limit_kph,
        zone_type: data.zone_type,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        active: data.active === false ? 0 : 1,
      });
    const zone = db.prepare("SELECT * FROM zones WHERE id = ?").get(result.lastInsertRowid) as Zone;
    recordZoneHistory(zone.id, "created", null, zone, req.user!.sub);
    res.status(201).json(zone);
  }),
);

zonesRouter.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const existing = db.prepare("SELECT * FROM zones WHERE id = ?").get(req.params.id) as Zone | undefined;
    if (!existing) throw new HttpError(404, "Zone not found");

    const data = zoneUpdateSchema.parse(req.body);
    const merged = { ...existing, ...data };
    db.prepare(
      `UPDATE zones SET name=@name, road_name=@road_name, speed_limit_kph=@speed_limit_kph,
       zone_type=@zone_type, latitude=@latitude, longitude=@longitude, active=@active WHERE id=@id`,
    ).run({
      id: existing.id,
      name: merged.name,
      road_name: merged.road_name,
      speed_limit_kph: merged.speed_limit_kph,
      zone_type: merged.zone_type,
      latitude: merged.latitude ?? null,
      longitude: merged.longitude ?? null,
      active: typeof merged.active === "boolean" ? (merged.active ? 1 : 0) : merged.active,
    });
    const zone = db.prepare("SELECT * FROM zones WHERE id = ?").get(existing.id) as Zone;
    recordZoneHistory(zone.id, "updated", existing, zone, req.user!.sub);
    res.json(zone);
  }),
);

zonesRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const existing = db.prepare("SELECT * FROM zones WHERE id = ?").get(req.params.id) as Zone | undefined;
    if (!existing) throw new HttpError(404, "Zone not found");

    // Hard-deleting a zone cascades to delete every violation logged against it (and with it,
    // their evidence and review history) — a zone with violation records on file cannot be
    // hard-deleted. Deactivate it instead (PATCH active: false) to stop new violations there
    // without destroying existing evidence/audit records.
    const { count } = db
      .prepare("SELECT COUNT(*) AS count FROM violations WHERE zone_id = ?")
      .get(req.params.id) as { count: number };
    if (count > 0) {
      throw new HttpError(
        409,
        `This zone has ${count} violation record(s) with evidence and audit history attached. Deleting it would destroy those records. Deactivate the zone instead to stop new violations there.`,
      );
    }

    const result = db.prepare("DELETE FROM zones WHERE id = ?").run(req.params.id);
    if (result.changes === 0) throw new HttpError(404, "Zone not found");
    recordZoneHistory(existing.id, "deleted", existing, null, req.user!.sub);
    res.status(204).send();
  }),
);
