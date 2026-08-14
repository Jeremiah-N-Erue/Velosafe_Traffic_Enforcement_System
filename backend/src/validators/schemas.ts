import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const zoneSchema = z.object({
  name: z.string().min(1).max(120),
  road_name: z.string().min(1).max(120),
  speed_limit_kph: z.number().int().min(5).max(160),
  zone_type: z.enum(["school", "residential", "highway", "commercial", "construction"]),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  active: z.boolean().optional(),
});

export const zoneUpdateSchema = zoneSchema.partial();

export const vehicleSchema = z.object({
  plate_number: z.string().min(2).max(20),
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  color: z.string().max(40).nullable().optional(),
  owner_name: z.string().min(1).max(120),
  owner_contact: z.string().max(120).nullable().optional(),
});

export const vehicleUpdateSchema = vehicleSchema.partial();

export const violationSchema = z.object({
  vehicle_id: z.number().int().positive(),
  zone_id: z.number().int().positive(),
  recorded_speed_kph: z.number().positive().max(400),
  recorded_at: z.string().datetime().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const violationStatusSchema = z.object({
  status: z.enum(["pending", "issued", "paid", "disputed", "dismissed"]),
});

export const incidentSchema = z.object({
  zone_id: z.number().int().positive().nullable().optional(),
  incident_type: z.enum(["collision", "hazard", "road_closure", "breakdown", "other"]),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  description: z.string().min(1).max(1000),
  status: z.enum(["open", "in_progress", "resolved"]).optional(),
});

export const incidentUpdateSchema = incidentSchema.partial();

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(1000),
});
