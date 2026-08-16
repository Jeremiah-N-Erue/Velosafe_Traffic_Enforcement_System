import { Router } from "express";
import { db } from "../db";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireDeviceAuth } from "../middleware/auth";
import { deviceViolationSchema } from "../validators/schemas";
import { calculateViolation, calculateRedLightViolation } from "../lib/violationCalc";
import { saveEvidenceFile } from "../lib/evidenceStore";
import { Zone } from "../types";

// Vendor-agnostic device ingestion API. Any radar/lidar/camera hardware — regardless of
// manufacturer — can submit a violation here as long as it can authenticate with a device API
// key (see requireDeviceAuth) and send this standard payload shape. This is the "works with any
// camera or sensor" contract: VeloSafe defines the interface once, and it's each device's job
// (or its integrator's) to speak it, rather than VeloSafe integrating per-vendor.
//
// Every submission lands as a 'pending' violation and enters the exact same operator review
// queue as a manually-logged one — device submissions never bypass human review.
export const ingestRouter = Router();

ingestRouter.use(requireDeviceAuth);

ingestRouter.post(
  "/violations",
  asyncHandler(async (req, res) => {
    const data = deviceViolationSchema.parse(req.body);

    const zone = db.prepare("SELECT * FROM zones WHERE id = ?").get(data.zone_id) as Zone | undefined;
    if (!zone) throw new HttpError(404, "Zone not found");

    // Auto-register the vehicle if this plate hasn't been seen before — a device can't know
    // owner details, so those are filled in as unknown pending manual follow-up.
    const plate = data.plate_number.toUpperCase();
    let vehicle = db.prepare("SELECT id FROM vehicles WHERE plate_number = ?").get(plate) as
      | { id: number }
      | undefined;
    if (!vehicle) {
      const result = db
        .prepare(
          `INSERT INTO vehicles (plate_number, make, model, color, owner_name, owner_contact)
           VALUES (?, 'Unknown', 'Unknown', NULL, 'Unregistered (auto-created by device)', NULL)`,
        )
        .run(plate);
      vehicle = { id: Number(result.lastInsertRowid) };
    }

    const isSpeed = data.violation_type === "speed";
    const calc = isSpeed
      ? calculateViolation(data.recorded_speed_kph, zone.speed_limit_kph)
      : calculateRedLightViolation(data.seconds_after_red);

    const insertTx = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO violations
           (vehicle_id, zone_id, violation_type, recorded_speed_kph, speed_limit_kph, over_limit_kph,
            seconds_after_red, severity, fine_amount, status, recorded_at, notes, source_device_id)
           VALUES (@vehicle_id, @zone_id, @violation_type, @recorded_speed_kph, @speed_limit_kph, @over_limit_kph,
            @seconds_after_red, @severity, @fine_amount, 'pending', @recorded_at, @notes, @source_device_id)`,
        )
        .run({
          vehicle_id: vehicle!.id,
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
          source_device_id: req.device!.id,
        });
      const violationId = Number(result.lastInsertRowid);

      const insertEvidence = db.prepare(
        `INSERT INTO violation_evidence (violation_id, file_path, mime_type, file_hash, uploaded_by)
         VALUES (@violation_id, @file_path, @mime_type, @file_hash, NULL)`,
      );
      for (const item of data.evidence) {
        const saved = saveEvidenceFile(item);
        insertEvidence.run({
          violation_id: violationId,
          file_path: saved.filePath,
          mime_type: saved.mimeType,
          file_hash: saved.fileHash,
        });
      }

      db.prepare(
        `INSERT INTO violation_status_history (violation_id, from_status, to_status, changed_by, is_override, note)
         VALUES (?, NULL, 'pending', NULL, 0, ?)`,
      ).run(violationId, `Submitted by device: ${req.device!.label}`);

      return violationId;
    });

    const violationId = insertTx();
    res.status(201).json({ violation_id: violationId, status: "pending", vehicle_id: vehicle!.id });
  }),
);
