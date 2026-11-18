// Clock tiles (Blades in the Dark style), shared by the trackers bar and character cards.
import { App, Menu, Modal, setIcon, TFile } from "obsidian";
import { addTrackerLine, ClockKind, formatValue, newTrackerLine, setTrackerLine, Tracker } from "./trackers";

// ---------- writing ----------

async function editLine(app: App, file: TFile, t: Tracker, change: (line: string) => string | null) {
  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    const idx = lines[t.line] === t.raw ? t.line : lines.indexOf(t.raw);
    if (idx < 0) return data;
    const next = change(lines[idx]);
    if (next === null) lines.splice(idx, 1);
    else lines[idx] = next;
    return lines.join("\n");
  });
}

export function setTracker(app: App, file: TFile, t: Tracker, value: number | boolean | string) {
  return editLine(app, file, t, (line) => setTrackerLine(line, value, t.max));
}

export function deleteTracker(app: App, file: TFile, t: Tracker) {
  return editLine(app, file, t, () => null);
}

/** `section` = heading names to add under; omit to append to the end of the note. */
export function addTracker(app: App, file: TFile, name: string, kind: ClockKind, section?: string) {
  return app.vault.process(file, (data) => addTrackerLine(data, newTrackerLine(name, kind), section));
}

// ---------- drawing ----------

const SVG_NS = "http://www.w3.org/2000/svg";

/** A segmented circle: `filled` of `segments` wedges coloured in. */
export function clockSvg(filled: number, segments: number, size = 40): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("rm-clock-svg");
  const c = 20;
  const r = 17;
  const n = Math.max(1, Math.min(24, segments));
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const a1 = a0 + (2 * Math.PI) / n;
    const el =
      n === 1
        ? document.createElementNS(SVG_NS, "circle")
        : document.createElementNS(SVG_NS, "path");
    if (n === 1) {
      el.setAttribute("cx", String(c));
      el.setAttribute("cy", String(c));
      el.setAttribute("r", String(r));
    } else {
      const p = (a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
      el.setAttribute("d", `M ${c} ${c} L ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)} Z`);
    }
    el.classList.add("rm-clock-seg");
    if (i < filled) el.classList.add("is-filled");
    svg.appendChild(el);
  }
  return svg;
}

// ---------- tiles ----------

export interface TileOptions {
  app: App;
  file: TFile;
  onOpenNote: (f: TFile) => void;
  onChanged?: () => void; // for places that don't re-render on file changes (cards)
}

