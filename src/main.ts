import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, RunModeSettings, RunModeSettingTab } from "./settings";
import { RunModeView, VIEW_TYPE } from "./view";

export default class RunModePlugin extends Plugin {
  settings: RunModeSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new RunModeView(leaf, this));
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
