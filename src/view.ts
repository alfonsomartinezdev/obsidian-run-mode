// The Run mode view: a scene board, and a focused view of one scene.
import {
  App,
  Component,
  ItemView,
  MarkdownRenderer,
  Notice,
  prepareFuzzySearch,
  setIcon,
  SuggestModal,
  TFile,
  ViewStateResult,
  WorkspaceLeaf,
} from "obsidian";
import type RunModePlugin from "./main";
import { CardModal } from "./card";
import {
  aliasesOf,
  asList,
  displayName,
  findSection,
  fmOf,
  linkLabel,
  linksIn,
  normStatus,
  noteType,
  parseNote,
  plainLine,
  resolveLink,
  SceneStatus,
  Section,
  setTaskDone,
  STATUSES,
  tasksIn,
} from "./notes";

export const VIEW_TYPE = "run-mode-view";

type Filter = "all" | SceneStatus;

interface RunState {
  sessionPath?: string;
  mode: "board" | "scene";
  scenePath?: string;
  filter: Filter;
}

interface Tracker {
  name: string;
  value: unknown;
  max?: number;
  index?: number; // list form
  key?: string; // map form
}

export class RunModeView extends ItemView {
  private st: RunState = { mode: "board", filter: "all" };
  private renderComp: Component | null = null;
  private renderToken = 0;
  private timer: number | null = null;
  private searchFocused = false;
  private dirty = false;

