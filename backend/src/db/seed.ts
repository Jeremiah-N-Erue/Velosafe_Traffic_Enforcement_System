import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./index";
import { calculateViolation, calculateRedLightViolation } from "../lib/violationCalc";
import { saveEvidenceFile } from "../lib/evidenceStore";

// A tiny 1x1 PNG used as a stand-in "camera snapshot" for seeded demo evidence — there's no real
// camera in this prototype yet, this just proves the evidence-attachment plumbing works end to
// end. Real deployments would have an actual photo/video from the device or officer.
const PLACEHOLDER_PHOTO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function clearAll(): void {
  db.exec(`
    DELETE FROM violation_status_history;
    DELETE FROM violation_evidence;
    DELETE FROM violations;
    DELETE FROM incidents;
    DELETE FROM vehicles;
    DELETE FROM zones;
    DELETE FROM devices;
    DELETE FROM users;
  `);
}

function seedUsers(): void {
  const users = [
    // Override rights are granted per-account, not automatic for every admin — the demo admin
    // account has it here so the override feature is actually demoable.
    { username: "admin", password: "admin123", role: "admin", display_name: "Alex Rivera", can_override_reviews: 1 },
    { username: "operator", password: "operator123", role: "operator", display_name: "Sam Chen", can_override_reviews: 0 },
  ];
  const insert = db.prepare(
    `INSERT INTO users (username, password_hash, role, display_name, can_override_reviews)
     VALUES (@username, @password_hash, @role, @display_name, @can_override_reviews)`,
  );
  for (const u of users) {
    insert.run({
      username: u.username,
      password_hash: bcrypt.hashSync(u.password, 10),
      role: u.role,
      display_name: u.display_name,
      can_override_reviews: u.can_override_reviews,
    });
  }
}

function seedZones(): number[] {
  const zones = [
    { name: "Maple Street School Zone", road_name: "Maple Street", speed_limit_kph: 30, zone_type: "school" },
    { name: "Riverside Residential", road_name: "Riverside Drive", speed_limit_kph: 40, zone_type: "residential" },
    { name: "Highway 7 Corridor", road_name: "Highway 7", speed_limit_kph: 100, zone_type: "highway" },
    { name: "Downtown Commercial Strip", road_name: "Main Street", speed_limit_kph: 50, zone_type: "commercial" },
    { name: "Elm Avenue Construction", road_name: "Elm Avenue", speed_limit_kph: 20, zone_type: "construction" },
    { name: "Oakwood Residential", road_name: "Oakwood Lane", speed_limit_kph: 40, zone_type: "residential" },
    { name: "Lincoln High School Zone", road_name: "Lincoln Boulevard", speed_limit_kph: 30, zone_type: "school" },
    { name: "Interstate Bypass", road_name: "I-84 Bypass", speed_limit_kph: 110, zone_type: "highway" },
    { name: "5th & Main Intersection", road_name: "Main Street", speed_limit_kph: 50, zone_type: "intersection" },
    { name: "Broadway & 12th Intersection", road_name: "Broadway", speed_limit_kph: 50, zone_type: "intersection" },
  ];
  const insert = db.prepare(
    `INSERT INTO zones (name, road_name, speed_limit_kph, zone_type, latitude, longitude, active)
     VALUES (@name, @road_name, @speed_limit_kph, @zone_type, @latitude, @longitude, 1)`,
  );
  const ids: number[] = [];
  for (const z of zones) {
    const lat = 40.7 + (Math.random() - 0.5) * 0.2;
    const lng = -73.9 + (Math.random() - 0.5) * 0.2;
    const result = insert.run({ ...z, latitude: round(lat), longitude: round(lng) });
    ids.push(Number(result.lastInsertRowid));
  }
  return ids;
}

