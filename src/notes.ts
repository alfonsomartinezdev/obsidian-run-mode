// Helpers for reading scene, session and NPC notes.
import { App, TFile } from "obsidian";

export type SceneStatus = "unvisited" | "in-play" | "visited";

export const STATUSES: { id: SceneStatus; label: string }[] = [
  { id: "unvisited", label: "Unvisited" },
  { id: "in-play", label: "In play" },
  { id: "visited", label: "Visited" },
];

/** Accepts loose spellings in frontmatter ("In Play", "done", "skipped"…). */
export function normStatus(v: unknown): SceneStatus {
  const s = String(v ?? "").toLowerCase().trim().replace(/[\s_]+/g, "-");
  if (["in-play", "inplay", "playing", "current", "active", "now"].includes(s)) return "in-play";
  if (["visited", "done", "played", "complete", "completed", "skipped", "cut"].includes(s)) return "visited";
  return "unvisited";
}

export function asList(v: unknown): unknown[] {
  if (v === null || v === undefined || v === "") return [];
  return Array.isArray(v) ? v : [v];
}

export function fmOf(app: App, file: TFile): Record<string, any> {
  return app.metadataCache.getFileCache(file)?.frontmatter ?? {};
}

/** A note's kind comes from `type:` in its properties, or a #scene / #session tag. */
export function noteType(app: App, file: TFile): string {
  const fm = fmOf(app, file);
  if (fm.type) return String(fm.type).toLowerCase().trim();
  const tags = asList(fm.tags).map((t) => String(t).toLowerCase().replace(/^#/, ""));
  for (const t of ["scene", "session"]) if (tags.includes(t)) return t;
  return "";
}

export function parseLink(raw: string): { target: string; alias?: string } {
  let s = String(raw).trim();
  const m = s.match(/^\[\[([\s\S]*)\]\]$/);
  if (m) s = m[1];
  const [t, alias] = s.split("|");
  return { target: (t ?? "").split("#")[0].trim(), alias: alias?.trim() || undefined };
}

export function resolveLink(app: App, raw: string, sourcePath: string): TFile | null {
  const { target } = parseLink(raw);
  if (!target) return null;
  return app.metadataCache.getFirstLinkpathDest(target, sourcePath);
}

/** "[[A Crown of Salt]]" → "A Crown of Salt"; plain text passes through. */
export function linkLabel(raw: unknown): string {
  const { target, alias } = parseLink(String(raw ?? ""));
  return alias ?? target;
}

export function displayName(app: App, file: TFile): string {
  const fm = fmOf(app, file);
  return fm.title ? String(fm.title) : file.basename;
}

export function aliasesOf(app: App, file: TFile): string[] {
  const fm = fmOf(app, file);
  return [...asList(fm.aliases), ...asList(fm.alias)].map(String);
}

export interface Section {
  heading: string;
  line: number; // line of the heading itself
  end: number; // first line after the section
  body: string;
}

export interface ParsedNote {
  lines: string[];
  preamble: string; // text between the properties and the first heading
  sections: Section[];
}

/**
 * Splits a note into its top-level sections. Sub-headings stay inside
 * their parent section, so "### Stats" under "## Who's here" travels with it.
 */
export async function parseNote(app: App, file: TFile): Promise<ParsedNote> {
  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");
  const cache = app.metadataCache.getFileCache(file);
  const bodyStart = cache?.frontmatterPosition ? cache.frontmatterPosition.end.line + 1 : 0;
  const headings = (cache?.headings ?? []).filter((h) => h.position.start.line >= bodyStart);
  const top = headings.length ? Math.min(...headings.map((h) => h.level)) : 0;
  const primary = headings.filter((h) => h.level === top);

  const sections: Section[] = primary.map((h, i) => {
    const line = h.position.start.line;
    const end = i + 1 < primary.length ? primary[i + 1].position.start.line : lines.length;
    return { heading: h.heading.trim(), line, end, body: lines.slice(line + 1, end).join("\n").trim() };
  });
  const firstHeading = primary.length ? primary[0].position.start.line : lines.length;
  const preamble = lines.slice(bodyStart, firstHeading).join("\n").trim();
  return { lines, preamble, sections };
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[:.]+$/, "").replace(/\s+/g, " ").trim();
}

/** `names` is a comma-separated list from settings, e.g. "Read aloud, Boxed text". */
export function findSection(sections: Section[], names: string): Section | undefined {
  const wanted = names.split(",").map(norm).filter(Boolean);
  return sections.find((s) => wanted.includes(norm(s.heading)));
}

export interface WikiLink {
  target: string;
  label: string;
}

export function linksIn(text: string): WikiLink[] {
  const out: WikiLink[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const { target, alias } = parseLink(m[1]);
    if (target) out.push({ target, label: alias ?? target.split("/").pop() ?? target });
  }
  return out;
}

export interface TaskItem {
  line: number;
  raw: string;
  done: boolean;
  text: string;
}

const TASK_RE = /^\s*[-*+]\s+\[([^\]])\]\s?(.*)$/;

export function tasksIn(section: Section, lines: string[]): TaskItem[] {
  const out: TaskItem[] = [];
  for (let i = section.line + 1; i < section.end; i++) {
    const m = lines[i].match(TASK_RE);
    if (m) out.push({ line: i, raw: lines[i], done: m[1] !== " ", text: m[2].trim() });
  }
  return out;
}

export function setTaskDone(line: string, done: boolean): string {
  return line.replace(/^(\s*[-*+]\s+\[)[^\]](\])/, `$1${done ? "x" : " "}$2`);
}

/** Strips list markers and simple markdown so a line reads well as a chip. */
export function plainLine(line: string): string {
  return line
    .replace(/^\s*([-*+]|\d+\.)\s+/, "")
    .replace(/\*\*|__|\*|_/g, "")
    .trim();
}
