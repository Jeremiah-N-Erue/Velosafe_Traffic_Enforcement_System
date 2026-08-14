import { db } from "../db";

export interface ChatAnswer {
  reply: string;
  intent: string;
  data?: unknown;
}

interface TimeWindow {
  label: string;
  sqliteModifier: string | null; // e.g. "-7 days", null = all time
}

const SEVERITIES = ["minor", "moderate", "severe", "extreme"] as const;
const VIOLATION_STATUSES = ["pending", "issued", "paid", "disputed", "dismissed"] as const;
const INCIDENT_STATUSES = ["open", "in_progress", "resolved"] as const;

function parseTimeWindow(text: string): TimeWindow {
  if (/\btoday\b/.test(text)) return { label: "today", sqliteModifier: "start of day" };
  if (/\byesterday\b/.test(text)) return { label: "yesterday", sqliteModifier: "-1 day" };
  if (/\bthis week\b|\bpast week\b|\blast 7 days\b/.test(text)) return { label: "the last 7 days", sqliteModifier: "-7 days" };
  if (/\bthis month\b|\bpast month\b|\blast 30 days\b/.test(text)) return { label: "the last 30 days", sqliteModifier: "-30 days" };

  const lastNDays = text.match(/last (\d+) days?/);
  if (lastNDays) {
    const n = Number(lastNDays[1]);
    return { label: `the last ${n} days`, sqliteModifier: `-${n} days` };
  }

  return { label: "all time", sqliteModifier: null };
}

function timeWindowClause(column: string, window: TimeWindow): { clause: string; params: unknown[] } {
  if (!window.sqliteModifier) return { clause: "1=1", params: [] };
  if (window.sqliteModifier === "start of day") {
    return { clause: `${column} >= datetime('now', 'start of day')`, params: [] };
  }
  return { clause: `${column} >= datetime('now', ?)`, params: [window.sqliteModifier] };
}

function findMentionedZone(text: string): { id: number; name: string } | undefined {
  const zones = db.prepare("SELECT id, name, road_name FROM zones").all() as {
    id: number;
    name: string;
    road_name: string;
  }[];
  const lower = text.toLowerCase();
  return zones.find(
    (z) => lower.includes(z.name.toLowerCase()) || lower.includes(z.road_name.toLowerCase()),
  );
}

function findMentionedSeverity(text: string): (typeof SEVERITIES)[number] | undefined {
  return SEVERITIES.find((s) => text.includes(s));
}

function findMentionedViolationStatus(text: string): (typeof VIOLATION_STATUSES)[number] | undefined {
  return VIOLATION_STATUSES.find((s) => text.includes(s));
}

function findMentionedIncidentStatus(text: string): (typeof INCIDENT_STATUSES)[number] | undefined {
  if (/\bopen\b/.test(text)) return "open";
  if (/\bin progress\b|\bin-progress\b/.test(text)) return "in_progress";
  if (/\bresolved\b|\bclosed\b/.test(text)) return "resolved";
  return undefined;
}

