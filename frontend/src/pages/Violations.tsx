import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface Violation {
  id: number;
  plate_number: string;
  zone_name: string;
  recorded_speed_kph: number;
  speed_limit_kph: number;
  over_limit_kph: number;
  severity: string;
  fine_amount: number;
  status: string;
  recorded_at: string;
}

interface Zone {
  id: number;
  name: string;
  speed_limit_kph: number;
}

interface Vehicle {
  id: number;
  plate_number: string;
}

const STATUSES = ["pending", "issued", "paid", "disputed", "dismissed"];
const SEVERITIES = ["minor", "moderate", "severe", "extreme"];

function currency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Violations() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ vehicle_id: "", zone_id: "", recorded_speed_kph: "" });
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

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/violations", {
        vehicle_id: Number(form.vehicle_id),
        zone_id: Number(form.zone_id),
        recorded_speed_kph: Number(form.recorded_speed_kph),
      });
      setForm({ vehicle_id: "", zone_id: "", recorded_speed_kph: "" });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't log violation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: number, status: string) {
    try {
      await api.patch(`/violations/${id}/status`, { status });
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
          <p className="page-subtitle">Speed violations with automatic severity &amp; fine calculation</p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? "Cancel" : "+ Log Violation"}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {formOpen && (
        <form className="inline-form" onSubmit={handleCreate}>
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
            Zone
            <select required value={form.zone_id} onChange={(e) => setForm({ ...form, zone_id: e.target.value })}>
              <option value="">Select zone…</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({z.speed_limit_kph} km/h limit)
                </option>
              ))}
            </select>
          </label>
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
          {STATUSES.map((s) => (
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
              <th>Plate</th>
              <th>Zone</th>
              <th>Speed</th>
              <th>Over by</th>
              <th>Severity</th>
              <th>Fine</th>
              <th>Status</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((v) => (
              <tr key={v.id}>
                <td className="mono">{v.plate_number}</td>
                <td>{v.zone_name}</td>
                <td>
                  {v.recorded_speed_kph} / {v.speed_limit_kph} km/h
                </td>
                <td>+{v.over_limit_kph} km/h</td>
                <td>
                  <span className={`badge badge-${v.severity}`}>{v.severity}</span>
                </td>
                <td>{currency(v.fine_amount)}</td>
                <td>
                  <select value={v.status} onChange={(e) => updateStatus(v.id, e.target.value)}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{new Date(v.recorded_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
