// Creating sessions, scenes and the example campaign from inside Run mode.
import { App, Modal, normalizePath, Notice, TFile, TFolder } from "obsidian";
import { EXAMPLE_NOTES } from "./examples";

/** Asks for a name. Works on phones, where window.prompt isn't available. */
export class NameModal extends Modal {
  constructor(
    app: App,
    private heading: string,
    private placeholder: string,
    private onSubmit: (name: string) => void,
  ) {
    super(app);
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
}

async function ensureFolder(app: App, path: string) {
  const parts = normalizePath(path).split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    const existing = app.vault.getAbstractFileByPath(cur);
    if (!existing) await app.vault.createFolder(cur);
    else if (!(existing instanceof TFolder)) throw new Error(`"${cur}" is a file, not a folder.`);
  }
}

/** Creates a folder (and any missing parents). Returns its path. */
export async function createFolder(app: App, path: string): Promise<string> {
  const p = normalizePath(path);
  if (app.vault.getAbstractFileByPath(p)) {
    new Notice(`"${p}" already exists. Opening it.`);
  } else {
    await ensureFolder(app, p);
  }
  return p;
}

/** Creates a note, adding " 2", " 3"… if the name is taken. */
export async function createNote(app: App, folder: string, name: string, content: string): Promise<TFile> {
  const dir = normalizePath(folder || "/");
  if (dir !== "/") await ensureFolder(app, dir);
  const prefix = dir === "/" ? "" : `${dir}/`;
  let path = normalizePath(`${prefix}${name}.md`);
  for (let i = 2; app.vault.getAbstractFileByPath(path); i++) {
    path = normalizePath(`${prefix}${name} ${i}.md`);
  }
  return app.vault.create(path, content);
}

export function sessionContent(sessionType: string): string {
  return [
    "---",
    `type: ${sessionType}`,
    "status: next",
    "---",
    "",
  ].join("\n");
}

export function sceneContent(sceneType: string, sessionName: string): string {
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
    "",
  ].join("\n");
}

/** Adds the example campaign under "Run Mode Example/". Returns the session note. */
export async function addExample(app: App, root: string): Promise<TFile | null> {
  let session: TFile | null = null;
  let skipped = 0;
  for (const note of EXAMPLE_NOTES) {
    const n = { ...note, path: normalizePath(root ? `${root}/${note.path}` : note.path) };
    const existing = app.vault.getAbstractFileByPath(n.path);
    if (existing instanceof TFile) {
      skipped++;
      if (n.path.endsWith("Example Session.md")) session = existing;
      continue;
    }
    await ensureFolder(app, n.path.split("/").slice(0, -1).join("/"));
    const f = await app.vault.create(n.path, n.content);
    if (n.path.endsWith("Example Session.md")) session = f;
  }
  new Notice(
    skipped === EXAMPLE_NOTES.length
      ? "The example campaign is already in your vault."
      : 'Added an example campaign in the "Run Mode Example" folder. Delete it whenever you like.',
  );
  return session;
}
