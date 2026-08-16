import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const zoneSchema = z.object({
  name: z.string().min(1).max(120),
  road_name: z.string().min(1).max(120),
  speed_limit_kph: z.number().int().min(5).max(160),
  zone_type: z.enum(["school", "residential", "highway", "commercial", "construction", "intersection"]),
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

const EVIDENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

// Evidence is required — non-negotiable — on every new violation, manual or device-sourced.
export const evidenceItemSchema = z.object({
  data: z.string().min(1, "Evidence file data is required"),
  mime_type: z.enum(EVIDENCE_MIME_TYPES),
});

const violationCommonFields = {
  vehicle_id: z.number().int().positive(),
  zone_id: z.number().int().positive(),
  recorded_at: z.string().datetime().optional(),
  notes: z.string().max(500).nullable().optional(),
  evidence: z.array(evidenceItemSchema).min(1, "At least one evidence photo or video is required"),
};

export const violationSchema = z.discriminatedUnion("violation_type", [
  z.object({
    violation_type: z.literal("speed"),
    recorded_speed_kph: z.number().positive().max(400),
    ...violationCommonFields,
  }),
  z.object({
    violation_type: z.literal("red_light"),
    seconds_after_red: z.number().positive().max(60),
    ...violationCommonFields,
  }),
]);

export const violationStatusSchema = z.object({
  status: z.enum(["pending", "issued", "paid", "disputed", "dismissed"]),
  note: z.string().max(500).optional(),
});

// Device ingestion payload — same shape as violationSchema but device-supplied plate lookup
// instead of an existing vehicle_id, since a camera/sensor may see a plate never seen before.
const deviceViolationCommonFields = {
  plate_number: z.string().min(2).max(20),
  zone_id: z.number().int().positive(),
  recorded_at: z.string().datetime().optional(),
  notes: z.string().max(500).nullable().optional(),
  evidence: z.array(evidenceItemSchema).min(1, "At least one evidence photo or video is required"),
};

export const deviceViolationSchema = z.discriminatedUnion("violation_type", [
  z.object({
    violation_type: z.literal("speed"),
    recorded_speed_kph: z.number().positive().max(400),
    ...deviceViolationCommonFields,
  }),
  z.object({
    violation_type: z.literal("red_light"),
    seconds_after_red: z.number().positive().max(60),
    ...deviceViolationCommonFields,
  }),
]);

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
