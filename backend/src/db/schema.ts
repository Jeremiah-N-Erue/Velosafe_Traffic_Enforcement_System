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
  role TEXT NOT NULL CHECK (role IN (''admin'', ''operator'')) DEFAULT ''operator'',
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime(''now''))
);

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  road_name TEXT NOT NULL,
  speed_limit_kph INTEGER NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN (''school'', ''residential'', ''highway'', ''commercial'', ''construction'')) DEFAULT ''residential'',
  latitude REAL,
  longitude REAL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime(''now''))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate_number TEXT NOT NULL UNIQUE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  color TEXT,
  owner_name TEXT NOT NULL,
  owner_contact TEXT,
  registered_at TEXT NOT NULL DEFAULT (datetime(''now''))
);

CREATE TABLE IF NOT EXISTS violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  recorded_speed_kph REAL NOT NULL,
  speed_limit_kph INTEGER NOT NULL,
  over_limit_kph REAL NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN (''minor'', ''moderate'', ''severe'', ''extreme'')),
  fine_amount REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN (''pending'', ''issued'', ''paid'', ''disputed'', ''dismissed'')) DEFAULT ''pending'',
  recorded_at TEXT NOT NULL DEFAULT (datetime(''now'')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL CHECK (incident_type IN (''collision'', ''hazard'', ''road_closure'', ''breakdown'', ''other'')),
  severity TEXT NOT NULL CHECK (severity IN (''low'', ''medium'', ''high'', ''critical'')) DEFAULT ''medium'',
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (''open'', ''in_progress'', ''resolved'')) DEFAULT ''open'',
  reported_at TEXT NOT NULL DEFAULT (datetime(''now'')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_violations_vehicle ON violations(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_violations_zone ON violations(zone_id);
CREATE INDEX IF NOT EXISTS idx_violations_recorded_at ON violations(recorded_at);
CREATE INDEX IF NOT EXISTS idx_incidents_zone ON incidents(zone_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
`;