function seedVehicles(): number[] {
  const makes = ["Toyota", "Honda", "Ford", "Chevrolet", "Nissan", "BMW", "Tesla", "Subaru", "Kia", "Mazda"];
  const models = ["Corolla", "Civic", "F-150", "Malibu", "Altima", "3 Series", "Model 3", "Outback", "Sportage", "3"];
  const colors = ["Black", "White", "Silver", "Blue", "Red", "Gray", "Green"];
  const firstNames = ["James", "Maria", "Wei", "Fatima", "Liam", "Sofia", "Noah", "Aisha", "Lucas", "Priya", "Ethan", "Chen"];
  const lastNames = ["Smith", "Garcia", "Nguyen", "Khan", "Johnson", "Rossi", "Brown", "Ali", "Martinez", "Patel", "Davis", "Lee"];

  const insert = db.prepare(
    `INSERT INTO vehicles (plate_number, make, model, color, owner_name, owner_contact)
     VALUES (@plate_number, @make, @model, @color, @owner_name, @owner_contact)`,
  );

  const ids: number[] = [];
  const usedPlates = new Set<string>();
  for (let i = 0; i < 40; i++) {
    let plate = randomPlate();
    while (usedPlates.has(plate)) plate = randomPlate();
    usedPlates.add(plate);

    const idx = Math.floor(Math.random() * makes.length);
    const owner = `${pick(firstNames)} ${pick(lastNames)}`;
    const result = insert.run({
      plate_number: plate,
      make: makes[idx],
      model: models[idx],
      color: pick(colors),
      owner_name: owner,
      owner_contact: `${owner.toLowerCase().replace(" ", ".")}@example.com`,
    });
    ids.push(Number(result.lastInsertRowid));
  }
  return ids;
}

interface ZoneRow {
  id: number;
  speed_limit_kph: number;
  zone_type: string;
}

/**
 * Historical, already-resolved violations (issued/paid/disputed/dismissed). These represent
 * older records and intentionally have no evidence attached or status history beyond the final
 * decision — framed as legacy data predating the evidence requirement, per the v2 roadmap note
 * in schema.ts. New violations (below) always carry evidence.
 */
function seedHistoricalViolations(
  vehicleIds: number[],
  speedZones: ZoneRow[],
  adminId: number,
  operatorId: number,
): void {
  const insert = db.prepare(
    `INSERT INTO violations
     (vehicle_id, zone_id, violation_type, recorded_speed_kph, speed_limit_kph, over_limit_kph,
      severity, fine_amount, status, recorded_at, notes)
     VALUES (@vehicle_id, @zone_id, 'speed', @recorded_speed_kph, @speed_limit_kph, @over_limit_kph,
      @severity, @fine_amount, @status, @recorded_at, NULL)`,
  );
  const insertHistory = db.prepare(
    `INSERT INTO violation_status_history (violation_id, from_status, to_status, changed_by, is_override, note, changed_at)
     VALUES (@violation_id, @from_status, @to_status, @changed_by, 0, @note, @changed_at)`,
  );

  const resolvedStatuses = ["issued", "paid", "disputed", "dismissed"];
  const now = Date.now();

  for (let i = 0; i < 140; i++) {
    const zone = pick(speedZones);
    const vehicleId = pick(vehicleIds);
    const roll = Math.random();
    let overKph: number;
    if (roll < 0.55) overKph = Math.random() * 10;
    else if (roll < 0.8) overKph = 10 + Math.random() * 10;
    else if (roll < 0.94) overKph = 20 + Math.random() * 20;
    else overKph = 40 + Math.random() * 30;

    const recordedSpeed = zone.speed_limit_kph + overKph;
    const calc = calculateViolation(recordedSpeed, zone.speed_limit_kph);

    const daysAgo = 2 + Math.random() * 45;
    const recordedAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    const status = pick(resolvedStatuses);
    const reviewer = pick([adminId, operatorId]);
    const reviewedAt = new Date(recordedAt.getTime() + Math.random() * 2 * 60 * 60 * 1000);

    const result = insert.run({
      vehicle_id: vehicleId,
      zone_id: zone.id,
      recorded_speed_kph: round(recordedSpeed),
      speed_limit_kph: zone.speed_limit_kph,
      over_limit_kph: calc.overLimitKph,
      severity: calc.severity,
      fine_amount: calc.fineAmount,
      status,
      recorded_at: recordedAt.toISOString(),
    });
    const violationId = Number(result.lastInsertRowid);

    insertHistory.run({
      violation_id: violationId,
      from_status: null,
      to_status: "pending",
      changed_by: null,
      note: "Logged (historical demo record)",
      changed_at: recordedAt.toISOString(),
    });
    const finalDecision = status === "issued" ? "issued" : status === "dismissed" ? "dismissed" : "issued";
    insertHistory.run({
      violation_id: violationId,
      from_status: "pending",
      to_status: finalDecision,
      changed_by: reviewer,
      note: "Reviewed (historical demo record)",
      changed_at: reviewedAt.toISOString(),
    });
    if (status === "paid" || status === "disputed") {
      const laterAt = new Date(reviewedAt.getTime() + Math.random() * 5 * 24 * 60 * 60 * 1000);
      insertHistory.run({
        violation_id: violationId,
        from_status: "issued",
        to_status: status,
        changed_by: reviewer,
        note: null,
        changed_at: laterAt.toISOString(),
      });
    }
  }
}

