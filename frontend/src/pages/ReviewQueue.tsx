import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface EvidenceItem {
  id: number;
  mime_type: string;
}

interface ViolationDetail {
  id: number;
  violation_type: "speed" | "red_light";
  plate_number: string;
  make: string;
  model: string;
  owner_name: string;
  zone_name: string;
  road_name: string;
  recorded_speed_kph: number | null;
  speed_limit_kph: number | null;
  seconds_after_red: number | null;
  severity: string;
  fine_amount: number;
  status: string;
  recorded_at: string;
  notes: string | null;
  evidence: EvidenceItem[];
}

interface PendingSummary {
  id: number;
}

function currency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function EvidencePreview({ violationId, item }: { violationId: number; item: EvidenceItem }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    api
      .getObjectUrl(`/violations/${violationId}/evidence/${item.id}/file`)
      .then((u) => {
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => {});
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [violationId, item.id]);

  if (!url) return <div className="evidence-thumb evidence-thumb-loading">Loading…</div>;
  if (item.mime_type.startsWith("video/")) {
    return <video className="evidence-thumb" src={url} controls />;
  }
  return <img className="evidence-thumb" src={url} alt="Violation evidence" />;
}

function ReviewCard({ id, onDecided }: { id: number; onDecided: () => void }) {
  const [violation, setViolation] = useState<ViolationDetail | null>(null);
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState<"issued" | "dismissed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ViolationDetail>(`/violations/${id}`).then(setViolation).catch(() => {});
  }, [id]);

  async function decide(status: "issued" | "dismissed") {
    setDeciding(status);
    setError(null);
    try {
      await api.patch(`/violations/${id}/status`, { status, note: note || undefined });
      onDecided();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't record decision.");
      setDeciding(null);
    }
  }

  if (!violation) return <div className="review-card review-card-loading">Loading…</div>;

  return (
    <div className="review-card">
      <div className="review-card-header">
        <span className="badge badge-neutral">{violation.violation_type === "red_light" ? "Red light" : "Speed"}</span>
        <span className="mono">{violation.plate_number}</span>
        <span className={`badge badge-${violation.severity}`}>{violation.severity}</span>
        <span className="review-card-fine">{currency(violation.fine_amount)}</span>
      </div>

      <div className="review-card-body">
        <div>
          <div>
            {violation.zone_name} ({violation.road_name})
          </div>
          <div>
            {violation.violation_type === "speed"
              ? `${violation.recorded_speed_kph} km/h in a ${violation.speed_limit_kph} km/h zone`
              : `Entered intersection ${violation.seconds_after_red}s after the light turned red`}
          </div>
          <div>
            {violation.make} {violation.model} — {violation.owner_name}
          </div>
          <div>Recorded {new Date(violation.recorded_at).toLocaleString()}</div>
        </div>

        <div className="evidence-row">
          {violation.evidence.length === 0 ? (
            <div className="evidence-missing">No evidence attached — cannot be reliably confirmed.</div>
          ) : (
            violation.evidence.map((e) => <EvidencePreview key={e.id} violationId={violation.id} item={e} />)
          )}
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="review-card-actions">
        <input
          placeholder="Optional note for the record…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="btn btn-primary" disabled={!!deciding} onClick={() => decide("issued")}>
          {deciding === "issued" ? "Confirming…" : "Accept — issue fine"}
        </button>
        <button className="btn btn-ghost" disabled={!!deciding} onClick={() => decide("dismissed")}>
          {deciding === "dismissed" ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </div>
  );
}

export default function ReviewQueue() {
  const [pending, setPending] = useState<PendingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api
      .get<PendingSummary[]>("/violations?status=pending")
      .then(setPending)
      .catch(() => setError("Couldn't load the review queue."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Review Queue</h1>
          <p className="page-subtitle">
            Every violation — manual or device-submitted — waits here until accepted or rejected. Nothing becomes
            an issued fine automatically.
          </p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Loading…</div>
      ) : pending.length === 0 ? (
        <div className="page-loading">Nothing pending review right now.</div>
      ) : (
        <div className="review-queue-list">
          {pending.map((p) => (
            <ReviewCard key={p.id} id={p.id} onDecided={load} />
          ))}
        </div>
      )}
    </div>
  );
}
