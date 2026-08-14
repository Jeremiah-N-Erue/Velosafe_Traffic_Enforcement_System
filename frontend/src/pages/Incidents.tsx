import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface Incident {
  id: number;
  incident_type: string;
  severity: string;
  description: string;
  status: string;
  zone_name: string | null;
  reported_at: string;
}

interface Zone {
  id: number;
  name: string;
}

const TYPES = ["collision", "hazard", "road_closure", "breakdown", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["open", "in_progress", "resolved"];

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    zone_id: "",
    incident_type: "hazard",
    severity: "medium",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    api
      .get<Incident[]>("/incidents")
      .then(setIncidents)
      .catch(() => setError("Couldn't load incidents."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    api.get<Zone[]>("/zones").then(setZones).catch(() => {});
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/incidents", {
        ...form,
        zone_id: form.zone_id ? Number(form.zone_id) : null,
      });
      setForm({ zone_id: "", incident_type: "hazard", severity: "medium", description: "" });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't log incident.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: number, status: string) {
    try {
      await api.patch(`/incidents/${id}`, { status });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update status.");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Incidents</h1>
          <p className="page-subtitle">Collisions, hazards, closures &amp; more</p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? "Cancel" : "+ Report Incident"}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {formOpen && (
        <form className="inline-form" onSubmit={handleCreate}>
          <label>
            Zone (optional)
            <select value={form.zone_id} onChange={(e) => setForm({ ...form, zone_id: e.target.value })}>
              <option value="">No specific zone</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={form.incident_type}
              onChange={(e) => setForm({ ...form, incident_type: e.target.value })}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Severity
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Description
            <input
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Reporting…" : "Report incident"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="page-loading">Loading incidents…</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Zone</th>
              <th>Severity</th>
              <th>Description</th>
              <th>Status</th>
              <th>Reported</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id}>
                <td>{i.incident_type.replace("_", " ")}</td>
                <td>{i.zone_name ?? "—"}</td>
                <td>
                  <span className={`badge badge-${i.severity}`}>{i.severity}</span>
                </td>
                <td>{i.description}</td>
                <td>
                  <select value={i.status} onChange={(e) => updateStatus(i.id, e.target.value)}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{new Date(i.reported_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
