import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface AuditEntry {
  id: number;
  violation_id: number;
  from_status: string | null;
  to_status: string;
  changed_by: number | null;
  changed_by_name: string | null;
  changed_by_username: string | null;
  is_override: number;
  note: string | null;
  changed_at: string;
  plate_number: string;
  violation_type: "speed" | "red_light";
  severity: string;
  fine_amount: number;
}

const OVERRIDE_STATUSES = ["pending", "issued", "dismissed", "paid", "disputed"];

function currency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminOversight() {
  const { user } = useAuth();
  const canOverride = !!user?.can_override_reviews;

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overrideId, setOverrideId] = useState("");
  const [overrideStatus, setOverrideStatus] = useState("dismissed");
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api
      .get<AuditEntry[]>("/violations/audit/log")
      .then(setEntries)
      .catch(() => setError("Couldn't load the audit log."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function submitOverride(e: FormEvent) {
    e.preventDefault();
    setOverrideSubmitting(true);
    setOverrideError(null);
    setOverrideMessage(null);
    try {
      if (!overrideId) throw new Error("Enter a violation ID to override.");
      await api.patch(`/violations/${overrideId}/status`, {
        status: overrideStatus,
        note: overrideNote || undefined,
      });
      setOverrideMessage(`Violation #${overrideId} set to "${overrideStatus}".`);
      setOverrideId("");
      setOverrideNote("");
      load();
    } catch (err) {
      setOverrideError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Couldn't apply override.",
      );
    } finally {
      setOverrideSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Admin Oversight</h1>
          <p className="page-subtitle">
            Read-only record of every review decision — who reviewed each violation, what they decided, and when.
            This view never issues fines itself.
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>Manual override</h2>
        {canOverride ? (
          <>
            <p className="page-subtitle" style={{ marginBottom: 16 }}>
              Reverses or skips a prior review decision. Every override is written to the audit log below, flagged
              as an override, with your name and note attached.
            </p>
            <form className="inline-form" onSubmit={submitOverride}>
              <label>
                Violation ID
                <input
                  type="number"
                  min={1}
                  required
                  value={overrideId}
                  onChange={(e) => setOverrideId(e.target.value)}
                />
              </label>
              <label>
                New status
                <select value={overrideStatus} onChange={(e) => setOverrideStatus(e.target.value)}>
                  {OVERRIDE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                Reason (recorded on the audit trail)
                <input value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} />
              </label>
              <button className="btn btn-primary" type="submit" disabled={overrideSubmitting}>
                {overrideSubmitting ? "Applying…" : "Apply override"}
              </button>
            </form>
            {overrideMessage && <div className="page-subtitle">{overrideMessage}</div>}
            {overrideError && <div className="form-error">{overrideError}</div>}
          </>
        ) : (
          <p className="page-subtitle">
            Your account doesn't have override permission. Overrides must be granted separately from the admin role
            — contact a VeloSafe administrator if you need this access.
          </p>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Loading audit log…</div>
      ) : entries.length === 0 ? (
        <div className="page-loading">No review decisions recorded yet.</div>
      ) : (
        <table className="data-table compact">
          <thead>
            <tr>
              <th>When</th>
              <th>Violation</th>
              <th>Plate</th>
              <th>Type</th>
              <th>Fine</th>
              <th>Transition</th>
              <th>By</th>
              <th>Override</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.changed_at).toLocaleString()}</td>
                <td className="mono">#{e.violation_id}</td>
                <td className="mono">{e.plate_number}</td>
                <td>
                  <span className="badge badge-neutral">{e.violation_type === "red_light" ? "Red light" : "Speed"}</span>
                </td>
                <td>{currency(e.fine_amount)}</td>
                <td>
                  {e.from_status ?? "—"} → <strong>{e.to_status}</strong>
                </td>
                <td>{e.changed_by_name ?? "Device / system"}</td>
                <td>{e.is_override ? <span className="badge badge-extreme">override</span> : "—"}</td>
                <td>{e.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
