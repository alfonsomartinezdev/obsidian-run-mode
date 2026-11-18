// Clocks (Blades in the Dark style): rows with big tappable segments, and the sheet that lists them.
import { App, Menu, Modal, Platform, setIcon, TFile } from "obsidian";
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

// ---------- rows ----------

export interface RowOptions {
  app: App;
  file: TFile;
  onOpenNote: (f: TFile) => void;
  onChanged: () => void;
}

/**
 * One clock as a full-width row. Clocks show big segments: tap a segment to
 * set the clock to it, tap the last filled one to take it back.
 */
export function renderRow(parent: HTMLElement, t: Tracker, o: RowOptions) {
  const { app, file } = o;
  const set = async (value: number | boolean | string) => {
    await setTracker(app, file, t, value);
    o.onChanged();
  };
  const v = t.value;
  const isClock = typeof v === "number" && t.max !== undefined && t.max > 0 && t.max <= 24;
  const full = isClock && (v as number) >= t.max!;
  const row = parent.createDiv("rm-row" + (full ? " is-full" : ""));

  const top = row.createDiv("rm-row-top");
  top.createSpan({ cls: "rm-row-name", text: t.name });

  if (isClock) {
    top.createSpan({ cls: "rm-row-value", text: formatValue(v, t.max) });
  } else if (typeof v === "number") {
    const ctl = top.createDiv("rm-row-ctl");
    const minus = ctl.createEl("button", { attr: { "aria-label": `Decrease ${t.name}` } });
    setIcon(minus, "minus");
    ctl.createSpan({ cls: "rm-row-count", text: String(v) });
    const plus = ctl.createEl("button", { attr: { "aria-label": `Increase ${t.name}` } });
    setIcon(plus, "plus");
    minus.onclick = () => set(v - 1);
    plus.onclick = () => set(v + 1);
  } else if (typeof v === "boolean") {
    const b = top.createEl("button", {
      cls: "rm-row-toggle" + (v ? " is-on" : ""),
      text: v ? "Yes" : "No",
      attr: { "aria-pressed": String(v), "aria-label": `${t.name}: ${v ? "yes" : "no"}` },
    });
    b.onclick = () => set(!v);
  } else {
    top.createSpan({ cls: "rm-row-value", text: v || "–" });
  }

  const more = top.createEl("button", { cls: "rm-row-more", attr: { "aria-label": `More for ${t.name}` } });
  setIcon(more, "more-horizontal");
  more.onclick = (evt) => {
    const menu = new Menu();
    if (typeof v === "number") {
      menu.addItem((i) => i.setTitle("Reset to 0").setIcon("rotate-ccw").onClick(() => set(0)));
    }
    menu.addItem((i) => i.setTitle(`Open ${file.basename}`).setIcon("file-text").onClick(() => o.onOpenNote(file)));
    menu.addItem((i) =>
      i
        .setTitle("Delete")
        .setIcon("trash")
        .onClick(async () => {
          await deleteTracker(app, file, t);
          o.onChanged();
        }),
    );
    menu.showAtMouseEvent(evt);
  };

  if (isClock) {
    const segs = row.createDiv("rm-segs");
    const n = t.max!;
    const filled = v as number;
    for (let i = 1; i <= n; i++) {
      const seg = segs.createEl("button", {
        cls: "rm-seg" + (i <= filled ? " is-filled" : ""),
        attr: { "aria-label": `${t.name}: set to ${i === filled ? i - 1 : i} of ${n}` },
      });
      seg.onclick = () => set(i === filled ? i - 1 : i);
    }
  }
}

// ---------- the clocks sheet ----------

export interface ClockGroup {
  label: string;
  file: TFile;
  trackers: Tracker[];
}

/** All clocks for the moment (scene, session, campaign) in one sheet that stays open while you tap. */
export class ClocksSheet extends Modal {
  constructor(
    app: App,
    private load: () => Promise<ClockGroup[]>,
    private scopes: ClockScope[],
    private onOpenNote: (f: TFile) => void,
  ) {
    super(app);
  }

  async onOpen() {
    this.modalEl.addClass("rm-card-modal", "rm-clocks-sheet");
    if (Platform.isMobile) this.modalEl.addClass("rm-sheet");
    await this.draw();
  }

  private async draw() {
    const el = this.contentEl;
    const scrollTop = el.scrollTop;
    const groups = await this.load();
    el.empty();
    el.addClass("rm-card");

    const head = el.createDiv("rm-sheet-head");
    head.createEl("h2", { cls: "rm-card-title", text: "Clocks" });
    const add = head.createEl("button", { cls: "rm-btn mod-cta rm-sheet-add" });
    setIcon(add.createSpan(), "plus");
    add.createSpan({ text: "New clock" });
    add.onclick = () => new AddClockModal(this.app, this.scopes, () => this.redraw()).open();

    let total = 0;
    for (const g of groups) {
      if (!g.trackers.length) continue;
      total += g.trackers.length;
      el.createSpan({ cls: "rm-label", text: g.label });
      const list = el.createDiv("rm-rows");
      for (const t of g.trackers) {
        renderRow(list, t, {
          app: this.app,
          file: g.file,
          onChanged: () => this.redraw(),
          onOpenNote: (f) => {
            this.close();
            this.onOpenNote(f);
          },
        });
      }
    }
    if (!total) el.createEl("p", { cls: "rm-empty", text: "No clocks yet. Start one with New clock." });
    el.scrollTop = scrollTop;
  }

  private redraw() {
    window.setTimeout(() => this.draw(), 60);
  }

  onClose() {
    this.contentEl.empty();
  }
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
