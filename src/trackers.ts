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
  "One tracker per line. A number gets − and + buttons, a number with a cap like 2/6 stops at the cap, and yes/no becomes a toggle.",
  "",
  "- Reputation: 0",
  "- Clock: 0/6",
  "- Secret found: no",
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
