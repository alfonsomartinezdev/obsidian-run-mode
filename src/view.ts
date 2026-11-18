// The Run mode view: a scene board, and a focused view of one scene.
import {
  App,
  Component,
  ItemView,
  MarkdownRenderer,
  Notice,
  Platform,
  prepareFuzzySearch,
  setIcon,
  SuggestModal,
  TFile,
  TFolder,
  ViewStateResult,
  WorkspaceLeaf,
} from "obsidian";
import type RunModePlugin from "./main";
import { CardModal } from "./card";
import { parseTrackers, Tracker, trackersInSection, TRACKERS_TEMPLATE } from "./trackers";
import { AddClockModal, addTracker, ClockScope, renderTile } from "./clocks";
import { addExample, createFolder, createNote, NameModal, sceneContent, sessionContent } from "./create";
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

function joinPath(...parts: string[]): string {
  return parts.map((p) => p.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}

type Filter = "all" | SceneStatus;

interface RunState {
  campaignPath?: string; // "" = notes not inside a campaign folder
  sessionPath?: string;
  mode: "campaigns" | "board" | "scene";
  scenePath?: string;
  filter: Filter;
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
      if (typeof state.campaignPath === "string") this.st.campaignPath = state.campaignPath;
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
    this.registerDomEvent(window, "resize", () => this.fitAboveToolbar());
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

  private toCampaigns() {
    this.st.mode = "campaigns";
    this.app.workspace.requestSaveLayout();
    this.render(true);
  }

  private chooseCampaign(path: string) {
    this.st.campaignPath = path;
    this.plugin.settings.lastCampaign = path;
    void this.plugin.saveSettings();
    this.st.sessionPath = undefined;
    this.st.mode = "board";
    this.app.workspace.requestSaveLayout();
    this.render(true);
  }

  async chooseSession(file: TFile) {
    this.st.campaignPath = this.campaignOf(file);
    this.plugin.settings.lastCampaign = this.st.campaignPath;
    this.st.sessionPath = file.path;
    this.st.mode = "board";
    this.plugin.settings.lastSession = file.path;
    await this.plugin.saveSettings();
    this.app.workspace.requestSaveLayout();
    this.render(true);
  }

  // ---------- creating notes ----------

  private newCampaign() {
    new NameModal(this.app, "New campaign", "e.g. A Crown of Salt", async (name) => {
      const path = await createFolder(this.app, joinPath(this.campaignsRoot(), name));
      this.chooseCampaign(path);
    }).open();
  }

  private newSession(campaign: string) {
    new NameModal(this.app, "New session", "e.g. Session 8", async (name) => {
      const s = this.plugin.settings;
      const folder = joinPath(campaign, s.sessionFolder);
      const f = await createNote(this.app, folder, name, sessionContent(s.sessionType));
      await this.chooseSession(f);
    }).open();
  }

  private newScene(session: TFile) {
    new NameModal(this.app, "New scene", "e.g. The Tannery", async (name) => {
      const s = this.plugin.settings;
      const folder = joinPath(this.campaignOf(session), s.sceneFolder);
      const f = await createNote(this.app, folder, name, sceneContent(s.sceneType, session.basename));
      new Notice(`Created "${f.basename}". Fill it in, then come back to Run mode.`);
      this.app.workspace.getLeaf("tab").openFile(f);
    }).open();
  }

  private async addExampleCampaign() {
    const f = await addExample(this.app, this.campaignsRoot());
    if (f) window.setTimeout(() => this.chooseSession(f), 300);
  }

  private editNote(file: TFile) {
    this.app.workspace.getLeaf("tab").openFile(file);
  }

  // ---------- data ----------

  private byOrder = (a: TFile, b: TFile) => {
    const oa = Number(fmOf(this.app, a).order);
    const ob = Number(fmOf(this.app, b).order);
    if (!isNaN(oa) && !isNaN(ob) && oa !== ob) return oa - ob;
    return a.basename.localeCompare(b.basename, undefined, { numeric: true });
  };

  /** The campaigns folder, matched without caring about capitals ("campaigns" finds "Campaigns"). */
  private campaignsRoot(): string {
    const wanted = joinPath(this.plugin.settings.campaignsRoot);
    if (!wanted || this.app.vault.getAbstractFileByPath(wanted) instanceof TFolder) return wanted;
    let cur = this.app.vault.getRoot();
    for (const part of wanted.split("/")) {
      const next = cur.children.find(
        (c): c is TFolder => c instanceof TFolder && c.name.toLowerCase() === part.toLowerCase(),
      );
      if (!next) return wanted;
      cur = next;
    }
    return cur.path;
  }

  /** The campaign folder a note lives in, or "" if it isn't inside one. */
  campaignOf(file: TFile): string {
    const root = this.campaignsRoot();
    if (root && !file.path.startsWith(root + "/")) return "";
    const parts = (root ? file.path.slice(root.length + 1) : file.path).split("/");
    if (parts.length < 2) return "";
    return joinPath(root, parts[0]);
  }

  private campaignName(path: string): string {
    return path ? path.split("/").pop()! : "Not in a campaign folder";
  }

  private campaignFolders(): TFolder[] {
    const root = this.campaignsRoot();
    const base = root ? this.app.vault.getAbstractFileByPath(root) : this.app.vault.getRoot();
    if (!(base instanceof TFolder)) return [];
    return base.children
      .filter((c): c is TFolder => c instanceof TFolder && !c.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  private getFile(p?: string): TFile | null {
    const f = p ? this.app.vault.getAbstractFileByPath(p) : null;
    return f instanceof TFile ? f : null;
  }

  /** All session notes, or only those in one campaign. */
  sessions(campaign?: string): TFile[] {
    const t = this.plugin.settings.sessionType;
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => noteType(this.app, f) === t && (campaign === undefined || this.campaignOf(f) === campaign))
      .sort(this.byOrder);
  }

  sessionsHere(): TFile[] {
    return this.sessions(this.st.campaignPath);
  }

  private currentCampaign(): string | null {
    if (this.st.campaignPath !== undefined) return this.st.campaignPath;
    const remembered = this.plugin.settings.lastCampaign;
    if (remembered !== null && (remembered === "" || this.app.vault.getAbstractFileByPath(remembered) instanceof TFolder)) {
      return remembered;
    }
    const last = this.getFile(this.plugin.settings.lastSession);
    if (last) return this.campaignOf(last);
    const found = [...new Set(this.sessions().map((f) => this.campaignOf(f)))];
    return found.length === 1 ? found[0] : null;
  }

  private currentSession(campaign: string): TFile | null {
    const here = (f: TFile | null) => (f && this.campaignOf(f) === campaign ? f : null);
    const chosen = here(this.getFile(this.st.sessionPath)) ?? here(this.getFile(this.plugin.settings.lastSession));
    if (chosen) return chosen;
    const all = this.sessions(campaign);
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

    const campaign = this.st.mode === "campaigns" ? null : this.currentCampaign();
    const session = campaign === null ? null : this.currentSession(campaign);
    if (campaign === null) {
      this.st.mode = "campaigns";
      this.renderCampaigns(root);
    } else if (!session) {
      this.st.campaignPath = campaign;
      this.renderNoSession(root, campaign);
    } else {
      this.st.campaignPath = campaign;
      this.st.sessionPath = session.path;
      if (this.plugin.settings.lastSession !== session.path) {
        this.plugin.settings.lastSession = session.path;
        void this.plugin.saveSettings();
      }
      const sceneFile =
        this.st.mode === "scene" && this.st.scenePath
          ? this.app.vault.getAbstractFileByPath(this.st.scenePath)
          : null;
      const inScene = sceneFile instanceof TFile ? sceneFile : null;
      if (inScene) await this.renderScene(root, comp, session, inScene);
      else {
        this.st.mode = "board";
        this.renderBoard(root, session);
      }
      await this.renderTrackers(root, session, inScene);
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
    this.fitAboveToolbar();
  }

  /**
   * On phones, Obsidian's floating toolbar overlaps the bottom of the view.
   * Measure how much it covers and pad the view so the trackers sit above it.
   */
  private fitAboveToolbar() {
    if (!Platform.isMobile) return;
    window.requestAnimationFrame(() => {
      const view = this.contentEl.querySelector<HTMLElement>(".rm-view");
      if (!view) return;
      const bottom = this.contentEl.getBoundingClientRect().bottom;
      let covered = 0;
      let found = false;
      for (const sel of [".mobile-navbar", ".mobile-toolbar"]) {
        document.querySelectorAll<HTMLElement>(sel).forEach((bar) => {
          found = true;
          const r = bar.getBoundingClientRect();
          if (r.height > 0 && r.top < bottom && getComputedStyle(bar).display !== "none") {
            covered = Math.max(covered, bottom - r.top);
          }
        });
      }
      // If this Obsidian version names its toolbar differently, leave a safe gap on phones.
      if (!found && Platform.isPhone) covered = 80;
      view.style.paddingBottom = covered > 0 ? `${Math.ceil(covered) + 8}px` : "";
    });
  }

  private backToCampaigns(head: HTMLElement) {
    const back = head.createEl("button", { cls: "rm-back" });
    setIcon(back.createSpan(), "chevron-left");
    back.createSpan({ text: "Campaigns" });
    back.onclick = () => this.toCampaigns();
  }

  private renderCampaigns(root: HTMLElement) {
    const head = root.createDiv("rm-head");
    head.createEl("h1", { cls: "rm-title", text: "Campaigns" });

    const counts = new Map<string, number>();
    for (const f of this.sessions()) {
      const c = this.campaignOf(f);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const folders = this.campaignFolders();
    const active = folders.filter((f) => counts.has(f.path));
    const others = folders.filter((f) => !counts.has(f.path));

    const scroll = root.createDiv("rm-scroll");
    const list = scroll.createDiv("rm-cards");
    const card = (path: string, sub: string, dim = false) => {
      const b = list.createEl("button", { cls: "rm-scene-card" + (dim ? " is-visited" : "") });
      b.createDiv({ cls: "rm-scene-name", text: this.campaignName(path) });
      b.createDiv({ cls: "rm-scene-meta", text: sub });
      b.onclick = () => this.chooseCampaign(path);
    };
    const plural = (n: number) => `${n} session${n === 1 ? "" : "s"}`;

    for (const f of active) card(f.path, plural(counts.get(f.path)!));
    if (counts.has("")) card("", plural(counts.get("")!));
    if (!active.length && !counts.has("")) {
      list.createEl("p", { cls: "rm-empty", text: "No sessions yet. Pick a campaign folder below to start one." });
    }
    if (others.length) {
      list.createSpan({ cls: "rm-label rm-section-label", text: "Other folders · tap to start a campaign" });
      for (const f of others) card(f.path, "No sessions yet", true);
    }

    const add = scroll.createDiv("rm-add-row");
    const create = add.createEl("button", { cls: "rm-btn mod-cta" });
    setIcon(create.createSpan(), "plus");
    create.createSpan({ text: "New campaign" });
    create.onclick = () => this.newCampaign();
    const example = add.createEl("button", { cls: "rm-btn", text: "Add example campaign" });
    example.onclick = () => this.addExampleCampaign();
    const folder = this.campaignsRoot();
    add.createEl("p", {
      cls: "rm-empty",
      text: folder
        ? `Showing the folders inside "${folder}". Change this under Settings → Run Mode → Campaigns folder.`
        : "Showing the folders at the top of your vault. Change this under Settings → Run Mode → Campaigns folder.",
    });
  }

  private renderNoSession(root: HTMLElement, campaign: string) {
    const head = root.createDiv("rm-head");
    this.backToCampaigns(head);
    head.createEl("h1", { cls: "rm-title", text: this.campaignName(campaign) });
    const box = root.createDiv("rm-empty-state");
    box.createEl("p", { text: "No sessions in this campaign yet." });
    const actions = box.createDiv("rm-empty-actions");
    const create = actions.createEl("button", { cls: "rm-btn mod-cta", text: "Create a session" });
    create.onclick = () => this.newSession(campaign);
  }

  private renderBoard(root: HTMLElement, session: TFile) {
    const fm = fmOf(this.app, session);
    const head = root.createDiv("rm-head");

    const campaign = this.campaignOf(session);
    const back = head.createEl("button", { cls: "rm-back" });
    setIcon(back.createSpan(), "chevron-left");
    back.createSpan({ text: campaign ? this.campaignName(campaign) : linkLabel(fm.campaign ?? "Campaigns") });
    back.onclick = () => this.toCampaigns();

    const row = head.createDiv("rm-title-row");
    const col = row.createDiv("rm-title-col");
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
      list.createEl("p", { cls: "rm-empty", text: "No scenes in this session yet." });
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

    const add = scroll.createDiv("rm-add-row");
    const newScene = add.createEl("button", { cls: "rm-btn mod-cta" });
    setIcon(newScene.createSpan(), "plus");
    newScene.createSpan({ text: "New scene" });
    newScene.onclick = () => this.newScene(session);
    const newSession = add.createEl("button", { cls: "rm-btn", text: "New session" });
    newSession.onclick = () => this.newSession(campaign);
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
    const nav = head.createDiv("rm-title-row");
    const back = nav.createEl("button", { cls: "rm-back" });
    setIcon(back.createSpan(), "chevron-left");
    back.createSpan({ text: "Board" });
    back.onclick = () => this.toBoard();
    const edit = nav.createEl("button", { cls: "rm-icon-btn", attr: { "aria-label": "Edit this scene's note" } });
    setIcon(edit, "pencil");
    edit.onclick = () => this.editNote(scene);

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
    take(s.clocks);
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

  // ---------- clocks & trackers ----------

  /** Campaign clocks live in one plain note per campaign, e.g. "My Campaign/Trackers.md". */
  private trackersPath(session: TFile): string {
    const name = (this.plugin.settings.trackersNote || "Trackers").replace(/\.md$/i, "");
    return joinPath(this.campaignOf(session), `${name}.md`);
  }

  private async campaignTrackersFile(session: TFile): Promise<TFile> {
    const path = this.trackersPath(session);
    return this.getFile(path) ?? (await this.app.vault.create(path, TRACKERS_TEMPLATE));
  }

  private clockScopes(session: TFile, scene: TFile | null): ClockScope[] {
    const sec = this.plugin.settings.clocks;
    const scopes: ClockScope[] = [];
    if (scene) scopes.push({ label: "Scene", add: (n, k) => addTracker(this.app, scene, n, k, sec) });
    scopes.push({ label: "Session", add: (n, k) => addTracker(this.app, session, n, k, sec) });
    scopes.push({
      label: "Campaign",
      add: async (n, k) => addTracker(this.app, await this.campaignTrackersFile(session), n, k),
    });
    return scopes;
  }

  private async renderTrackers(root: HTMLElement, session: TFile, scene: TFile | null) {
    const sec = this.plugin.settings.clocks;
    const read = (f: TFile) => this.app.vault.cachedRead(f);
    const groups: { label: string; file: TFile; trackers: Tracker[] }[] = [];
    if (scene) groups.push({ label: "Scene", file: scene, trackers: trackersInSection(await read(scene), sec) });
    groups.push({ label: "Session", file: session, trackers: trackersInSection(await read(session), sec) });
    const camp = this.getFile(this.trackersPath(session));
    if (camp) groups.push({ label: "Campaign", file: camp, trackers: parseTrackers(await read(camp)) });

    const bar = root.createDiv("rm-trackers");
    const row = bar.createDiv("rm-tracker-row");
    let total = 0;
    for (const g of groups) {
      if (!g.trackers.length) continue;
      total += g.trackers.length;
      const group = row.createDiv("rm-tile-group");
      group.createSpan({ cls: "rm-tile-group-label", text: g.label });
      const tiles = group.createDiv("rm-tile-row");
      for (const t of g.trackers) {
        renderTile(tiles, t, { app: this.app, file: g.file, onOpenNote: (f) => this.editNote(f) });
      }
    }
    if (!total) row.createSpan({ cls: "rm-empty rm-tracker-empty", text: "No clocks yet." });

    const add = row.createEl("button", { cls: "rm-tracker-edit", attr: { "aria-label": "Add a clock" } });
    setIcon(add, "plus");
    add.onclick = () => new AddClockModal(this.app, this.clockScopes(session, scene)).open();
  }
}

class SessionSuggest extends SuggestModal<TFile> {
  constructor(app: App, private view: RunModeView) {
    super(app);
    this.setPlaceholder("Pick a session");
  }
  getSuggestions(query: string): TFile[] {
    const all = this.view.sessionsHere().reverse();
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