function currency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function answerQuestion(rawMessage: string): ChatAnswer {
  const text = rawMessage.trim().toLowerCase();

  // Greeting / help
  if (/^(hi|hello|hey)\b/.test(text) || text.length < 3) {
    return {
      intent: "greeting",
      reply:
        "Hi! I can answer questions about VeloSafe's live data — try things like " +
        `"how many violations this week", "open incidents", "total fines collected", ` +
        `"violations in Maple Zone", or "top zone by violations".`,
    };
  }

  if (/\bhelp\b|\bwhat can you do\b/.test(text)) {
    return {
      intent: "help",
      reply:
        "I can answer questions about zones, vehicles, speed violations, incidents, and fines. " +
        "Examples: \"how many severe violations today\", \"open incidents\", \"total fines this month\", " +
        "\"lookup plate ABC123\", \"top zone by violations\", \"speed limit on Maple Zone\".",
    };
  }

  // Vehicle lookup by plate
  const plateMatch = rawMessage.match(/\b(?:plate|vehicle)\s*[:#]?\s*([A-Za-z0-9-]{3,10})\b/i);
  if (plateMatch && /plate|vehicle|lookup|find/.test(text)) {
    const plate = plateMatch[1].toUpperCase();
    const vehicle = db.prepare("SELECT * FROM vehicles WHERE plate_number = ?").get(plate) as
      | { id: number; plate_number: string; make: string; model: string; owner_name: string }
      | undefined;
    if (!vehicle) {
      return { intent: "vehicle_lookup", reply: `I couldn't find a vehicle registered with plate ${plate}.` };
    }
    const violationCount = (
      db.prepare("SELECT COUNT(*) AS c FROM violations WHERE vehicle_id = ?").get(vehicle.id) as { c: number }
    ).c;
    return {
      intent: "vehicle_lookup",
      reply: `${plate} is a ${vehicle.make} ${vehicle.model} registered to ${vehicle.owner_name}, with ${violationCount} recorded violation${violationCount === 1 ? "" : "s"}.`,
      data: vehicle,
    };
  }

  // Zone speed limit lookup
  if (/speed limit/.test(text)) {
    const zone = findMentionedZone(text);
    if (zone) {
      const row = db.prepare("SELECT speed_limit_kph FROM zones WHERE id = ?").get(zone.id) as {
        speed_limit_kph: number;
      };
      return {
        intent: "zone_speed_limit",
        reply: `The posted speed limit in ${zone.name} is ${row.speed_limit_kph} km/h.`,
      };
    }
  }

  // Top zone by violations
  if (/(top|worst|most violations|highest).*(zone)/.test(text) || /zone.*(top|worst|most violations)/.test(text)) {
    const row = db
      .prepare(
        `SELECT z.name, COUNT(v.id) AS count FROM zones z
         LEFT JOIN violations v ON v.zone_id = z.id
         GROUP BY z.id ORDER BY count DESC LIMIT 1`,
      )
      .get() as { name: string; count: number } | undefined;
    if (!row || row.count === 0) {
      return { intent: "top_zone", reply: "No violations have been recorded in any zone yet." };
    }
    return {
      intent: "top_zone",
      reply: `${row.name} has the most violations recorded: ${row.count}.`,
      data: row,
    };
  }

  // Fines / revenue
  if (/\bfine|fines|revenue|collected|money\b/.test(text)) {
    const window = parseTimeWindow(text);
    const { clause, params } = timeWindowClause("recorded_at", window);
    const paidOnly = /collected|paid/.test(text);
    const statusClause = paidOnly ? "AND status = 'paid'" : "";
    const row = db
      .prepare(`SELECT COALESCE(SUM(fine_amount), 0) AS total, COUNT(*) AS count FROM violations WHERE ${clause} ${statusClause}`)
      .get(...params) as { total: number; count: number };
    const verb = paidOnly ? "collected" : "issued";
    return {
      intent: "fines_summary",
      reply: `${currency(row.total)} in fines ${verb} across ${row.count} violation${row.count === 1 ? "" : "s"} over ${window.label}.`,
      data: row,
    };
  }

  // Incidents
  if (/\bincident|incidents|collision|hazard|closure\b/.test(text)) {
    const status = findMentionedIncidentStatus(text);
    const zone = findMentionedZone(text);
    const filters: string[] = [];
    const params: unknown[] = [];
    if (status) {
      filters.push("status = ?");
      params.push(status);
    }
    if (zone) {
      filters.push("zone_id = ?");
      params.push(zone.id);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const row = db.prepare(`SELECT COUNT(*) AS c FROM incidents ${where}`).get(...params) as { c: number };

    const descriptors = [status ? status.replace("_", " ") : null, zone ? `in ${zone.name}` : null]
      .filter(Boolean)
      .join(" ");
    return {
      intent: "incident_count",
      reply: `There ${row.c === 1 ? "is" : "are"} ${row.c} ${descriptors ? descriptors + " " : ""}incident${row.c === 1 ? "" : "s"} on record.`,
      data: row,
    };
  }

  // Violations (default catch — counts, optionally filtered)
  if (/\bviolation|violations|speeding|over the limit|over limit\b/.test(text) || /how many/.test(text)) {
    const window = parseTimeWindow(text);
    const severity = findMentionedSeverity(text);
    const status = findMentionedViolationStatus(text);
    const zone = findMentionedZone(text);

    const filters: string[] = [];
    const params: unknown[] = [];
    const { clause: timeClause, params: timeParams } = timeWindowClause("recorded_at", window);
    filters.push(timeClause);
    params.push(...timeParams);
    if (severity) {
      filters.push("severity = ?");
      params.push(severity);
    }
    if (status) {
      filters.push("status = ?");
      params.push(status);
    }
    if (zone) {
      filters.push("zone_id = ?");
      params.push(zone.id);
    }

    const where = filters.join(" AND ");
    const row = db.prepare(`SELECT COUNT(*) AS c FROM violations WHERE ${where}`).get(...params) as { c: number };

    const descriptors = [severity, status, zone ? `in ${zone.name}` : null].filter(Boolean).join(" ");
    return {
      intent: "violation_count",
      reply: `There ${row.c === 1 ? "was" : "were"} ${row.c} ${descriptors ? descriptors + " " : ""}violation${row.c === 1 ? "" : "s"} recorded over ${window.label}.`,
      data: row,
    };
  }

  // Fallback — general summary
  const totals = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM zones) AS zones,
        (SELECT COUNT(*) FROM vehicles) AS vehicles,
        (SELECT COUNT(*) FROM violations) AS violations,
        (SELECT COUNT(*) FROM incidents WHERE status != 'resolved') AS open_incidents`,
    )
    .get() as { zones: number; vehicles: number; violations: number; open_incidents: number };

  return {
    intent: "fallback_summary",
    reply:
      `I'm not sure exactly what you're asking, but here's a quick snapshot: ${totals.zones} zones, ` +
      `${totals.vehicles} registered vehicles, ${totals.violations} total violations, and ${totals.open_incidents} open incidents. ` +
      `Try asking something like "violations this week" or "open incidents".`,
    data: totals,
  };
}
