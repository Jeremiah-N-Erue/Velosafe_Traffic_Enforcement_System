import { Router } from "express";
import { db } from "../db";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { vehicleSchema, vehicleUpdateSchema } from "../validators/schemas";
import { Vehicle } from "../types";

export const vehiclesRouter = Router();

vehiclesRouter.use(requireAuth);

vehiclesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? `%${req.query.search}%` : null;
    const vehicles = search
      ? db
          .prepare(
            `SELECT * FROM vehicles WHERE plate_number LIKE ? OR owner_name LIKE ? OR make LIKE ? OR model LIKE ?
             ORDER BY registered_at DESC`,
          )
          .all(search, search, search, search)
      : db.prepare("SELECT * FROM vehicles ORDER BY registered_at DESC").all();
    res.json(vehicles);
  }),
);

vehiclesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id);
    if (!vehicle) throw new HttpError(404, "Vehicle not found");
    const violations = db
      .prepare("SELECT * FROM violations WHERE vehicle_id = ? ORDER BY recorded_at DESC")
      .all(req.params.id);
    res.json({ ...(vehicle as object), violations });
  }),
);

vehiclesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = vehicleSchema.parse(req.body);
    const existing = db.prepare("SELECT id FROM vehicles WHERE plate_number = ?").get(data.plate_number);
    if (existing) throw new HttpError(409, "A vehicle with this plate number is already registered");

    const result = db
      .prepare(
        `INSERT INTO vehicles (plate_number, make, model, color, owner_name, owner_contact)
         VALUES (@plate_number, @make, @model, @color, @owner_name, @owner_contact)`,
      )
      .run({
        plate_number: data.plate_number.toUpperCase(),
        make: data.make,
        model: data.model,
        color: data.color ?? null,
        owner_name: data.owner_name,
        owner_contact: data.owner_contact ?? null,
      });
    const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(vehicle);
  }),
);

vehiclesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id) as Vehicle | undefined;
    if (!existing) throw new HttpError(404, "Vehicle not found");

    const data = vehicleUpdateSchema.parse(req.body);
    const merged = { ...existing, ...data };
    db.prepare(
      `UPDATE vehicles SET plate_number=@plate_number, make=@make, model=@model, color=@color,
       owner_name=@owner_name, owner_contact=@owner_contact WHERE id=@id`,
    ).run({
      id: existing.id,
      plate_number: merged.plate_number.toUpperCase(),
      make: merged.make,
      model: merged.model,
      color: merged.color ?? null,
      owner_name: merged.owner_name,
      owner_contact: merged.owner_contact ?? null,
    });
    const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(existing.id);
    res.json(vehicle);
  }),
);

vehiclesRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const result = db.prepare("DELETE FROM vehicles WHERE id = ?").run(req.params.id);
    if (result.changes === 0) throw new HttpError(404, "Vehicle not found");
    res.status(204).send();
  }),
);
