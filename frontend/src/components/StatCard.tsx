interface StatCardProps {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "danger" | "success";
  hint?: string;
}

export default function StatCard({ label, value, tone = "default", hint }: StatCardProps) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
