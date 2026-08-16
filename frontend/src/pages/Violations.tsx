import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, fileToBase64 } from "../api/client";

interface Violation {
  id: number;
  violation_type: "speed" | "red_light";
  plate_number: string;
  zone_name: string;
  recorded_speed_kph: number | null;
  speed_limit_kph: number | null;
  over_limit_kph: number | null;
  seconds_after_red: number | null;
  severity: string;
  fine_amount: number;
  status: string;
  recorded_at: string;
  evidence_count: number;
}

interface Zone {
  id: number;
  name: string;
  speed_limit_kph: number;
  zone_type: string;
}

interface Vehicle {
  id: number;
  plate_number: string;
}

const SEVERITIES = ["minor", "moderate", "severe", "extreme"];
const STATUS_FILTERS = ["pending", "issued", "paid", "disputed", "dismissed"];

function currency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const emptyForm = {
  violation_type: "speed" as "speed" | "red_light",
  vehicle_id: "",
  zone_id: "",
  recorded_speed_kph: "",
  seconds_after_red: "",
};

export default function Violations() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (severityFilter) params.set("severity", severityFilter);
    if (statusFilter) params.set("status", statusFilter);
    api
      .get<Violation[]>(`/violations${params.toString() ? `?${params}` : ""}`)
      .then(setViolations)
      .catch(() => setError("Couldn't load violations."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [severityFilter, statusFilter]);

  useEffect(() => {
    api.get<Zone[]>("/zones").then(setZones).catch(() => {});
    api.get<Vehicle[]>("/vehicles").then(setVehicles).catch(() => {});
  }, []);

  const relevantZones = zones.filter((z) =>
    form.violation_type === "red_light" ? z.zone_type === "intersection" : z.zone_type !== "intersection",
  );

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!evidenceFile) {
        throw new Error("Photo or video evidence is required to log a violation.");
      }
      const dataUrl = await fileToBase64(evidenceFile);

      const payload =
        form.violation_type === "speed"
          ? {
              violation_type: "speed",
              vehicle_id: Number(form.vehicle_id),
              zone_id: Number(form.zone_id),
              recorded_speed_kph: Number(form.recorded_speed_kph),
              evidence: [{ data: dataUrl, mime_type: evidenceFile.type }],
            }
          : {
              violation_type: "red_light",
              vehicle_id: Number(form.vehicle_id),
              zone_id: Number(form.zone_id),
              seconds_after_red: Number(form.seconds_after_red),
              evidence: [{ data: dataUrl, mime_type: evidenceFile.type }],
            };

      await api.post("/violations", payload);
      setForm(emptyForm);
      setEvidenceFile(null);
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Couldn't log violation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function markPaid(id: number) {
    try {
      await api.patch(`/violations/${id}/status`, { status: "paid" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update status.");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Violations</h1>
          <p className="page-subtitle">
            Speed &amp; red-light violations — every new entry requires evidence and starts pending review. See the{" "}
            <Link to="/review">Review Queue</Link> to approve or reject pending violations.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setFormOpen((v) => !v);
            setError(null);
          }}
        >
          {formOpen ? "Cancel" : "+ Log Violation"}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {formOpen && (
        <form className="inline-form" onSubmit={handleCreate}>
          <label>
            Violation type
            <select
              value={form.violation_type}
              onChange={(e) =>
                setForm({ ...emptyForm, violation_type: e.target.value as "speed" | "red_light" })
              }
            >
              <option value="speed">Speed</option>
              <option value="red_light">Red light</option>
            </select>
          </label>
          <label>
            Vehicle
            <select
              required
              value={form.vehicle_id}
              onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
            >
              <option value="">Select vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number}
                </option>
              ))}
            </select>
          </label>
          <label>
            {form.violation_type === "red_light" ? "Intersection" : "Zone"}
            <select required value={form.zone_id} onChange={(e) => setForm({ ...form, zone_id: e.target.value })}>
              <option value="">Select…</option>
              {relevantZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                  {form.violation_type === "speed" ? ` (${z.speed_limit_kph} km/h limit)` : ""}
                </option>
              ))}
            </select>
          </label>
          {form.violation_type === "speed" ? (
            <label>
              Recorded speed (km/h)
              <input
                type="number"
                required
                min={1}
                value={form.recorded_speed_kph}
                onChange={(e) => setForm({ ...form, recorded_speed_kph: e.target.value })}
              />
            </label>
          ) : (
            <label>
              Seconds after light turned red
              <input
                type="number"
                required
                min={0.1}
                step={0.1}
                value={form.seconds_after_red}
                onChange={(e) => setForm({ ...form, seconds_after_red: e.target.value })}
              />
            </label>
          )}
          <label>
            Evidence (photo/video) — required
            <input
              type="file"
              required
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Logging…" : "Log violation"}
          </button>
        </form>
      )}

      <div className="filter-row">
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="page-loading">Loading violations…</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Plate</th>
              <th>Zone</th>
              <th>Reading</th>
              <th>Severity</th>
              <th>Fine</th>
              <th>Evidence</th>
              <th>Status</th>
              <th>Recorded</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {violations.map((v) => (
              <tr key={v.id}>
                <td>
                  <span className="badge badge-neutral">{v.violation_type === "red_light" ? "Red light" : "Speed"}</span>
                </td>
                <td className="mono">{v.plate_number}</td>
                <td>{v.zone_name}</td>
                <td>
                  {v.violation_type === "speed"
                    ? `${v.recorded_speed_kph} / ${v.speed_limit_kph} km/h`
                    : `${v.seconds_after_red}s after red`}
                </td>
                <td>
                  <span className={`badge badge-${v.severity}`}>{v.severity}</span>
                </td>
                <td>{currency(v.fine_amount)}</td>
                <td>{v.evidence_count > 0 ? `${v.evidence_count} file(s)` : "— none (legacy)"}</td>
                <td>
                  <span className={`badge badge-neutral`}>{v.status}</span>
                  {v.status === "pending" && (
                    <>
                      {" "}
                      <Link to="/review">review</Link>
                    </>
                  )}
                </td>
                <td>{new Date(v.recorded_at).toLocaleDateString()}</td>
                <td>
                  {v.status === "issued" && (
                    <button className="btn btn-ghost small" onClick={() => markPaid(v.id)}>
                      Mark paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
