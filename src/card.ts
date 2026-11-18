// The pop-up card for an NPC, monster, place or item.
import { App, Component, MarkdownRenderer, Modal, Notice, Platform, TFile } from "obsidian";
import type RunModePlugin from "./main";
import { displayName, findSection, fmOf, parseNote, resolveLink, Section } from "./notes";
import { AddClockModal, addTracker, renderRow } from "./clocks";
import { trackersInSection } from "./trackers";

export class CardModal extends Modal {
  private comp: Component | null = null;
  private clickBound = false;

  constructor(
    app: App,
    private plugin: RunModePlugin,
    private file: TFile,
    private openTarget: (f: TFile) => void,
  ) {
    super(app);
  }

  async onOpen() {
    this.modalEl.addClass("rm-card-modal");
    if (Platform.isMobile) this.modalEl.addClass("rm-sheet");
    await this.draw();
  }

  /** Draws (or redraws, after a clock changes) the card. */
  private async draw() {
    this.comp?.unload();
    const comp = new Component();
    comp.load();
    this.comp = comp;

    const el = this.contentEl;
    el.empty();
    el.addClass("rm-card");
    const s = this.plugin.settings;
    const fm = fmOf(this.app, this.file);
    const md = (text: string, into: HTMLElement) =>
      MarkdownRenderer.render(this.app, text, into, this.file.path, comp);

    const head = el.createDiv("rm-card-head");
    const kicker = [fm.type, fm.role].filter(Boolean).map(String).join(" · ");
    if (kicker) head.createSpan({ cls: "rm-kicker rm-accent", text: kicker });
    head.createEl("h2", { cls: "rm-card-title", text: displayName(this.app, this.file) });
    const tagline = fm.tagline ?? fm.summary ?? fm.description;
    if (tagline) head.createSpan({ cls: "rm-card-tagline", text: String(tagline) });

    const parsed = await parseNote(this.app, this.file);
    const pk = findSection(parsed.sections, s.playersKnow);
    const dm = findSection(parsed.sections, s.dmOnly);
    const clocksSec = findSection(parsed.sections, s.clocks);
    const used = new Set<Section>([pk, dm, clocksSec].filter((x): x is Section => !!x));

    if (parsed.preamble) await md(parsed.preamble, el.createDiv("rm-box rm-md"));

    for (const [sec, cls, label] of [
      [pk, "rm-pk", "Players know"],
      [dm, "rm-dm", "DM only"],
    ] as const) {
      if (!sec || !sec.body) continue;
      const box = el.createDiv(`rm-box ${cls}`);
      box.createSpan({ cls: "rm-label", text: label });
      await md(sec.body, box.createDiv("rm-md"));
    }

    if (fm.stats && typeof fm.stats === "object" && !Array.isArray(fm.stats)) {
      const grid = el.createDiv("rm-stats");
      for (const [k, v] of Object.entries(fm.stats)) {
        const cell = grid.createDiv("rm-stat");
        cell.createSpan({ cls: "rm-stat-name", text: k });
        cell.createSpan({ cls: "rm-stat-value", text: String(v) });
      }
    }

    // Clocks on this note (a faction's plans, an NPC's patience…)
    const clocks = trackersInSection(parsed.lines.join("\n"), s.clocks);
    const clockBox = el.createDiv("rm-card-clocks");
    if (clocks.length) clockBox.createSpan({ cls: "rm-label", text: "Clocks" });
    const tiles = clockBox.createDiv("rm-rows");
    const redraw = () => window.setTimeout(() => this.draw(), 150);
    for (const t of clocks) {
      renderRow(tiles, t, {
        app: this.app,
        file: this.file,
        onChanged: redraw,
        onOpenNote: (f) => {
          this.close();
          this.app.workspace.getLeaf("tab").openFile(f);
        },
      });
    }

    for (const sec of parsed.sections) {
      if (used.has(sec) || !sec.body) continue;
      const det = el.createEl("details", { cls: "rm-more" });
      det.createEl("summary", { text: sec.heading });
      await md(sec.body, det.createDiv("rm-md"));
    }

    if (!parsed.preamble && !parsed.sections.length) {
      el.createEl("p", { cls: "rm-empty", text: "This note is empty." });
    }

    const actions = el.createDiv("rm-card-actions");
    const addClock = actions.createEl("button", { cls: "rm-btn", text: "Add clock" });
    addClock.onclick = () =>
      new AddClockModal(
        this.app,
        [{ label: this.file.basename, add: (n, k) => addTracker(this.app, this.file, n, k, s.clocks) }],
        redraw,
      ).open();
    const open = actions.createEl("button", { cls: "rm-btn", text: "Open full note" });
    open.onclick = () => {
      this.close();
      this.app.workspace.getLeaf("tab").openFile(this.file);
    };

    // Links inside the card open their own card instead of leaving Run mode.
    if (this.clickBound) return;
    this.clickBound = true;
    el.addEventListener(
      "click",
      (e: MouseEvent) => {
        const a = (e.target as HTMLElement).closest("a.internal-link");
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        const href = a.getAttribute("data-href") ?? a.getAttribute("href") ?? "";
        const target = resolveLink(this.app, href, this.file.path);
        if (!target) return void new Notice(`No note named "${href}" yet.`);
        this.close();
        this.openTarget(target);
      },
      true,
    );
  }

  onClose() {
    this.comp?.unload();
    this.contentEl.empty();
  }
}
