import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface Vehicle {
  id: number;
  plate_number: string;
  make: string;
  model: string;
  color: string | null;
  owner_name: string;
  owner_contact: string | null;
}

const emptyForm = { plate_number: "", make: "", model: "", color: "", owner_name: "", owner_contact: "" };

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  function load(query = "") {
    setLoading(true);
    api
      .get<Vehicle[]>(`/vehicles${query ? `?search=${encodeURIComponent(query)}` : ""}`)
      .then(setVehicles)
      .catch(() => setError("Couldn't load vehicles."))
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/vehicles", form);
      setForm(emptyForm);
      setFormOpen(false);
      load(search);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't register vehicle.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Vehicle Registry</h1>
          <p className="page-subtitle">Registered vehicles and owners</p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? "Cancel" : "+ Register Vehicle"}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {formOpen && (
        <form className="inline-form" onSubmit={handleCreate}>
          <label>
            Plate number
            <input
              required
              value={form.plate_number}
              onChange={(e) => setForm({ ...form, plate_number: e.target.value })}
            />
          </label>
          <label>
            Make
            <input required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
          </label>
          <label>
            Model
            <input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </label>
          <label>
            Color
            <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </label>
          <label>
            Owner name
            <input
              required
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
            />
          </label>
          <label>
            Owner contact
            <input
              value={form.owner_contact}
              onChange={(e) => setForm({ ...form, owner_contact: e.target.value })}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Register"}
          </button>
        </form>
      )}

      <input
        className="search-input"
        placeholder="Search by plate, owner, make, or model…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="page-loading">Loading vehicles…</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Plate</th>
              <th>Vehicle</th>
              <th>Color</th>
              <th>Owner</th>
              <th>Contact</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td className="mono">{v.plate_number}</td>
                <td>
                  {v.make} {v.model}
                </td>
                <td>{v.color ?? "—"}</td>
                <td>{v.owner_name}</td>
                <td>{v.owner_contact ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
