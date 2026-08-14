import bcrypt from "bcryptjs";
import { db } from "./index";
import { calculateViolation } from "../lib/violationCalc";

function clearAll(): void {
  db.exec(`
    DELETE FROM violations;
    DELETE FROM incidents;
    DELETE FROM vehicles;
    DELETE FROM zones;
    DELETE FROM users;
  `);
}

function seedUsers(): void {
  const users = [
    { username: "admin", password: "admin123", role: "admin", display_name: "Alex Rivera" },
    { username: "operator", password: "operator123", role: "operator", display_name: "Sam Chen" },
  ];
  const insert = db.prepare(
    "INSERT INTO users (username, password_hash, role, display_name) VALUES (@username, @password_hash, @role, @display_name)",
  );
  for (const u of users) {
    insert.run({
      username: u.username,
      password_hash: bcrypt.hashSync(u.password, 10),
      role: u.role,
      display_name: u.display_name,
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

function seedViolations(vehicleIds: number[], zoneRows: { id: number; speed_limit_kph: number }[]): void {
  const insert = db.prepare(
    `INSERT INTO violations
     (vehicle_id, zone_id, recorded_speed_kph, speed_limit_kph, over_limit_kph, severity, fine_amount, status, recorded_at, notes)
     VALUES (@vehicle_id, @zone_id, @recorded_speed_kph, @speed_limit_kph, @over_limit_kph, @severity, @fine_amount, @status, @recorded_at, @notes)`,
  );

  const statuses = ["pending", "issued", "paid", "disputed", "dismissed"];
  const now = Date.now();

  for (let i = 0; i < 140; i++) {
    const zone = pick(zoneRows);
    const vehicleId = pick(vehicleIds);
    // Bias toward smaller overages, with an occasional extreme outlier
    const roll = Math.random();
    let overKph: number;
    if (roll < 0.55) overKph = Math.random() * 10; // minor
    else if (roll < 0.8) overKph = 10 + Math.random() * 10; // moderate
    else if (roll < 0.94) overKph = 20 + Math.random() * 20; // severe
    else overKph = 40 + Math.random() * 30; // extreme

    const recordedSpeed = zone.speed_limit_kph + overKph;
    const calc = calculateViolation(recordedSpeed, zone.speed_limit_kph);

    const daysAgo = Math.random() * 45;
    const recordedAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();

    insert.run({
      vehicle_id: vehicleId,
      zone_id: zone.id,
      recorded_speed_kph: round(recordedSpeed),
      speed_limit_kph: zone.speed_limit_kph,
      over_limit_kph: calc.overLimitKph,
      severity: calc.severity,
      fine_amount: calc.fineAmount,
      status: pick(statuses),
      recorded_at: recordedAt,
      notes: null,
    });
  }
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

function main(): void {
  console.log("Seeding VeloSafe database...");
  clearAll();
  seedUsers();
  const zoneIds = seedZones();
  const zoneRows = db.prepare("SELECT id, speed_limit_kph FROM zones").all() as {
    id: number;
    speed_limit_kph: number;
  }[];
  const vehicleIds = seedVehicles();
  seedViolations(vehicleIds, zoneRows);
  seedIncidents(zoneIds);
  console.log("Seed complete.");
  console.log("  Admin login:    admin / admin123");
  console.log("  Operator login: operator / operator123");
}

main();
