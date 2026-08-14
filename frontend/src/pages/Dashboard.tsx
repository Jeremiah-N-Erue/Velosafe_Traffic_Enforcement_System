import { useEffect, useState } from "react";
import { api } from "../api/client";
import StatCard from "../components/StatCard";

interface Summary {
  totals: {
    zone_count: number;
    vehicle_count: number;
    violation_count: number;
    open_incident_count: number;
    total_fines: number;
    collected_fines: number;
  };
  severityBreakdown: { severity: string; count: number }[];
  violationsByZone: { id: number; name: string; violation_count: number }[];
  recentViolations: {
    id: number;
    plate_number: string;
    zone_name: string;
    recorded_speed_kph: number;
    speed_limit_kph: number;
    severity: string;
    fine_amount: number;
    status: string;
    recorded_at: string;
  }[];
  recentIncidents: {
    id: number;
    incident_type: string;
    severity: string;
    status: string;
    zone_name: string | null;
    reported_at: string;
  }[];
}

function currency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Summary>("/dashboard/summary")
      .then(setSummary)
      .catch(() => setError("Couldn't load dashboard data."));
  }, []);

  if (error) return <div className="page-error">{error}</div>;
  if (!summary) return <div className="page-loading">Loading dashboard…</div>;

  const maxZoneCount = Math.max(1, ...summary.violationsByZone.map((z) => z.violation_count));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">Live overview across all zones</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Active zones" value={summary.totals.zone_count} />
        <StatCard label="Registered vehicles" value={summary.totals.vehicle_count} />
        <StatCard label="Total violations" value={summary.totals.violation_count} />
        <StatCard
          label="Open incidents"
          value={summary.totals.open_incident_count}
          tone={summary.totals.open_incident_count > 0 ? "warning" : "success"}
        />
        <StatCard label="Fines issued" value={currency(summary.totals.total_fines)} />
        <StatCard label="Fines collected" value={currency(summary.totals.collected_fines)} tone="success" />
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2>Violations by severity</h2>
          <div className="severity-bars">
            {summary.severityBreakdown.map((s) => (
              <div key={s.severity} className={`severity-row severity-${s.severity}`}>
                <span className="severity-label">{s.severity}</span>
                <div className="severity-bar-track">
                  <div
                    className="severity-bar-fill"
                    style={{ width: `${(s.count / summary.totals.violation_count) * 100}%` }}
                  />
                </div>
                <span className="severity-count">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Top zones by violations</h2>
          <div className="zone-bars">
            {summary.violationsByZone.slice(0, 6).map((z) => (
              <div key={z.id} className="zone-row">
                <span className="zone-label">{z.name}</span>
                <div className="zone-bar-track">
                  <div className="zone-bar-fill" style={{ width: `${(z.violation_count / maxZoneCount) * 100}%` }} />
                </div>
                <span className="zone-count">{z.violation_count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2>Recent violations</h2>
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Plate</th>
                <th>Zone</th>
                <th>Speed</th>
                <th>Severity</th>
                <th>Fine</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentViolations.map((v) => (
                <tr key={v.id}>
                  <td className="mono">{v.plate_number}</td>
                  <td>{v.zone_name}</td>
                  <td>
                    {v.recorded_speed_kph} / {v.speed_limit_kph} km/h
                  </td>
                  <td>
                    <span className={`badge badge-${v.severity}`}>{v.severity}</span>
                  </td>
                  <td>{currency(v.fine_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Recent incidents</h2>
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Type</th>
                <th>Zone</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentIncidents.map((i) => (
                <tr key={i.id}>
                  <td>{i.incident_type.replace("_", " ")}</td>
                  <td>{i.zone_name ?? "—"}</td>
                  <td>
                    <span className={`badge badge-${i.severity}`}>{i.severity}</span>
                  </td>
                  <td>{i.status.replace("_", " ")}</td>
                  <td>{formatDate(i.reported_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