export function renderTile(parent: HTMLElement, t: Tracker, o: TileOptions) {
  const { app, file } = o;
  const done = async (p: Promise<unknown>) => {
    await p;
    o.onChanged?.();
  };
  const v = t.value;
  const isClock = typeof v === "number" && t.max !== undefined && t.max <= 24;
  const full = isClock && (v as number) >= t.max!;
  const tile = parent.createDiv("rm-tile" + (full ? " is-full" : ""));

  if (isClock) {
    const pie = tile.createEl("button", {
      cls: "rm-clock-btn",
      attr: { "aria-label": `Fill a segment of ${t.name} (${v} of ${t.max})` },
    });
    pie.appendChild(clockSvg(v as number, t.max!));
    pie.onclick = () => {
      if ((v as number) < t.max!) done(setTracker(app, file, t, (v as number) + 1));
    };
  }

  const info = tile.createEl("button", { cls: "rm-tile-info", attr: { "aria-label": `Options for ${t.name}` } });
  info.createSpan({ cls: "rm-tile-name", text: t.name });
  if (typeof v !== "boolean") info.createSpan({ cls: "rm-tile-value", text: v === "" ? "–" : formatValue(v, t.max) });

  if (typeof v === "number" && !isClock) {
    const ctl = tile.createDiv("rm-tracker-ctl");
    const minus = ctl.createEl("button", { attr: { "aria-label": `Decrease ${t.name}` } });
    setIcon(minus, "minus");
    const plus = ctl.createEl("button", { attr: { "aria-label": `Increase ${t.name}` } });
    setIcon(plus, "plus");
    const clamp = (n: number) => (t.max !== undefined ? Math.max(0, Math.min(t.max, n)) : n);
    minus.onclick = () => done(setTracker(app, file, t, clamp(v - 1)));
    plus.onclick = () => done(setTracker(app, file, t, clamp(v + 1)));
  } else if (typeof v === "boolean") {
    const b = tile.createEl("button", {
      cls: "rm-tracker-toggle" + (v ? " is-on" : ""),
      text: v ? "Yes" : "No",
      attr: { "aria-pressed": String(v) },
    });
    b.onclick = () => done(setTracker(app, file, t, !v));
  }

  info.onclick = (evt) => {
    const menu = new Menu();
    if (typeof v === "number") {
      menu.addItem((i) =>
        i
          .setTitle(isClock ? "Clear one segment" : "Subtract one")
          .setIcon("minus")
          .onClick(() => done(setTracker(app, file, t, Math.max(isClock ? 0 : -Infinity, v - 1)))),
      );
      menu.addItem((i) => i.setTitle("Reset to 0").setIcon("rotate-ccw").onClick(() => done(setTracker(app, file, t, 0))));
    }
    menu.addItem((i) => i.setTitle(`Open ${file.basename}`).setIcon("file-text").onClick(() => o.onOpenNote(file)));
    menu.addItem((i) =>
      i
        .setTitle("Delete")
        .setIcon("trash")
        .onClick(() => done(deleteTracker(app, file, t))),
    );
    menu.showAtMouseEvent(evt);
  };
}

// ---------- adding a clock ----------

export interface ClockScope {
  label: string; // "Scene", "Session", "Campaign", or a note name
  add: (name: string, kind: ClockKind) => Promise<unknown>;
}

const KINDS: { kind: ClockKind; label: string }[] = [
  { kind: 4, label: "4" },
  { kind: 6, label: "6" },
  { kind: 8, label: "8" },
  { kind: 12, label: "12" },
  { kind: "counter", label: "Counter" },
  { kind: "toggle", label: "Yes/No" },
];

export class AddClockModal extends Modal {
  private kind: ClockKind = 4;
  private scopeIndex = 0;

  constructor(
    app: App,
    private scopes: ClockScope[],
    private onDone?: () => void,
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass("rm-name-modal");
    const el = this.contentEl;
    el.empty();
    el.createEl("h3", { text: "New clock" });
    const form = el.createEl("form", { cls: "rm-name-form" });
    const input = form.createEl("input", {
      type: "text",
      attr: { placeholder: "e.g. Guards alerted", "aria-label": "Clock name" },
    });

    const chipRow = (label: string, items: string[], get: () => number, set: (i: number) => void) => {
      form.createSpan({ cls: "rm-label", text: label });
      const row = form.createDiv("rm-chips");
      const buttons = items.map((text, i) => {
        const b = row.createEl("button", { cls: "rm-chip", text, attr: { type: "button" } });
        b.onclick = () => {
          set(i);
          paint();
        };
        return b;
      });
      const paint = () =>
        buttons.forEach((b, i) => {
          b.toggleClass("is-on", i === get());
          b.setAttr("aria-pressed", String(i === get()));
        });
      paint();
    };

    chipRow(
      "Segments",
      KINDS.map((k) => k.label),
      () => KINDS.findIndex((k) => k.kind === this.kind),
      (i) => (this.kind = KINDS[i].kind),
    );
    if (this.scopes.length > 1) {
      chipRow(
        "Belongs to",
        this.scopes.map((s) => s.label),
        () => this.scopeIndex,
        (i) => (this.scopeIndex = i),
      );
    }

    form.createEl("button", { cls: "mod-cta rm-btn", text: "Add clock", attr: { type: "submit" } });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/:/g, " -");
      if (!name) return;
      this.close();
      await this.scopes[this.scopeIndex].add(name, this.kind);
      this.onDone?.();
    };
    window.setTimeout(() => input.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}
