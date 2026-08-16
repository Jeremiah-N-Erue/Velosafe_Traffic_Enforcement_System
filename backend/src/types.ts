export type Role = "admin" | "operator";

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  display_name: string;
  can_override_reviews: number;
  created_at: string;
}

export type ZoneType = "school" | "residential" | "highway" | "commercial" | "construction" | "intersection";

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

export type ZoneHistoryAction = "created" | "updated" | "deleted";

export interface ZoneHistoryEntry {
  id: number;
  zone_id: number;
  action: ZoneHistoryAction;
  before_data: string | null;
  after_data: string | null;
  changed_by: number | null;
  changed_at: string;
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
export type ViolationType = "speed" | "red_light";

export interface Violation {
  id: number;
  vehicle_id: number;
  zone_id: number;
  violation_type: ViolationType;
  recorded_speed_kph: number | null;
  speed_limit_kph: number | null;
  over_limit_kph: number | null;
  seconds_after_red: number | null;
  severity: ViolationSeverity;
  fine_amount: number;
  status: ViolationStatus;
  recorded_at: string;
  notes: string | null;
  source_device_id: number | null;
}

export interface ViolationEvidence {
  id: number;
  violation_id: number;
  file_path: string;
  mime_type: string;
  file_hash: string;
  uploaded_by: number | null;
  uploaded_at: string;
}

export interface ViolationStatusHistoryEntry {
  id: number;
  violation_id: number;
  from_status: ViolationStatus | null;
  to_status: ViolationStatus;
  changed_by: number | null;
  is_override: number;
  note: string | null;
  changed_at: string;
}

export interface Device {
  id: number;
  label: string;
  device_type: string;
  api_key_hash: string;
  active: number;
  created_at: string;
  last_used_at: string | null;
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
