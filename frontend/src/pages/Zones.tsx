import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface Zone {
  id: number;
  name: string;
  road_name: string;
  speed_limit_kph: number;
  zone_type: string;
  active: number;
}

const ZONE_TYPES = ["school", "residential", "highway", "commercial", "construction", "intersection"];

const emptyForm = { name: "", road_name: "", speed_limit_kph: 50, zone_type: "residential", active: true };

export default function Zones() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
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

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setFormOpen(true);
  }

  function openEditForm(zone: Zone) {
    setEditingId(zone.id);
    setForm({
      name: zone.name,
      road_name: zone.road_name,
      speed_limit_kph: zone.speed_limit_kph,
      zone_type: zone.zone_type,
      active: !!zone.active,
    });
    setError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        await api.patch(`/zones/${editingId}`, form);
      } else {
        await api.post("/zones", form);
      }
      closeForm();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : editingId ? "Couldn't update zone." : "Couldn't create zone.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setError(null);
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
          <p className="page-subtitle">
            Posted limits and zone metadata. Every create, edit, and delete is recorded — see the{" "}
            {isAdmin ? <Link to="/oversight">Zone Change Log</Link> : "Zone Change Log (admin oversight)"}.
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => (formOpen ? closeForm() : openCreateForm())}>
            {formOpen ? "Cancel" : "+ New Zone"}
          </button>
        )}
      </div>

      {!isAdmin && (
        <p className="page-subtitle">Zone configuration is managed by admins. You have view-only access here.</p>
      )}

      {error && <div className="form-error">{error}</div>}

      {formOpen && isAdmin && (
        <form className="inline-form" onSubmit={handleSubmit}>
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
          {editingId && (
            <label>
              Status
              <select
                value={form.active ? "active" : "inactive"}
                onChange={(e) => setForm({ ...form, active: e.target.value === "active" })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          )}
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Saving…" : editingId ? "Save changes" : "Save zone"}
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
              {isAdmin && <th />}
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
                {isAdmin && (
                  <td className="table-actions">
                    <button className="btn btn-ghost small" onClick={() => openEditForm(z)}>
                      Edit
                    </button>
                    <button className="btn btn-ghost small" onClick={() => handleDelete(z.id)}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
