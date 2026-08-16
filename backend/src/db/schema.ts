// The schema is embedded as a string (rather than read from a .sql file at
// runtime) so it survives the TypeScript build unmodified — tsc only emits
// .ts -> .js and does not copy non-.ts assets into dist/, which caused the
// compiled server to crash on startup looking for a schema.sql that was
// never copied alongside it.
export const SCHEMA_SQL = `
-- VeloSafe Traffic Enforcement System — schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator')) DEFAULT 'operator',
  display_name TEXT NOT NULL,
  -- Override rights are granted per-account, independent of role. Admins do NOT get this
  -- automatically — it represents a permission VeloSafe grants to a specific admin account.
  can_override_reviews INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  road_name TEXT NOT NULL,
  speed_limit_kph INTEGER NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN ('school', 'residential', 'highway', 'commercial', 'construction', 'intersection')) DEFAULT 'residential',
  latitude REAL,
  longitude REAL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Devices (radar/lidar units, speed cameras, red-light cameras) that submit violations
-- automatically through the ingestion API. Vendor-agnostic by design: any device that can call
-- the ingestion endpoint with the standard payload works, regardless of manufacturer. Devices
-- authenticate with a per-device API key (hashed at rest), not a user login.
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  device_type TEXT NOT NULL CHECK (device_type IN ('radar', 'lidar', 'speed_camera', 'red_light_camera', 'other')) DEFAULT 'other',
  api_key_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate_number TEXT NOT NULL UNIQUE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  color TEXT,
  owner_name TEXT NOT NULL,
  owner_contact TEXT,
  registered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  -- Speed and red-light violations are structurally different records sharing one table.
  violation_type TEXT NOT NULL CHECK (violation_type IN ('speed', 'red_light')) DEFAULT 'speed',
  -- Speed-only fields (null for red_light violations):
  recorded_speed_kph REAL,
  speed_limit_kph INTEGER,
  over_limit_kph REAL,
  -- Red-light-only field (null for speed violations):
  seconds_after_red REAL,
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'severe', 'extreme')),
  fine_amount REAL NOT NULL,
  -- A violation NEVER auto-issues a fine. Every violation starts 'pending' and requires a human
  -- review decision (by an operator, via the review queue) before it becomes 'issued'. This is
  -- true whether the violation was logged manually or submitted by a device.
  status TEXT NOT NULL CHECK (status IN ('pending', 'issued', 'paid', 'disputed', 'dismissed')) DEFAULT 'pending',
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  -- Null when logged manually by a user; set when submitted automatically by a device.
  source_device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL
);

-- Photo/video evidence attached to a violation. Required (enforced at the API layer, not here,
-- so existing demo/seed records without evidence remain valid) on every NEW violation, manual or
-- device-sourced — evidence is what makes a violation defensible, not how it was entered.
CREATE TABLE IF NOT EXISTS violation_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  violation_id INTEGER NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  -- SHA-256 of the file at upload time — simple tamper-evidence: if the stored file is later
  -- altered, this hash will no longer match it.
  file_hash TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only audit trail of every status change on a violation (the review decision, and any
-- later override). Never overwritten — a full history of who changed what, and when.
CREATE TABLE IF NOT EXISTS violation_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  violation_id INTEGER NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_override INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('collision', 'hazard', 'road_closure', 'breakdown', 'other')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved')) DEFAULT 'open',
  reported_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_violations_vehicle ON violations(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_violations_zone ON violations(zone_id);
CREATE INDEX IF NOT EXISTS idx_violations_recorded_at ON violations(recorded_at);
CREATE INDEX IF NOT EXISTS idx_incidents_zone ON incidents(zone_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_evidence_violation ON violation_evidence(violation_id);
CREATE INDEX IF NOT EXISTS idx_status_history_violation ON violation_status_history(violation_id);
`;
