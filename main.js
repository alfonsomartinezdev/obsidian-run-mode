"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => RunModePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  sceneType: "scene",
  sessionType: "session",
  readAloud: "Read aloud, Boxed text, Description",
  whoHere: "Who's here, NPCs, People",
  toFind: "To find, Clues, Loot",
  leads: "Leads, Leads to, Exits",
  playersKnow: "Players know, Public, What players know",
  dmOnly: "DM only, GM only, Secrets, DM notes",
  campaignsRoot: "Campaigns",
  sessionFolder: "Sessions",
  sceneFolder: "Scenes",
  lastSession: "",
  lastCampaign: null,
  settingsVersion: 2
};
var RunModeSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      text: "Run mode finds notes by the `type` property (or a #scene / #session tag) and reads sections by their heading. Headings accept several names, separated by commas."
    });
    const text = (name, desc, key) => new import_obsidian.Setting(containerEl).setName(name).setDesc(desc).addText(
      (t) => t.setValue(this.plugin.settings[key]).onChange(async (v) => {
        this.plugin.settings[key] = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Note types").setHeading();
    text("Scene type", "Value of `type` on scene notes.", "sceneType");
    text("Session type", "Value of `type` on session notes.", "sessionType");
    new import_obsidian.Setting(containerEl).setName("Campaigns").setHeading();
    text(
      "Campaigns folder",
      "The folder that holds one folder per campaign. Leave empty if your campaign folders are at the top of your vault.",
      "campaignsRoot"
    );
    text("New session folder", "Inside each campaign folder.", "sessionFolder");
    text("New scene folder", "Inside each campaign folder.", "sceneFolder");
    new import_obsidian.Setting(containerEl).setName("Scene headings").setHeading();
    text("Read aloud", "Shown first, in a highlighted box.", "readAloud");
    text("Who's here", "Each linked name becomes a tappable chip.", "whoHere");
    text("To find", "Checklist items you can tick off at the table.", "toFind");
    text("Leads", "Links here are added to the scene's leads.", "leads");
    new import_obsidian.Setting(containerEl).setName("Character card headings").setHeading();
    text("Players know", "Shown in the blue box.", "playersKnow");
    text("DM only", "Shown in the amber box.", "dmOnly");
  }
};

// src/view.ts
var import_obsidian4 = require("obsidian");

// src/card.ts
var import_obsidian2 = require("obsidian");

// src/notes.ts
var STATUSES = [
  { id: "unvisited", label: "Unvisited" },
  { id: "in-play", label: "In play" },
  { id: "visited", label: "Visited" }
];
function normStatus(v) {
  const s = String(v != null ? v : "").toLowerCase().trim().replace(/[\s_]+/g, "-");
  if (["in-play", "inplay", "playing", "current", "active", "now"].includes(s)) return "in-play";
  if (["visited", "done", "played", "complete", "completed", "skipped", "cut"].includes(s)) return "visited";
  return "unvisited";
}
function asList(v) {
  if (v === null || v === void 0 || v === "") return [];
  return Array.isArray(v) ? v : [v];
}
function fmOf(app, file) {
  var _a, _b;
  return (_b = (_a = app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {};
}
function noteType(app, file) {
  const fm = fmOf(app, file);
  if (fm.type) return String(fm.type).toLowerCase().trim();
  const tags = asList(fm.tags).map((t) => String(t).toLowerCase().replace(/^#/, ""));
  for (const t of ["scene", "session"]) if (tags.includes(t)) return t;
  return "";
}
function parseLink(raw) {
  let s = String(raw).trim();
  const m = s.match(/^\[\[([\s\S]*)\]\]$/);
  if (m) s = m[1];
  const [t, alias] = s.split("|");
  return { target: (t != null ? t : "").split("#")[0].trim(), alias: (alias == null ? void 0 : alias.trim()) || void 0 };
}
function resolveLink(app, raw, sourcePath) {
  const { target } = parseLink(raw);
  if (!target) return null;
  return app.metadataCache.getFirstLinkpathDest(target, sourcePath);
}
function linkLabel(raw) {
  const { target, alias } = parseLink(String(raw != null ? raw : ""));
  return alias != null ? alias : target;
}
function displayName(app, file) {
  const fm = fmOf(app, file);
  return fm.title ? String(fm.title) : file.basename;
}
function aliasesOf(app, file) {
  const fm = fmOf(app, file);
  return [...asList(fm.aliases), ...asList(fm.alias)].map(String);
}
async function parseNote(app, file) {
  var _a;
  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");
  const cache = app.metadataCache.getFileCache(file);
  const bodyStart = (cache == null ? void 0 : cache.frontmatterPosition) ? cache.frontmatterPosition.end.line + 1 : 0;
  const headings = ((_a = cache == null ? void 0 : cache.headings) != null ? _a : []).filter((h) => h.position.start.line >= bodyStart);
  const top = headings.length ? Math.min(...headings.map((h) => h.level)) : 0;
  const primary = headings.filter((h) => h.level === top);
  const sections = primary.map((h, i) => {
    const line = h.position.start.line;
    const end = i + 1 < primary.length ? primary[i + 1].position.start.line : lines.length;
    return { heading: h.heading.trim(), line, end, body: lines.slice(line + 1, end).join("\n").trim() };
  });
  const firstHeading = primary.length ? primary[0].position.start.line : lines.length;
  const preamble = lines.slice(bodyStart, firstHeading).join("\n").trim();
  return { lines, preamble, sections };
}
function norm(s) {
  return s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[:.]+$/, "").replace(/\s+/g, " ").trim();
}
function findSection(sections, names) {
  const wanted = names.split(",").map(norm).filter(Boolean);
  return sections.find((s) => wanted.includes(norm(s.heading)));
}
function linksIn(text) {
  var _a;
  const out = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while (m = re.exec(text)) {
    const { target, alias } = parseLink(m[1]);
    if (target) out.push({ target, label: (_a = alias != null ? alias : target.split("/").pop()) != null ? _a : target });
  }
  return out;
}
var TASK_RE = /^\s*[-*+]\s+\[([^\]])\]\s?(.*)$/;
function tasksIn(section, lines) {
  const out = [];
  for (let i = section.line + 1; i < section.end; i++) {
    const m = lines[i].match(TASK_RE);
    if (m) out.push({ line: i, raw: lines[i], done: m[1] !== " ", text: m[2].trim() });
  }
  return out;
}
function setTaskDone(line, done) {
  return line.replace(/^(\s*[-*+]\s+\[)[^\]](\])/, `$1${done ? "x" : " "}$2`);
}
function plainLine(line) {
  return line.replace(/^\s*([-*+]|\d+\.)\s+/, "").replace(/\*\*|__|\*|_/g, "").trim();
}

// src/card.ts
var CardModal = class extends import_obsidian2.Modal {
  constructor(app, plugin, file, openTarget) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.openTarget = openTarget;
    this.comp = new import_obsidian2.Component();
  }
  async onOpen() {
    var _a, _b;
    this.comp.load();
    this.modalEl.addClass("rm-card-modal");
    if (import_obsidian2.Platform.isMobile) this.modalEl.addClass("rm-sheet");
    const el = this.contentEl;
    el.empty();
    el.addClass("rm-card");
    const s = this.plugin.settings;
    const fm = fmOf(this.app, this.file);
    const md = (text, into) => import_obsidian2.MarkdownRenderer.render(this.app, text, into, this.file.path, this.comp);
    const head = el.createDiv("rm-card-head");
    const kicker = [fm.type, fm.role].filter(Boolean).map(String).join(" \xB7 ");
    if (kicker) head.createSpan({ cls: "rm-kicker rm-accent", text: kicker });
    head.createEl("h2", { cls: "rm-card-title", text: displayName(this.app, this.file) });
    const tagline = (_b = (_a = fm.tagline) != null ? _a : fm.summary) != null ? _b : fm.description;
    if (tagline) head.createSpan({ cls: "rm-card-tagline", text: String(tagline) });
    const parsed = await parseNote(this.app, this.file);
    const pk = findSection(parsed.sections, s.playersKnow);
    const dm = findSection(parsed.sections, s.dmOnly);
    const used = new Set([pk, dm].filter((x) => !!x));
    if (parsed.preamble) await md(parsed.preamble, el.createDiv("rm-box rm-md"));
    for (const [sec, cls, label] of [
      [pk, "rm-pk", "Players know"],
      [dm, "rm-dm", "DM only"]
    ]) {
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
    const open = actions.createEl("button", { cls: "rm-btn", text: "Open full note" });
    open.onclick = () => {
      this.close();
      this.app.workspace.getLeaf("tab").openFile(this.file);
    };
    el.addEventListener(
      "click",
      (e) => {
        var _a2, _b2;
        const a = e.target.closest("a.internal-link");
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        const href = (_b2 = (_a2 = a.getAttribute("data-href")) != null ? _a2 : a.getAttribute("href")) != null ? _b2 : "";
        const target = resolveLink(this.app, href, this.file.path);
        if (!target) return void new import_obsidian2.Notice(`No note named "${href}" yet.`);
        this.close();
        this.openTarget(target);
      },
      true
    );
  }
  onClose() {
    this.comp.unload();
    this.contentEl.empty();
  }
};

// src/create.ts
var import_obsidian3 = require("obsidian");

// src/examples.ts
var EXAMPLE_NOTES = [
  {
    "path": "Run Mode Example/Sessions/Example Session.md",
    "content": '---\ntype: session\ncampaign: "[[A Crown of Salt]]"\nstatus: next\ntrackers:\n  - name: Guild rep\n    value: 3\n  - name: Alarm\n    value: 2\n    max: 6\n  - name: Ledger found\n    value: false\n---\nPrep for the night. Scenes join this session by linking back to it in their `session` property.\n'
  },
  {
    "path": "Run Mode Example/Scenes/Ambush on Rope Street.md",
    "content": `---
type: scene
session: "[[Example Session]]"
status: unvisited
place: Anywhere
hook: Drop this in whenever the party gets too loud.
---
## Who's here
- [[Hollow Chorister]] \xD72, in stolen guild cloaks

## To find
- [ ] Guild token on one of the bodies
`
  },
  {
    "path": "Run Mode Example/Scenes/Chapel Undercroft.md",
    "content": `---
type: scene
session: "[[Example Session]]"
status: unvisited
place: Old town
hook: The Hollow Choir sings below the altar.
---
## Read aloud
Every candle gutters toward the sound, pointing the way down.

## Who's here
- [[Hollow Chorister]] \xD74

## How this could go
- They shatter the circle by force, and the song turns on them.
- They join in, sing the wrong verse on purpose, and unmake it from inside.
- They're too slow; the hymn lands, and something answers from below.
`
  },
  {
    "path": "Run Mode Example/Scenes/Harbourmaster's Office.md",
    "content": `---
type: scene
session: "[[Example Session]]"
status: unvisited
place: Docks district
hook: Captain Holt will trade manifests for a favour.
leads:
  - "[[Chapel Undercroft]]"
---
## Read aloud
Ledgers to the ceiling, a window over the harbour, and a captain who hasn't slept.

## Who's here
- [[Captain Veyra Holt]]

## To find
- [ ] Manifest naming the chapel as a delivery address
`
  },
  {
    "path": "Run Mode Example/Scenes/The Tannery.md",
    "content": `---
type: scene
session: "[[Example Session]]"
status: in-play
place: Docks district
hook: The smuggler's ledger is hidden in a vat nobody will touch.
leads:
  - "[[Harbourmaster's Office]]"
  - "[[Ambush on Rope Street]]"
---
## Read aloud
The stink hits before the door does. Six vats steam in the yard; one is covered with a tarp and chained.

## Who's here
- [[Old Marra]]
- 2 dockhands, bored and armed with hooks

## To find
- [ ] Chain key on Marra's belt
- [ ] The ledger, under the tarp

## If it goes sideways
Marra shouts for the dockhands. If the party threatens the vats, she folds and bargains instead.
`
  },
  {
    "path": "Run Mode Example/Characters/Captain Veyra Holt.md",
    "content": "---\ntype: NPC\nrole: Harbourmaster\ntagline: Keeps Saltreach fed through the winter, whatever the guild says.\n---\n## Players know\nRuns the harbour. Owes nobody, or so she says.\n\n## DM only\nShe owes [[the Tidewardens]] more than she'll admit. If the party pushes, she'll trade the manifest for help with them.\n"
  },
  {
    "path": "Run Mode Example/Characters/Hollow Chorister.md",
    "content": "---\ntype: monster\ntagline: Robed figures singing in a voice with no mouth.\nstats:\n  AC: 13\n  HP: 18\n  Speed: 30 ft\n---\n## Players know\nThey don't stop singing, even when struck.\n\n## DM only\nHarmonize: 2d6 psychic damage to everyone who can hear, once per round while three or more are alive.\n"
  },
  {
    "path": "Run Mode Example/Characters/Old Marra.md",
    "content": "---\ntype: NPC\nrole: Tannery owner\ntagline: Gravel voice, stained forearms, never sits down.\nstats:\n  AC: 11\n  HP: 9\n  Attitude: Wary\n---\n## Players know\nRuns the tannery and has for thirty years. Hates the guild's tax men. Pays dockhands in cash.\n\n## DM only\nHid the ledger for the smugglers, who hold her grandson's debt. Folds if the party offers to clear it.\n"
  }
];

// src/create.ts
var NameModal = class extends import_obsidian3.Modal {
  constructor(app, heading, placeholder, onSubmit) {
    super(app);
    this.heading = heading;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    this.modalEl.addClass("rm-name-modal");
    const el = this.contentEl;
    el.createEl("h3", { text: this.heading });
    const form = el.createEl("form", { cls: "rm-name-form" });
    const input = form.createEl("input", { type: "text", attr: { placeholder: this.placeholder } });
    const btn = form.createEl("button", { cls: "mod-cta", text: "Create", attr: { type: "submit" } });
    btn.style.minHeight = "44px";
    form.onsubmit = (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/[\\/:*?"<>|#^[\]]/g, "");
      if (!name) return;
      this.close();
      this.onSubmit(name);
    };
    window.setTimeout(() => input.focus(), 50);
  }
  onClose() {
    this.contentEl.empty();
  }
};
async function ensureFolder(app, path) {
  const parts = (0, import_obsidian3.normalizePath)(path).split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    const existing = app.vault.getAbstractFileByPath(cur);
    if (!existing) await app.vault.createFolder(cur);
    else if (!(existing instanceof import_obsidian3.TFolder)) throw new Error(`"${cur}" is a file, not a folder.`);
  }
}
async function createFolder(app, path) {
  const p = (0, import_obsidian3.normalizePath)(path);
  if (app.vault.getAbstractFileByPath(p)) {
    new import_obsidian3.Notice(`"${p}" already exists. Opening it.`);
  } else {
    await ensureFolder(app, p);
  }
  return p;
}
async function createNote(app, folder, name, content) {
  const dir = (0, import_obsidian3.normalizePath)(folder || "/");
  if (dir !== "/") await ensureFolder(app, dir);
  const prefix = dir === "/" ? "" : `${dir}/`;
  let path = (0, import_obsidian3.normalizePath)(`${prefix}${name}.md`);
  for (let i = 2; app.vault.getAbstractFileByPath(path); i++) {
    path = (0, import_obsidian3.normalizePath)(`${prefix}${name} ${i}.md`);
  }
  return app.vault.create(path, content);
}
function sessionContent(sessionType) {
  return [
    "---",
    `type: ${sessionType}`,
    "status: next",
    "trackers:",
    "  - name: Clock",
    "    value: 0",
    "    max: 6",
    "---",
    ""
  ].join("\n");
}
function sceneContent(sceneType, sessionName) {
  return [
    "---",
    `type: ${sceneType}`,
    `session: "[[${sessionName}]]"`,
    "status: unvisited",
    "place: ",
    "hook: ",
    "leads: []",
    "---",
    "## Read aloud",
    "",
    "",
    "## Who's here",
    "- ",
    "",
    "## To find",
    "- [ ] ",
    ""
  ].join("\n");
}
async function addExample(app, root) {
  let session = null;
  let skipped = 0;
  for (const note of EXAMPLE_NOTES) {
    const n = { ...note, path: (0, import_obsidian3.normalizePath)(root ? `${root}/${note.path}` : note.path) };
    const existing = app.vault.getAbstractFileByPath(n.path);
    if (existing instanceof import_obsidian3.TFile) {
      skipped++;
      if (n.path.endsWith("Example Session.md")) session = existing;
      continue;
    }
    await ensureFolder(app, n.path.split("/").slice(0, -1).join("/"));
    const f = await app.vault.create(n.path, n.content);
    if (n.path.endsWith("Example Session.md")) session = f;
  }
  new import_obsidian3.Notice(
    skipped === EXAMPLE_NOTES.length ? "The example campaign is already in your vault." : 'Added an example campaign in the "Run Mode Example" folder. Delete it whenever you like.'
  );
  return session;
}

// src/view.ts
var VIEW_TYPE = "run-mode-view";
function joinPath(...parts) {
  return parts.map((p) => p.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}
var RunModeView = class extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.st = { mode: "board", filter: "all" };
    this.renderComp = null;
    this.renderToken = 0;
    this.timer = null;
    this.searchFocused = false;
    this.dirty = false;
    // ---------- data ----------
    this.byOrder = (a, b) => {
      const oa = Number(fmOf(this.app, a).order);
      const ob = Number(fmOf(this.app, b).order);
      if (!isNaN(oa) && !isNaN(ob) && oa !== ob) return oa - ob;
      return a.basename.localeCompare(b.basename, void 0, { numeric: true });
    };
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
  getState() {
    return { ...super.getState(), ...this.st };
  }
  async setState(state, result) {
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
    await this.render();
  }
  async onClose() {
    if (this.timer) window.clearTimeout(this.timer);
  }
  // ---------- navigation ----------
  schedule() {
    if (this.searchFocused) {
      this.dirty = true;
      return;
    }
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), 200);
  }
  onLinkClick(e) {
    var _a, _b;
    const a = e.target.closest("a.internal-link");
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const href = (_b = (_a = a.getAttribute("data-href")) != null ? _a : a.getAttribute("href")) != null ? _b : "";
    const src = this.st.mode === "scene" && this.st.scenePath || this.st.sessionPath || "";
    const f = resolveLink(this.app, href, src);
    if (f) this.openTarget(f);
    else new import_obsidian4.Notice(`No note named "${href}" yet.`);
  }
  openTarget(file) {
    if (noteType(this.app, file) === this.plugin.settings.sceneType) {
      this.st.mode = "scene";
      this.st.scenePath = file.path;
      this.app.workspace.requestSaveLayout();
      this.render(true);
    } else {
      new CardModal(this.app, this.plugin, file, (f) => this.openTarget(f)).open();
    }
  }
  toBoard() {
    this.st.mode = "board";
    this.app.workspace.requestSaveLayout();
    this.render(true);
  }
  toCampaigns() {
    this.st.mode = "campaigns";
    this.app.workspace.requestSaveLayout();
    this.render(true);
  }
  chooseCampaign(path) {
    this.st.campaignPath = path;
    this.plugin.settings.lastCampaign = path;
    void this.plugin.saveSettings();
    this.st.sessionPath = void 0;
    this.st.mode = "board";
    this.app.workspace.requestSaveLayout();
    this.render(true);
  }
  async chooseSession(file) {
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
  newCampaign() {
    new NameModal(this.app, "New campaign", "e.g. A Crown of Salt", async (name) => {
      const path = await createFolder(this.app, joinPath(this.campaignsRoot(), name));
      this.chooseCampaign(path);
    }).open();
  }
  newSession(campaign) {
    new NameModal(this.app, "New session", "e.g. Session 8", async (name) => {
      const s = this.plugin.settings;
      const folder = joinPath(campaign, s.sessionFolder);
      const f = await createNote(this.app, folder, name, sessionContent(s.sessionType));
      await this.chooseSession(f);
    }).open();
  }
  newScene(session) {
    new NameModal(this.app, "New scene", "e.g. The Tannery", async (name) => {
      const s = this.plugin.settings;
      const folder = joinPath(this.campaignOf(session), s.sceneFolder);
      const f = await createNote(this.app, folder, name, sceneContent(s.sceneType, session.basename));
      new import_obsidian4.Notice(`Created "${f.basename}". Fill it in, then come back to Run mode.`);
      this.app.workspace.getLeaf("tab").openFile(f);
    }).open();
  }
  async addExampleCampaign() {
    const f = await addExample(this.app, this.campaignsRoot());
    if (f) window.setTimeout(() => this.chooseSession(f), 300);
  }
  editNote(file) {
    this.app.workspace.getLeaf("tab").openFile(file);
  }
  /** The campaigns folder, matched without caring about capitals ("campaigns" finds "Campaigns"). */
  campaignsRoot() {
    const wanted = joinPath(this.plugin.settings.campaignsRoot);
    if (!wanted || this.app.vault.getAbstractFileByPath(wanted) instanceof import_obsidian4.TFolder) return wanted;
    let cur = this.app.vault.getRoot();
    for (const part of wanted.split("/")) {
      const next = cur.children.find(
        (c) => c instanceof import_obsidian4.TFolder && c.name.toLowerCase() === part.toLowerCase()
      );
      if (!next) return wanted;
      cur = next;
    }
    return cur.path;
  }
  /** The campaign folder a note lives in, or "" if it isn't inside one. */
  campaignOf(file) {
    const root = this.campaignsRoot();
    if (root && !file.path.startsWith(root + "/")) return "";
    const parts = (root ? file.path.slice(root.length + 1) : file.path).split("/");
    if (parts.length < 2) return "";
    return joinPath(root, parts[0]);
  }
  campaignName(path) {
    return path ? path.split("/").pop() : "Not in a campaign folder";
  }
  campaignFolders() {
    const root = this.campaignsRoot();
    const base = root ? this.app.vault.getAbstractFileByPath(root) : this.app.vault.getRoot();
    if (!(base instanceof import_obsidian4.TFolder)) return [];
    return base.children.filter((c) => c instanceof import_obsidian4.TFolder && !c.name.startsWith(".")).sort((a, b) => a.name.localeCompare(b.name, void 0, { numeric: true }));
  }
  getFile(p) {
    const f = p ? this.app.vault.getAbstractFileByPath(p) : null;
    return f instanceof import_obsidian4.TFile ? f : null;
  }
  /** All session notes, or only those in one campaign. */
  sessions(campaign) {
    const t = this.plugin.settings.sessionType;
    return this.app.vault.getMarkdownFiles().filter((f) => noteType(this.app, f) === t && (campaign === void 0 || this.campaignOf(f) === campaign)).sort(this.byOrder);
  }
  sessionsHere() {
    return this.sessions(this.st.campaignPath);
  }
  currentCampaign() {
    if (this.st.campaignPath !== void 0) return this.st.campaignPath;
    const remembered = this.plugin.settings.lastCampaign;
    if (remembered !== null && (remembered === "" || this.app.vault.getAbstractFileByPath(remembered) instanceof import_obsidian4.TFolder)) {
      return remembered;
    }
    const last = this.getFile(this.plugin.settings.lastSession);
    if (last) return this.campaignOf(last);
    const found = [...new Set(this.sessions().map((f) => this.campaignOf(f)))];
    return found.length === 1 ? found[0] : null;
  }
  currentSession(campaign) {
    var _a, _b;
    const here = (f) => f && this.campaignOf(f) === campaign ? f : null;
    const chosen = (_a = here(this.getFile(this.st.sessionPath))) != null ? _a : here(this.getFile(this.plugin.settings.lastSession));
    if (chosen) return chosen;
    const all = this.sessions(campaign);
    const next = all.find(
      (f) => {
        var _a2;
        return ["next", "current", "in-play", "playing", "now"].includes(
          String((_a2 = fmOf(this.app, f).status) != null ? _a2 : "").toLowerCase().trim().replace(/\s+/g, "-")
        );
      }
    );
    return (_b = next != null ? next : all[all.length - 1]) != null ? _b : null;
  }
  scenesFor(session) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const raw of asList(fmOf(this.app, session).scenes)) {
      const f = resolveLink(this.app, String(raw), session.path);
      if (f && !seen.has(f.path)) {
        seen.add(f.path);
        out.push(f);
      }
    }
    const t = this.plugin.settings.sceneType;
    const rest = this.app.vault.getMarkdownFiles().filter(
      (f) => !seen.has(f.path) && noteType(this.app, f) === t && asList(fmOf(this.app, f).session).some(
        (r) => {
          var _a;
          return ((_a = resolveLink(this.app, String(r), f.path)) == null ? void 0 : _a.path) === session.path;
        }
      )
    ).sort(this.byOrder);
    return [...out, ...rest];
  }
  leadsOf(scene, sections) {
    const raws = asList(fmOf(this.app, scene).leads).map(String);
    const sec = findSection(sections, this.plugin.settings.leads);
    if (sec) raws.push(...linksIn(sec.body).map((l) => l.target));
    const out = [];
    for (const r of raws) {
      const f = resolveLink(this.app, r, scene.path);
      if (f && !out.includes(f)) out.push(f);
    }
    return out;
  }
  // ---------- rendering ----------
  async render(resetScroll = false) {
    var _a, _b;
    const token = ++this.renderToken;
    const comp = new import_obsidian4.Component();
    this.addChild(comp);
    const root = createDiv({ cls: "rm-view" });
    const oldScroll = (_b = (_a = this.contentEl.querySelector(".rm-scroll")) == null ? void 0 : _a.scrollTop) != null ? _b : 0;
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
      const sceneFile = this.st.mode === "scene" && this.st.scenePath ? this.app.vault.getAbstractFileByPath(this.st.scenePath) : null;
      if (sceneFile instanceof import_obsidian4.TFile) await this.renderScene(root, comp, session, sceneFile);
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
  backToCampaigns(head) {
    const back = head.createEl("button", { cls: "rm-back" });
    (0, import_obsidian4.setIcon)(back.createSpan(), "chevron-left");
    back.createSpan({ text: "Campaigns" });
    back.onclick = () => this.toCampaigns();
  }
  renderCampaigns(root) {
    var _a;
    const head = root.createDiv("rm-head");
    head.createEl("h1", { cls: "rm-title", text: "Campaigns" });
    const counts = /* @__PURE__ */ new Map();
    for (const f of this.sessions()) {
      const c = this.campaignOf(f);
      counts.set(c, ((_a = counts.get(c)) != null ? _a : 0) + 1);
    }
    const folders = this.campaignFolders();
    const active = folders.filter((f) => counts.has(f.path));
    const others = folders.filter((f) => !counts.has(f.path));
    const scroll = root.createDiv("rm-scroll");
    const list = scroll.createDiv("rm-cards");
    const card = (path, sub, dim = false) => {
      const b = list.createEl("button", { cls: "rm-scene-card" + (dim ? " is-visited" : "") });
      b.createDiv({ cls: "rm-scene-name", text: this.campaignName(path) });
      b.createDiv({ cls: "rm-scene-meta", text: sub });
      b.onclick = () => this.chooseCampaign(path);
    };
    const plural = (n) => `${n} session${n === 1 ? "" : "s"}`;
    for (const f of active) card(f.path, plural(counts.get(f.path)));
    if (counts.has("")) card("", plural(counts.get("")));
    if (!active.length && !counts.has("")) {
      list.createEl("p", { cls: "rm-empty", text: "No sessions yet. Pick a campaign folder below to start one." });
    }
    if (others.length) {
      list.createSpan({ cls: "rm-label rm-section-label", text: "Other folders \xB7 tap to start a campaign" });
      for (const f of others) card(f.path, "No sessions yet", true);
    }
    const add = scroll.createDiv("rm-add-row");
    const create = add.createEl("button", { cls: "rm-btn mod-cta" });
    (0, import_obsidian4.setIcon)(create.createSpan(), "plus");
    create.createSpan({ text: "New campaign" });
    create.onclick = () => this.newCampaign();
    const example = add.createEl("button", { cls: "rm-btn", text: "Add example campaign" });
    example.onclick = () => this.addExampleCampaign();
    const folder = this.campaignsRoot();
    add.createEl("p", {
      cls: "rm-empty",
      text: folder ? `Showing the folders inside "${folder}". Change this under Settings \u2192 Run Mode \u2192 Campaigns folder.` : "Showing the folders at the top of your vault. Change this under Settings \u2192 Run Mode \u2192 Campaigns folder."
    });
  }
  renderNoSession(root, campaign) {
    const head = root.createDiv("rm-head");
    this.backToCampaigns(head);
    head.createEl("h1", { cls: "rm-title", text: this.campaignName(campaign) });
    const box = root.createDiv("rm-empty-state");
    box.createEl("p", { text: "No sessions in this campaign yet." });
    const actions = box.createDiv("rm-empty-actions");
    const create = actions.createEl("button", { cls: "rm-btn mod-cta", text: "Create a session" });
    create.onclick = () => this.newSession(campaign);
  }
  renderBoard(root, session) {
    var _a, _b;
    const fm = fmOf(this.app, session);
    const head = root.createDiv("rm-head");
    const campaign = this.campaignOf(session);
    const back = head.createEl("button", { cls: "rm-back" });
    (0, import_obsidian4.setIcon)(back.createSpan(), "chevron-left");
    back.createSpan({ text: campaign ? this.campaignName(campaign) : linkLabel((_a = fm.campaign) != null ? _a : "Campaigns") });
    back.onclick = () => this.toCampaigns();
    const row = head.createDiv("rm-title-row");
    const col = row.createDiv("rm-title-col");
    col.createEl("h1", { cls: "rm-title", text: displayName(this.app, session) });
    const sw = row.createEl("button", { cls: "rm-icon-btn", attr: { "aria-label": "Switch session" } });
    (0, import_obsidian4.setIcon)(sw, "list");
    sw.onclick = () => new SessionSuggest(this.app, this).open();
    this.renderSearch(head);
    const scenes = this.scenesFor(session).map((f) => ({ f, status: normStatus(fmOf(this.app, f).status) }));
    const filters = head.createDiv("rm-chips");
    const opts = [{ id: "all", label: "All" }, ...STATUSES];
    for (const o of opts) {
      const n = o.id === "all" ? scenes.length : scenes.filter((s) => s.status === o.id).length;
      const b = filters.createEl("button", {
        cls: "rm-chip" + (this.st.filter === o.id ? " is-on" : ""),
        text: `${o.label} ${n}`,
        attr: { "aria-pressed": String(this.st.filter === o.id) }
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
      top.createSpan({ cls: `rm-pill is-${status}`, text: STATUSES.find((s) => s.id === status).label });
      if (status !== "visited" && sfm.hook) card.createDiv({ cls: "rm-scene-hook", text: String(sfm.hook) });
      const meta = [];
      const place = (_b = sfm.place) != null ? _b : sfm.location;
      if (place) meta.push(linkLabel(place));
      const leads = asList(sfm.leads).length;
      if (leads) meta.push(`leads to ${leads}`);
      if (meta.length && status !== "visited") card.createDiv({ cls: "rm-scene-meta", text: meta.join(" \xB7 ") });
      card.onclick = () => this.openTarget(f);
    }
    const add = scroll.createDiv("rm-add-row");
    const newScene = add.createEl("button", { cls: "rm-btn mod-cta" });
    (0, import_obsidian4.setIcon)(newScene.createSpan(), "plus");
    newScene.createSpan({ text: "New scene" });
    newScene.onclick = () => this.newScene(session);
    const newSession = add.createEl("button", { cls: "rm-btn", text: "New session" });
    newSession.onclick = () => this.newSession(campaign);
  }
  renderSearch(head) {
    const wrap = head.createDiv("rm-search");
    (0, import_obsidian4.setIcon)(wrap.createSpan("rm-search-icon"), "search");
    const input = wrap.createEl("input", {
      type: "search",
      attr: { placeholder: "Jump to any NPC, place, scene\u2026", "aria-label": "Search notes" }
    });
    const results = head.createDiv("rm-results");
    input.addEventListener("focus", () => this.searchFocused = true);
    input.addEventListener("blur", () => {
      this.searchFocused = false;
      if (this.dirty) {
        this.dirty = false;
        window.setTimeout(() => this.render(), 300);
      }
    });
    input.addEventListener("input", () => this.fillResults(results, input));
  }
  fillResults(results, input) {
    results.empty();
    const q = input.value.trim();
    if (!q) return;
    const match = (0, import_obsidian4.prepareFuzzySearch)(q);
    const hits = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      let best = null;
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
  async renderScene(root, comp, session, scene) {
    var _a;
    const s = this.plugin.settings;
    const fm = fmOf(this.app, scene);
    const status = normStatus(fm.status);
    const parsed = await parseNote(this.app, scene);
    const md = (text, into) => import_obsidian4.MarkdownRenderer.render(this.app, text, into, scene.path, comp);
    const head = root.createDiv("rm-head");
    const nav = head.createDiv("rm-title-row");
    const back = nav.createEl("button", { cls: "rm-back" });
    (0, import_obsidian4.setIcon)(back.createSpan(), "chevron-left");
    back.createSpan({ text: "Board" });
    back.onclick = () => this.toBoard();
    const edit = nav.createEl("button", { cls: "rm-icon-btn", attr: { "aria-label": "Edit this scene's note" } });
    (0, import_obsidian4.setIcon)(edit, "pencil");
    edit.onclick = () => this.editNote(scene);
    const col = head.createDiv("rm-title-col");
    const place = (_a = fm.place) != null ? _a : fm.location;
    if (place) col.createSpan({ cls: "rm-kicker", text: linkLabel(place) });
    col.createEl("h1", { cls: "rm-title", text: displayName(this.app, scene) });
    const seg = head.createDiv({ cls: "rm-segment", attr: { role: "group", "aria-label": "Scene status" } });
    for (const o of STATUSES) {
      const b = seg.createEl("button", {
        cls: (o.id === status ? "is-on " : "") + `is-${o.id}`,
        text: o.label,
        attr: { "aria-pressed": String(o.id === status) }
      });
      b.onclick = () => this.app.fileManager.processFrontMatter(scene, (f) => {
        f.status = o.id;
      });
    }
    const scroll = root.createDiv("rm-scroll");
    const body = scroll.createDiv("rm-scene-body");
    const used = /* @__PURE__ */ new Set();
    const take = (names) => {
      const sec = findSection(parsed.sections, names);
      if (sec) used.add(sec);
      return sec;
    };
    const label = (into, text) => into.createSpan({ cls: "rm-label", text });
    if (parsed.preamble) await md(parsed.preamble, body.createDiv("rm-box rm-md"));
    const read = take(s.readAloud);
    if (read == null ? void 0 : read.body) {
      const box = body.createDiv("rm-box rm-readaloud");
      label(box, read.heading);
      await md(read.body, box.createDiv("rm-md"));
    }
    const who = take(s.whoHere);
    if (who == null ? void 0 : who.body) {
      const block = body.createDiv("rm-block");
      label(block, `${who.heading} \xB7 tap for card`);
      const chips = block.createDiv("rm-chips");
      for (const line of who.body.split("\n")) {
        if (!line.trim() || /^#+\s/.test(line)) continue;
        const links = linksIn(line);
        if (!links.length) {
          chips.createSpan({ cls: "rm-person is-plain", text: plainLine(line) });
          continue;
        }
        const single = links.length === 1 ? plainLine(line.replace(/\[\[([^\]]+)\]\]/, links[0].label)) : null;
        for (const l of links) {
          const chip = chips.createEl("button", { cls: "rm-person", text: single != null ? single : l.label });
          chip.onclick = () => {
            const f = resolveLink(this.app, l.target, scene.path);
            if (f) this.openTarget(f);
            else new import_obsidian4.Notice(`No note named "${l.target}" yet.`);
          };
        }
      }
    }
    const find = take(s.toFind);
    if (find == null ? void 0 : find.body) {
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
          text: displayName(this.app, f) + (isScene && st === "visited" ? " (visited)" : " \u2192")
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
  async toggleTask(file, line, raw, done) {
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
      new import_obsidian4.Notice("That item changed in the note. Refreshing.");
      this.render();
    }
  }
  // ---------- trackers ----------
  trackersOf(session) {
    const raw = fmOf(this.app, session).trackers;
    const out = [];
    if (Array.isArray(raw)) {
      raw.forEach((t, index) => {
        if (t && typeof t === "object" && "name" in t) {
          const max = Number(t.max);
          out.push({ name: String(t.name), value: t.value, max: isNaN(max) ? void 0 : max, index });
        }
      });
    } else if (raw && typeof raw === "object") {
      for (const [key, value] of Object.entries(raw)) out.push({ name: key, value, key });
    }
    return out;
  }
  setTracker(session, t, value) {
    this.app.fileManager.processFrontMatter(session, (fm) => {
      if (Array.isArray(fm.trackers) && t.index !== void 0 && fm.trackers[t.index]) {
        fm.trackers[t.index].value = value;
      } else if (fm.trackers && typeof fm.trackers === "object" && t.key !== void 0) {
        fm.trackers[t.key] = value;
      }
    });
  }
  renderTrackers(root, session) {
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
        (0, import_obsidian4.setIcon)(minus, "minus");
        ctl.createSpan({ cls: "rm-tracker-value", text: t.max !== void 0 ? `${v}/${t.max}` : String(v) });
        const plus = ctl.createEl("button", { attr: { "aria-label": `Increase ${t.name}` } });
        (0, import_obsidian4.setIcon)(plus, "plus");
        const clamp = (n) => t.max !== void 0 ? Math.max(0, Math.min(t.max, n)) : n;
        minus.onclick = () => this.setTracker(session, t, clamp(v - 1));
        plus.onclick = () => this.setTracker(session, t, clamp(v + 1));
      } else if (typeof v === "boolean") {
        const b = box.createEl("button", {
          cls: "rm-tracker-toggle" + (v ? " is-on" : ""),
          text: v ? "Yes" : "No",
          attr: { "aria-pressed": String(v) }
        });
        b.onclick = () => this.setTracker(session, t, !v);
      } else {
        box.createSpan({ cls: "rm-tracker-value", text: v === void 0 || v === null ? "\u2013" : String(v) });
      }
    }
  }
};
var SessionSuggest = class extends import_obsidian4.SuggestModal {
  constructor(app, view) {
    super(app);
    this.view = view;
    this.setPlaceholder("Pick a session");
  }
  getSuggestions(query) {
    const all = this.view.sessionsHere().reverse();
    const q = query.trim();
    if (!q) return all;
    const match = (0, import_obsidian4.prepareFuzzySearch)(q);
    return all.filter((f) => match(displayName(this.app, f)) || match(f.basename));
  }
  renderSuggestion(f, el) {
    el.createDiv({ text: displayName(this.app, f) });
    const st = fmOf(this.app, f).status;
    if (st) el.createEl("small", { text: String(st) });
  }
  onChooseSuggestion(f) {
    this.view.chooseSession(f);
  }
};

// src/main.ts
var RunModePlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
  }
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new RunModeView(leaf, this));
    this.addRibbonIcon("swords", "Open Run mode", () => this.activate());
    this.addCommand({ id: "open", name: "Open Run mode", callback: () => this.activate() });
    this.addSettingTab(new RunModeSettingTab(this.app, this));
  }
  async activate() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
  async loadSettings() {
    var _a;
    const data = (_a = await this.loadData()) != null ? _a : {};
    if (!data.settingsVersion && !data.campaignsRoot) {
      delete data.campaignsRoot;
      data.lastCampaign = null;
    }
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data, { settingsVersion: 2 });
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
