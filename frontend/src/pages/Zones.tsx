import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface Zone {
  id: number;
  name: string;
  road_name: string;
  speed_limit_kph: number;
  zone_type: string;
  active: number;
}

const ZONE_TYPES = ["school", "residential", "highway", "commercial", "construction"];

export default function Zones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", road_name: "", speed_limit_kph: 50, zone_type: "residential" });
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    api
      .get<Zone[]>("/zones")
      .then(setZones)
      .catch(() => setError("Couldn't load zones."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/zones", form);
      setForm({ name: "", road_name: "", speed_limit_kph: 50, zone_type: "residential" });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create zone.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/zones/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete zone.");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Speed Zones</h1>
          <p className="page-subtitle">Posted limits and zone metadata</p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? "Cancel" : "+ New Zone"}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {formOpen && (
        <form className="inline-form" onSubmit={handleCreate}>
          <label>
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Road name
            <input
              required
              value={form.road_name}
              onChange={(e) => setForm({ ...form, road_name: e.target.value })}
            />
          </label>
          <label>
            Speed limit (km/h)
            <input
              type="number"
              required
              min={5}
              max={160}
              value={form.speed_limit_kph}
              onChange={(e) => setForm({ ...form, speed_limit_kph: Number(e.target.value) })}
            />
          </label>
          <label>
            Zone type
            <select value={form.zone_type} onChange={(e) => setForm({ ...form, zone_type: e.target.value })}>
              {ZONE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save zone"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="page-loading">Loading zones…</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Road</th>
              <th>Type</th>
              <th>Speed limit</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.id}>
                <td>{z.name}</td>
                <td>{z.road_name}</td>
                <td>
                  <span className="badge badge-neutral">{z.zone_type}</span>
                </td>
                <td>{z.speed_limit_kph} km/h</td>
                <td>{z.active ? "Active" : "Inactive"}</td>
                <td>
                  <button className="btn btn-ghost small" onClick={() => handleDelete(z.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