/**
 * A handful of freshly-logged, still-pending violations WITH real evidence attached — this is
 * what actually populates the operator review queue in the demo, for both violation types.
 */
function seedPendingViolationsWithEvidence(
  vehicleIds: number[],
  speedZones: ZoneRow[],
  intersectionZones: ZoneRow[],
  loggedByUserId: number,
): void {
  const now = Date.now();

  for (let i = 0; i < 12; i++) {
    const zone = pick(speedZones);
    const vehicleId = pick(vehicleIds);
    const overKph = Math.random() * 35;
    const recordedSpeed = zone.speed_limit_kph + overKph;
    const calc = calculateViolation(recordedSpeed, zone.speed_limit_kph);
    const hoursAgo = Math.random() * 36;
    const recordedAt = new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
    insertPendingWithEvidence({
      vehicle_id: vehicleId,
      zone_id: zone.id,
      violation_type: "speed",
      recorded_speed_kph: round(recordedSpeed),
      speed_limit_kph: zone.speed_limit_kph,
      over_limit_kph: calc.overLimitKph,
      seconds_after_red: null,
      severity: calc.severity,
      fine_amount: calc.fineAmount,
      recorded_at: recordedAt,
      loggedByUserId,
    });
  }

  for (let i = 0; i < 6; i++) {
    const zone = pick(intersectionZones);
    const vehicleId = pick(vehicleIds);
    const secondsAfterRed = round1(0.3 + Math.random() * 5);
    const calc = calculateRedLightViolation(secondsAfterRed);
    const hoursAgo = Math.random() * 36;
    const recordedAt = new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
    insertPendingWithEvidence({
      vehicle_id: vehicleId,
      zone_id: zone.id,
      violation_type: "red_light",
      recorded_speed_kph: null,
      speed_limit_kph: null,
      over_limit_kph: null,
      seconds_after_red: secondsAfterRed,
      severity: calc.severity,
      fine_amount: calc.fineAmount,
      recorded_at: recordedAt,
      loggedByUserId,
    });
  }
}

interface PendingSeedInput {
  vehicle_id: number;
  zone_id: number;
  violation_type: "speed" | "red_light";
  recorded_speed_kph: number | null;
  speed_limit_kph: number | null;
  over_limit_kph: number | null;
  seconds_after_red: number | null;
  severity: string;
  fine_amount: number;
  recorded_at: string;
  loggedByUserId: number;
}

function insertPendingWithEvidence(input: PendingSeedInput): void {
  const result = db
    .prepare(
      `INSERT INTO violations
       (vehicle_id, zone_id, violation_type, recorded_speed_kph, speed_limit_kph, over_limit_kph,
        seconds_after_red, severity, fine_amount, status, recorded_at, notes)
       VALUES (@vehicle_id, @zone_id, @violation_type, @recorded_speed_kph, @speed_limit_kph, @over_limit_kph,
        @seconds_after_red, @severity, @fine_amount, 'pending', @recorded_at, NULL)`,
    )
    .run(input);
  const violationId = Number(result.lastInsertRowid);

  const saved = saveEvidenceFile({ data: PLACEHOLDER_PHOTO_BASE64, mime_type: "image/png" });
  db.prepare(
    `INSERT INTO violation_evidence (violation_id, file_path, mime_type, file_hash, uploaded_by, uploaded_at)
     VALUES (@violation_id, @file_path, @mime_type, @file_hash, @uploaded_by, @uploaded_at)`,
  ).run({
    violation_id: violationId,
    file_path: saved.filePath,
    mime_type: saved.mimeType,
    file_hash: saved.fileHash,
    uploaded_by: input.loggedByUserId,
    uploaded_at: input.recorded_at,
  });

  db.prepare(
    `INSERT INTO violation_status_history (violation_id, from_status, to_status, changed_by, is_override, note, changed_at)
     VALUES (?, NULL, 'pending', ?, 0, 'Logged, awaiting review', ?)`,
  ).run(violationId, input.loggedByUserId, input.recorded_at);
}