  constructor(leaf: WorkspaceLeaf, private plugin: RunModePlugin) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Run mode";
  }
  getIcon() {
    return "swords";
  }

  getState(): Record<string, unknown> {
    return { ...super.getState(), ...this.st };
  }

  async setState(state: any, result: ViewStateResult) {
    if (state && typeof state === "object") {
      if (typeof state.sessionPath === "string") this.st.sessionPath = state.sessionPath;
      if (state.mode === "board" || state.mode === "scene") this.st.mode = state.mode;
      if (typeof state.scenePath === "string") this.st.scenePath = state.scenePath;
      if (typeof state.filter === "string") this.st.filter = state.filter;
    }
    await super.setState(state, result);
    this.render();
  }

  async onOpen() {
    this.contentEl.addClass("rm-root");
    this.registerEvent(this.app.metadataCache.on("changed", () => this.schedule()));
    this.registerEvent(this.app.vault.on("rename", () => this.schedule()));
    this.registerEvent(this.app.vault.on("delete", () => this.schedule()));
    this.registerDomEvent(this.contentEl, "click", (e) => this.onLinkClick(e), true);
    await this.render();
  }

  async onClose() {
    if (this.timer) window.clearTimeout(this.timer);
  }

  // ---------- navigation ----------

  private schedule() {
    if (this.searchFocused) {
      this.dirty = true;
      return;
    }
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), 200);
  }

  private onLinkClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest("a.internal-link");
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const href = a.getAttribute("data-href") ?? a.getAttribute("href") ?? "";
    const src = (this.st.mode === "scene" && this.st.scenePath) || this.st.sessionPath || "";
    const f = resolveLink(this.app, href, src);
    if (f) this.openTarget(f);
    else new Notice(`No note named "${href}" yet.`);
  }

  openTarget(file: TFile) {
    if (noteType(this.app, file) === this.plugin.settings.sceneType) {
      this.st.mode = "scene";
      this.st.scenePath = file.path;
      this.app.workspace.requestSaveLayout();
      this.render(true);
    } else {
      new CardModal(this.app, this.plugin, file, (f) => this.openTarget(f)).open();
    }
  }

  private toBoard() {
    this.st.mode = "board";
    this.app.workspace.requestSaveLayout();
    this.render(true);
  }

  async chooseSession(file: TFile) {
    this.st.sessionPath = file.path;
    this.st.mode = "board";
    this.plugin.settings.lastSession = file.path;
    await this.plugin.saveSettings();
    this.app.workspace.requestSaveLayout();
    this.render(true);
  }

  // ---------- data ----------

  private byOrder = (a: TFile, b: TFile) => {
    const oa = Number(fmOf(this.app, a).order);
    const ob = Number(fmOf(this.app, b).order);
    if (!isNaN(oa) && !isNaN(ob) && oa !== ob) return oa - ob;
    return a.basename.localeCompare(b.basename, undefined, { numeric: true });
  };

  sessions(): TFile[] {
    const t = this.plugin.settings.sessionType;
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => noteType(this.app, f) === t)
      .sort(this.byOrder);
  }

  private currentSession(): TFile | null {
    const get = (p?: string) => {
      const f = p ? this.app.vault.getAbstractFileByPath(p) : null;
      return f instanceof TFile ? f : null;
    };
    const chosen = get(this.st.sessionPath) ?? get(this.plugin.settings.lastSession);
    if (chosen) return chosen;
    const all = this.sessions();
    const next = all.find((f) =>
      ["next", "current", "in-play", "playing", "now"].includes(
        String(fmOf(this.app, f).status ?? "").toLowerCase().trim().replace(/\s+/g, "-"),
      ),
    );
    return next ?? all[all.length - 1] ?? null;
  }

  private scenesFor(session: TFile): TFile[] {
    const out: TFile[] = [];
    const seen = new Set<string>();
    for (const raw of asList(fmOf(this.app, session).scenes)) {
      const f = resolveLink(this.app, String(raw), session.path);
      if (f && !seen.has(f.path)) {
        seen.add(f.path);
        out.push(f);
      }
    }
    const t = this.plugin.settings.sceneType;
    const rest = this.app.vault
      .getMarkdownFiles()
      .filter(
        (f) =>
          !seen.has(f.path) &&
          noteType(this.app, f) === t &&
          asList(fmOf(this.app, f).session).some(
            (r) => resolveLink(this.app, String(r), f.path)?.path === session.path,
          ),
      )
      .sort(this.byOrder);
    return [...out, ...rest];
  }

  private leadsOf(scene: TFile, sections: Section[]): TFile[] {
    const raws = asList(fmOf(this.app, scene).leads).map(String);
    const sec = findSection(sections, this.plugin.settings.leads);
    if (sec) raws.push(...linksIn(sec.body).map((l) => l.target));
    const out: TFile[] = [];
    for (const r of raws) {
      const f = resolveLink(this.app, r, scene.path);
      if (f && !out.includes(f)) out.push(f);
    }
    return out;
  }

  // ---------- rendering ----------

  async render(resetScroll = false) {
    const token = ++this.renderToken;
    const comp = new Component();
    this.addChild(comp);
    const root = createDiv({ cls: "rm-view" });

    const oldScroll = this.contentEl.querySelector(".rm-scroll")?.scrollTop ?? 0;

    const session = this.currentSession();
    if (!session) {
      this.renderNoSession(root);
    } else {
      this.st.sessionPath = session.path;
      const sceneFile =
        this.st.mode === "scene" && this.st.scenePath
          ? this.app.vault.getAbstractFileByPath(this.st.scenePath)
          : null;
      if (sceneFile instanceof TFile) await this.renderScene(root, comp, session, sceneFile);
      else {
        this.st.mode = "board";
        this.renderBoard(root, session);
      }
      this.renderTrackers(root, session);
    }

    if (token !== this.renderToken) {
      this.removeChild(comp);
      return;
    }
    if (this.renderComp) this.removeChild(this.renderComp);
    this.renderComp = comp;
    this.contentEl.empty();
    this.contentEl.appendChild(root);
    const scroll = root.querySelector(".rm-scroll");
    if (scroll && !resetScroll) scroll.scrollTop = oldScroll;
  }

  private renderNoSession(root: HTMLElement) {
    const box = root.createDiv("rm-empty-state");
    box.createEl("h2", { text: "No sessions yet" });
    box.createEl("p", {
      text:
        `Add type: ${this.plugin.settings.sessionType} to a note's properties to make it a session, ` +
        `then give your scene notes type: ${this.plugin.settings.sceneType} and a session property linking to it.`,
    });
  }

  private renderBoard(root: HTMLElement, session: TFile) {
    const fm = fmOf(this.app, session);
    const head = root.createDiv("rm-head");

    const row = head.createDiv("rm-title-row");
    const col = row.createDiv("rm-title-col");
    if (fm.campaign) col.createSpan({ cls: "rm-kicker", text: linkLabel(fm.campaign) });
    col.createEl("h1", { cls: "rm-title", text: displayName(this.app, session) });
    const sw = row.createEl("button", { cls: "rm-icon-btn", attr: { "aria-label": "Switch session" } });
    setIcon(sw, "list");
    sw.onclick = () => new SessionSuggest(this.app, this).open();

    this.renderSearch(head);

    const scenes = this.scenesFor(session).map((f) => ({ f, status: normStatus(fmOf(this.app, f).status) }));
    const filters = head.createDiv("rm-chips");
    const opts: { id: Filter; label: string }[] = [{ id: "all", label: "All" }, ...STATUSES];
    for (const o of opts) {
      const n = o.id === "all" ? scenes.length : scenes.filter((s) => s.status === o.id).length;
      const b = filters.createEl("button", {
        cls: "rm-chip" + (this.st.filter === o.id ? " is-on" : ""),
        text: `${o.label} ${n}`,
        attr: { "aria-pressed": String(this.st.filter === o.id) },
      });
      b.onclick = () => {
        this.st.filter = o.id;
        this.render();
      };
    }

    const scroll = root.createDiv("rm-scroll");
    const list = scroll.createDiv("rm-cards");
    const shown = scenes.filter((s) => this.st.filter === "all" || s.status === this.st.filter);

    if (!scenes.length) {
      list.createEl("p", {
        cls: "rm-empty",
        text:
          "No scenes in this session yet. Give a scene note the properties " +
          `type: ${this.plugin.settings.sceneType} and session: [[${session.basename}]].`,
      });
    } else if (!shown.length) {
      list.createEl("p", { cls: "rm-empty", text: "No scenes with this status." });
    }

    for (const { f, status } of shown) {
      const sfm = fmOf(this.app, f);
      const card = list.createEl("button", { cls: `rm-scene-card is-${status}` });
      const top = card.createDiv("rm-scene-top");
      top.createSpan({ cls: "rm-scene-name", text: displayName(this.app, f) });
      top.createSpan({ cls: `rm-pill is-${status}`, text: STATUSES.find((s) => s.id === status)!.label });
      if (status !== "visited" && sfm.hook) card.createDiv({ cls: "rm-scene-hook", text: String(sfm.hook) });
      const meta: string[] = [];
      const place = sfm.place ?? sfm.location;
      if (place) meta.push(linkLabel(place));
      const leads = asList(sfm.leads).length;
      if (leads) meta.push(`leads to ${leads}`);
      if (meta.length && status !== "visited") card.createDiv({ cls: "rm-scene-meta", text: meta.join(" · ") });
      card.onclick = () => this.openTarget(f);
    }
  }

  private renderSearch(head: HTMLElement) {
    const wrap = head.createDiv("rm-search");
    setIcon(wrap.createSpan("rm-search-icon"), "search");
    const input = wrap.createEl("input", {
      type: "search",
      attr: { placeholder: "Jump to any NPC, place, scene…", "aria-label": "Search notes" },
    });
    const results = head.createDiv("rm-results");

    input.addEventListener("focus", () => (this.searchFocused = true));
    input.addEventListener("blur", () => {
      this.searchFocused = false;
      if (this.dirty) {
        this.dirty = false;
        window.setTimeout(() => this.render(), 300);
      }
    });
    input.addEventListener("input", () => this.fillResults(results, input));
  }

  private fillResults(results: HTMLElement, input: HTMLInputElement) {
    results.empty();
    const q = input.value.trim();
    if (!q) return;
    const match = prepareFuzzySearch(q);
    const hits: { f: TFile; score: number }[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      let best: number | null = null;
      for (const name of [f.basename, displayName(this.app, f), ...aliasesOf(this.app, f)]) {
        const r = match(name);
        if (r && (best === null || r.score > best)) best = r.score;
      }
      if (best !== null) hits.push({ f, score: best });
    }
    hits.sort((a, b) => b.score - a.score);
    for (const { f } of hits.slice(0, 8)) {
      const b = results.createEl("button", { cls: "rm-result" });
      b.createSpan({ cls: "rm-result-name", text: displayName(this.app, f) });
      const t = noteType(this.app, f);
      if (t) b.createSpan({ cls: "rm-result-type", text: t });
      b.onclick = () => {
        input.value = "";
        results.empty();
        input.blur();
        this.openTarget(f);
      };
    }
    if (!hits.length) results.createDiv({ cls: "rm-empty", text: "No matches." });
  }

  private async renderScene(root: HTMLElement, comp: Component, session: TFile, scene: TFile) {
    const s = this.plugin.settings;
    const fm = fmOf(this.app, scene);
    const status = normStatus(fm.status);
    const parsed = await parseNote(this.app, scene);
    const md = (text: string, into: HTMLElement) =>
      MarkdownRenderer.render(this.app, text, into, scene.path, comp);

    const head = root.createDiv("rm-head");
    const back = head.createEl("button", { cls: "rm-back" });
    setIcon(back.createSpan(), "chevron-left");
    back.createSpan({ text: "Board" });
    back.onclick = () => this.toBoard();

    const col = head.createDiv("rm-title-col");
    const place = fm.place ?? fm.location;
    if (place) col.createSpan({ cls: "rm-kicker", text: linkLabel(place) });
    col.createEl("h1", { cls: "rm-title", text: displayName(this.app, scene) });

    const seg = head.createDiv({ cls: "rm-segment", attr: { role: "group", "aria-label": "Scene status" } });
    for (const o of STATUSES) {
      const b = seg.createEl("button", {
        cls: (o.id === status ? "is-on " : "") + `is-${o.id}`,
        text: o.label,
        attr: { "aria-pressed": String(o.id === status) },
      });
      b.onclick = () =>
        this.app.fileManager.processFrontMatter(scene, (f) => {
          f.status = o.id;
        });
    }

    const scroll = root.createDiv("rm-scroll");
    const body = scroll.createDiv("rm-scene-body");
    const used = new Set<Section>();
    const take = (names: string) => {
      const sec = findSection(parsed.sections, names);
      if (sec) used.add(sec);
      return sec;
    };
    const label = (into: HTMLElement, text: string) => into.createSpan({ cls: "rm-label", text });

    if (parsed.preamble) await md(parsed.preamble, body.createDiv("rm-box rm-md"));

    const read = take(s.readAloud);
    if (read?.body) {
      const box = body.createDiv("rm-box rm-readaloud");
      label(box, read.heading);
      await md(read.body, box.createDiv("rm-md"));
    }

    const who = take(s.whoHere);
    if (who?.body) {
      const block = body.createDiv("rm-block");
      label(block, `${who.heading} · tap for card`);
      const chips = block.createDiv("rm-chips");
      for (const line of who.body.split("\n")) {
        if (!line.trim() || /^#+\s/.test(line)) continue;
        const links = linksIn(line);
        if (!links.length) {
          chips.createSpan({ cls: "rm-person is-plain", text: plainLine(line) });
          continue;
        }
        // One link on the line: keep the extra words ("×4", "in stolen cloaks") on the chip.
        const single =
          links.length === 1
            ? plainLine(line.replace(/\[\[([^\]]+)\]\]/, links[0].label))
            : null;
        for (const l of links) {
          const chip = chips.createEl("button", { cls: "rm-person", text: single ?? l.label });
          chip.onclick = () => {
            const f = resolveLink(this.app, l.target, scene.path);
            if (f) this.openTarget(f);
            else new Notice(`No note named "${l.target}" yet.`);
          };
        }
      }
    }

    const find = take(s.toFind);
    if (find?.body) {
      const block = body.createDiv("rm-block");
      label(block, find.heading);
      const tasks = tasksIn(find, parsed.lines);
      if (!tasks.length) await md(find.body, block.createDiv("rm-md"));
      for (const t of tasks) {
        const row = block.createEl("label", { cls: "rm-task" + (t.done ? " is-done" : "") });
        const cb = row.createEl("input", { type: "checkbox" });
        cb.checked = t.done;
        cb.addEventListener("change", () => this.toggleTask(scene, t.line, t.raw, cb.checked));
        await md(t.text, row.createDiv("rm-task-text rm-md"));
      }
    }

    take(s.leads);
    const leads = this.leadsOf(scene, parsed.sections);
    if (leads.length) {
      const block = body.createDiv("rm-block");
      label(block, "Leads to");
      const chips = block.createDiv("rm-chips");
      for (const f of leads) {
        const st = normStatus(fmOf(this.app, f).status);
        const isScene = noteType(this.app, f) === s.sceneType;
        const chip = chips.createEl("button", {
          cls: `rm-lead is-${isScene ? st : "note"}`,
          text: displayName(this.app, f) + (isScene && st === "visited" ? " (visited)" : " →"),
        });
        chip.onclick = () => this.openTarget(f);
      }
    }

    for (const sec of parsed.sections) {
      if (used.has(sec) || !sec.body) continue;
      const det = body.createEl("details", { cls: "rm-more" });
      det.createEl("summary", { text: sec.heading });
      await md(sec.body, det.createDiv("rm-md"));
    }

    if (!parsed.preamble && !parsed.sections.length) {
      body.createEl("p", { cls: "rm-empty", text: "This scene note is empty." });
    }
  }

  private async toggleTask(file: TFile, line: number, raw: string, done: boolean) {
    let missing = false;
    await this.app.vault.process(file, (data) => {
      const lines = data.split("\n");
      const idx = lines[line] === raw ? line : lines.indexOf(raw);
      if (idx < 0) {
        missing = true;
        return data;
      }
      lines[idx] = setTaskDone(lines[idx], done);
      return lines.join("\n");
    });
    if (missing) {
      new Notice("That item changed in the note. Refreshing.");
      this.render();
    }
  }

  // ---------- trackers ----------

  private trackersOf(session: TFile): Tracker[] {
    const raw = fmOf(this.app, session).trackers;
    const out: Tracker[] = [];
    if (Array.isArray(raw)) {
      raw.forEach((t, index) => {
        if (t && typeof t === "object" && "name" in t) {
          const max = Number((t as any).max);
          out.push({ name: String((t as any).name), value: (t as any).value, max: isNaN(max) ? undefined : max, index });
        }
      });
    } else if (raw && typeof raw === "object") {
      for (const [key, value] of Object.entries(raw)) out.push({ name: key, value, key });
    }
    return out;
  }

  private setTracker(session: TFile, t: Tracker, value: unknown) {
    this.app.fileManager.processFrontMatter(session, (fm) => {
      if (Array.isArray(fm.trackers) && t.index !== undefined && fm.trackers[t.index]) {
        fm.trackers[t.index].value = value;
      } else if (fm.trackers && typeof fm.trackers === "object" && t.key !== undefined) {
        fm.trackers[t.key] = value;
      }
    });
  }

  private renderTrackers(root: HTMLElement, session: TFile) {
    const trackers = this.trackersOf(session);
    if (!trackers.length) return;
    const bar = root.createDiv("rm-trackers");
    const row = bar.createDiv("rm-tracker-row");
    for (const t of trackers) {
      const box = row.createDiv("rm-tracker");
      box.createSpan({ cls: "rm-tracker-name", text: t.name });
      const v = t.value;
      if (typeof v === "number") {
        const ctl = box.createDiv("rm-tracker-ctl");
        const minus = ctl.createEl("button", { attr: { "aria-label": `Decrease ${t.name}` } });
        setIcon(minus, "minus");
        ctl.createSpan({ cls: "rm-tracker-value", text: t.max !== undefined ? `${v}/${t.max}` : String(v) });
        const plus = ctl.createEl("button", { attr: { "aria-label": `Increase ${t.name}` } });
        setIcon(plus, "plus");
        const clamp = (n: number) => (t.max !== undefined ? Math.max(0, Math.min(t.max, n)) : n);
        minus.onclick = () => this.setTracker(session, t, clamp(v - 1));
        plus.onclick = () => this.setTracker(session, t, clamp(v + 1));
      } else if (typeof v === "boolean") {
        const b = box.createEl("button", {
          cls: "rm-tracker-toggle" + (v ? " is-on" : ""),
          text: v ? "Yes" : "No",
          attr: { "aria-pressed": String(v) },
        });
        b.onclick = () => this.setTracker(session, t, !v);
      } else {
        box.createSpan({ cls: "rm-tracker-value", text: v === undefined || v === null ? "–" : String(v) });
      }
    }
  }
}

class SessionSuggest extends SuggestModal<TFile> {
  constructor(app: App, private view: RunModeView) {
    super(app);
    this.setPlaceholder("Pick a session");
  }
  getSuggestions(query: string): TFile[] {
    const all = this.view.sessions().reverse();
    const q = query.trim();
    if (!q) return all;
    const match = prepareFuzzySearch(q);
    return all.filter((f) => match(displayName(this.app, f)) || match(f.basename));
  }
  renderSuggestion(f: TFile, el: HTMLElement) {
    el.createDiv({ text: displayName(this.app, f) });
    const st = fmOf(this.app, f).status;
    if (st) el.createEl("small", { text: String(st) });
  }
  onChooseSuggestion(f: TFile) {
    this.view.chooseSession(f);
  }
}
