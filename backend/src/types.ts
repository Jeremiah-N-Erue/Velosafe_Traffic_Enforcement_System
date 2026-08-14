export type Role = "admin" | "operator";

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  display_name: string;
  created_at: string;
}

export type ZoneType = "school" | "residential" | "highway" | "commercial" | "construction";

export interface Zone {
  id: number;
  name: string;
  road_name: string;
  speed_limit_kph: number;
  zone_type: ZoneType;
  latitude: number | null;
  longitude: number | null;
  active: number;
  created_at: string;
}

export interface Vehicle {
  id: number;
  plate_number: string;
  make: string;
  model: string;
  color: string | null;
  owner_name: string;
  owner_contact: string | null;
  registered_at: string;
}

export type ViolationSeverity = "minor" | "moderate" | "severe" | "extreme";
export type ViolationStatus = "pending" | "issued" | "paid" | "disputed" | "dismissed";

export interface Violation {
  id: number;
  vehicle_id: number;
  zone_id: number;
  recorded_speed_kph: number;
  speed_limit_kph: number;
  over_limit_kph: number;
  severity: ViolationSeverity;
  fine_amount: number;
  status: ViolationStatus;
  recorded_at: string;
  notes: string | null;
}

export type IncidentType = "collision" | "hazard" | "road_closure" | "breakdown" | "other";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "in_progress" | "resolved";

export interface Incident {
  id: number;
  zone_id: number | null;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  status: IncidentStatus;
  reported_at: string;
  resolved_at: string | null;
}

export interface AuthTokenPayload {
  sub: number;
  username: string;
  role: Role;
}
