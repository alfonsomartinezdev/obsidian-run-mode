import { App, PluginSettingTab, Setting } from "obsidian";
import type RunModePlugin from "./main";

export interface RunModeSettings {
  sceneType: string;
  sessionType: string;
  readAloud: string;
  whoHere: string;
  toFind: string;
  leads: string;
  playersKnow: string;
  dmOnly: string;
  campaignsRoot: string;
  sessionFolder: string;
  sceneFolder: string;
  lastSession: string;
  lastCampaign: string | null;
  settingsVersion: number;
}

export const DEFAULT_SETTINGS: RunModeSettings = {
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
  settingsVersion: 2,
};

export class RunModeSettingTab extends PluginSettingTab {
  plugin: RunModePlugin;

  constructor(app: App, plugin: RunModePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      text:
        "Run mode finds notes by the `type` property (or a #scene / #session tag) " +
        "and reads sections by their heading. Headings accept several names, separated by commas.",
    });

    const text = (name: string, desc: string, key: Exclude<keyof RunModeSettings, "lastCampaign" | "settingsVersion">) =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((t) =>
          t.setValue(this.plugin.settings[key]).onChange(async (v) => {
            this.plugin.settings[key] = v.trim();
            await this.plugin.saveSettings();
          }),
        );

    new Setting(containerEl).setName("Note types").setHeading();
    text("Scene type", "Value of `type` on scene notes.", "sceneType");
    text("Session type", "Value of `type` on session notes.", "sessionType");
    new Setting(containerEl).setName("Campaigns").setHeading();
    text(
      "Campaigns folder",
      "The folder that holds one folder per campaign. Leave empty if your campaign folders are at the top of your vault.",
      "campaignsRoot",
    );
    text("New session folder", "Inside each campaign folder.", "sessionFolder");
    text("New scene folder", "Inside each campaign folder.", "sceneFolder");

    new Setting(containerEl).setName("Scene headings").setHeading();
    text("Read aloud", "Shown first, in a highlighted box.", "readAloud");
    text("Who's here", "Each linked name becomes a tappable chip.", "whoHere");
    text("To find", "Checklist items you can tick off at the table.", "toFind");
    text("Leads", "Links here are added to the scene's leads.", "leads");

    new Setting(containerEl).setName("Character card headings").setHeading();
    text("Players know", "Shown in the blue box.", "playersKnow");
    text("DM only", "Shown in the amber box.", "dmOnly");
  }
}
