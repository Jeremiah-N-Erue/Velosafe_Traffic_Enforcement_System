import { Router } from "express";
import { db } from "../db";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { zoneSchema, zoneUpdateSchema } from "../validators/schemas";
import { Zone } from "../types";

export const zonesRouter = Router();

zonesRouter.use(requireAuth);

// Zone configuration (speed limits, road metadata) is administrative — only
// admins can create, edit, or remove zones. Operators can still view them.

zonesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const zones = db.prepare("SELECT * FROM zones ORDER BY name ASC").all();
    res.json(zones);
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
    const zone = db.prepare("SELECT * FROM zones WHERE id = ?").get(result.lastInsertRowid);
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
    const zone = db.prepare("SELECT * FROM zones WHERE id = ?").get(existing.id);
    res.json(zone);
  }),
);

zonesRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const result = db.prepare("DELETE FROM zones WHERE id = ?").run(req.params.id);
    if (result.changes === 0) throw new HttpError(404, "Zone not found");
    res.status(204).send();
  }),
);