function seedIncidents(zoneIds: number[]): void {
  const types = ["collision", "hazard", "road_closure", "breakdown", "other"];
  const severities = ["low", "medium", "high", "critical"];
  const descriptions: Record<string, string[]> = {
    collision: ["Two-vehicle collision at intersection", "Rear-end collision, minor injuries reported", "Multi-vehicle pileup during rain"],
    hazard: ["Debris in roadway", "Pothole reported by multiple drivers", "Downed tree branch blocking a lane"],
    road_closure: ["Lane closed for utility repair", "Full closure for resurfacing work", "Closure due to flooding"],
    breakdown: ["Vehicle breakdown blocking right lane", "Stalled truck near exit ramp"],
    other: ["Traffic signal malfunction", "Unusual pedestrian activity reported"],
  };

  const insert = db.prepare(
    `INSERT INTO incidents (zone_id, incident_type, severity, description, status, reported_at, resolved_at)
     VALUES (@zone_id, @incident_type, @severity, @description, @status, @reported_at, @resolved_at)`,
  );

  const now = Date.now();
  for (let i = 0; i < 22; i++) {
    const type = pick(types);
    const status = pick(["open", "in_progress", "resolved", "resolved"]);
    const daysAgo = Math.random() * 30;
    const reportedAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    const resolvedAt = status === "resolved" ? new Date(reportedAt.getTime() + Math.random() * 6 * 60 * 60 * 1000) : null;

    insert.run({
      zone_id: pick(zoneIds),
      incident_type: type,
      severity: pick(severities),
      description: pick(descriptions[type]),
      status,
      reported_at: reportedAt.toISOString(),
      resolved_at: resolvedAt ? resolvedAt.toISOString() : null,
    });
  }
}

function seedDevice(): string {
  const plaintextKey = `vs_demo_${crypto.randomBytes(16).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(plaintextKey).digest("hex");
  db.prepare(
    `INSERT INTO devices (label, device_type, api_key_hash, active)
     VALUES ('Demo Radar Unit — Downtown Commercial Strip', 'radar', ?, 1)`,
  ).run(keyHash);
  return plaintextKey;
}

function randomPlate(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const l = () => letters[Math.floor(Math.random() * letters.length)];
  const d = () => Math.floor(Math.random() * 10);
  return `${l()}${l()}${l()}-${d()}${d()}${d()}${d()}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function main(): void {
  console.log("Seeding VeloSafe database...");
  clearAll();
  seedUsers();
  const users = db.prepare("SELECT id, username FROM users").all() as { id: number; username: string }[];
  const adminId = users.find((u) => u.username === "admin")!.id;
  const operatorId = users.find((u) => u.username === "operator")!.id;

  seedZones();
  const zoneRows = db.prepare("SELECT id, speed_limit_kph, zone_type FROM zones").all() as ZoneRow[];
  const speedZones = zoneRows.filter((z) => z.zone_type !== "intersection");
  const intersectionZones = zoneRows.filter((z) => z.zone_type === "intersection");

  const vehicleIds = seedVehicles();
  seedHistoricalViolations(vehicleIds, speedZones, adminId, operatorId);
  seedPendingViolationsWithEvidence(vehicleIds, speedZones, intersectionZones, operatorId);
  seedIncidents(zoneRows.map((z) => z.id));
  const deviceKey = seedDevice();

  console.log("Seed complete.");
  console.log("  Admin login:    admin / admin123  (override rights: granted)");
  console.log("  Operator login: operator / operator123");
  console.log(`  Demo device key (X-Device-Key header): ${deviceKey}`);
}

main();
