// Trackers live in a plain note, one per line:
//   - Guild rep: 3        (number: − and + buttons)
//   - Alarm: 2/6          (number with a cap)
//   - Ledger found: no    (yes/no: a toggle)
//   - Weather: storm      (anything else: shown as text)

export interface Tracker {
  name: string;
  value: number | boolean | string;
  max?: number;
  line: number;
  raw: string;
}

const LINE_RE = /^(\s*[-*+]\s+)(?!\[[ xX]\])([^:]+?):\s*(.*?)\s*$/;

export const TRACKERS_TEMPLATE = [
  "Campaign clocks, one per line. 2/6 is a six-segment clock with two filled; a plain number is a counter; yes/no is a toggle.",
  "",
  "",
].join("\n");

export function parseValue(v: string): { value: number | boolean | string; max?: number } {
  const s = v.trim();
  let m = s.match(/^([-+]?\d+)\s*\/\s*(\d+)$/);
  if (m) return { value: Number(m[1]), max: Number(m[2]) };
  if (/^[-+]?\d+$/.test(s)) return { value: Number(s) };
  if (/^(yes|y|true|done|✓)$/i.test(s)) return { value: true };
  if (/^(no|n|false|not yet)$/i.test(s)) return { value: false };
  return { value: s };
}

export function formatValue(value: number | boolean | string, max?: number): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number" && max !== undefined) return `${value}/${max}`;
  return String(value);
}

export function parseTrackers(content: string): Tracker[] {
  const lines = content.split("\n");
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end > 0) start = end + 1;
  }
  const out: Tracker[] = [];
  for (let i = start; i < lines.length; i++) {
    const m = lines[i].match(LINE_RE);
    if (!m) continue;
    const { value, max } = parseValue(m[3]);
    out.push({ name: m[2].trim(), value, max, line: i, raw: lines[i] });
  }
  return out;
}

/** Rewrites one tracker line with a new value, keeping its bullet and name. */
export function setTrackerLine(line: string, value: number | boolean | string, max?: number): string {
  const m = line.match(LINE_RE);
  if (!m) return line;
  return `${m[1]}${m[2].trim()}: ${formatValue(value, max)}`;
}

// ---------- clocks inside a section of any note ----------

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

function normHeading(s: string): string {
  return s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[:.]+$/, "").replace(/\s+/g, " ").trim();
}

/** Finds the first heading matching one of `names` (comma-separated). Returns its line and the line after its section. */
export function sectionRange(lines: string[], names: string): { start: number; end: number } | null {
  const wanted = names.split(",").map(normHeading).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (!m || !wanted.includes(normHeading(m[2]))) continue;
    const level = m[1].length;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const h = lines[j].match(HEADING_RE);
      if (h && h[1].length <= level) {
        end = j;
        break;
      }
    }
    return { start: i, end };
  }
  return null;
}

function trackersInRange(lines: string[], from: number, to: number): Tracker[] {
  const out: Tracker[] = [];
  for (let i = from; i < to; i++) {
    const m = lines[i].match(LINE_RE);
    if (!m) continue;
    const { value, max } = parseValue(m[3]);
    out.push({ name: m[2].trim(), value, max, line: i, raw: lines[i] });
  }
  return out;
}

/** Clocks listed under a "## Clocks" heading (or any of `names`). */
export function trackersInSection(content: string, names: string): Tracker[] {
  const lines = content.split("\n");
  const r = sectionRange(lines, names);
  return r ? trackersInRange(lines, r.start + 1, r.end) : [];
}

/**
 * Adds a tracker line. With `names`, it goes at the end of that section
 * (creating "## <first name>" at the bottom if needed); without, at the end of the note.
 */
export function addTrackerLine(content: string, line: string, names?: string): string {
  const lines = content.replace(/\s+$/, "").split("\n");
  if (!names) return [...lines, line, ""].join("\n");
  const r = sectionRange(lines, names);
  if (!r) {
    const heading = names.split(",")[0].trim() || "Clocks";
    return [...lines, "", `## ${heading}`, line, ""].join("\n");
  }
  let at = r.start + 1;
  for (let i = r.start + 1; i < r.end; i++) if (lines[i].trim()) at = i + 1;
  lines.splice(at, 0, line);
  return lines.join("\n") + "\n";
}

export type ClockKind = 4 | 6 | 8 | 12 | "counter" | "toggle";

export function newTrackerLine(name: string, kind: ClockKind): string {
  if (kind === "counter") return `- ${name}: 0`;
  if (kind === "toggle") return `- ${name}: no`;
  return `- ${name}: 0/${kind}`;
}
