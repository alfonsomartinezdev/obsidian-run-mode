// Example notes created by the "Add example campaign" button.
export const EXAMPLE_NOTES: { path: string; content: string }[] = [
  {
    "path": "Run Mode Example/Sessions/Example Session.md",
    "content": "---\ntype: session\ncampaign: \"[[A Crown of Salt]]\"\nstatus: next\ntrackers:\n  - name: Guild rep\n    value: 3\n  - name: Alarm\n    value: 2\n    max: 6\n  - name: Ledger found\n    value: false\n---\nPrep for the night. Scenes join this session by linking back to it in their `session` property.\n"
  },
  {
    "path": "Run Mode Example/Scenes/Ambush on Rope Street.md",
    "content": "---\ntype: scene\nsession: \"[[Example Session]]\"\nstatus: unvisited\nplace: Anywhere\nhook: Drop this in whenever the party gets too loud.\n---\n## Who's here\n- [[Hollow Chorister]] ×2, in stolen guild cloaks\n\n## To find\n- [ ] Guild token on one of the bodies\n"
  },
  {
    "path": "Run Mode Example/Scenes/Chapel Undercroft.md",
    "content": "---\ntype: scene\nsession: \"[[Example Session]]\"\nstatus: unvisited\nplace: Old town\nhook: The Hollow Choir sings below the altar.\n---\n## Read aloud\nEvery candle gutters toward the sound, pointing the way down.\n\n## Who's here\n- [[Hollow Chorister]] ×4\n\n## How this could go\n- They shatter the circle by force, and the song turns on them.\n- They join in, sing the wrong verse on purpose, and unmake it from inside.\n- They're too slow; the hymn lands, and something answers from below.\n"
  },
  {
    "path": "Run Mode Example/Scenes/Harbourmaster's Office.md",
    "content": "---\ntype: scene\nsession: \"[[Example Session]]\"\nstatus: unvisited\nplace: Docks district\nhook: Captain Holt will trade manifests for a favour.\nleads:\n  - \"[[Chapel Undercroft]]\"\n---\n## Read aloud\nLedgers to the ceiling, a window over the harbour, and a captain who hasn't slept.\n\n## Who's here\n- [[Captain Veyra Holt]]\n\n## To find\n- [ ] Manifest naming the chapel as a delivery address\n"
  },
  {
    "path": "Run Mode Example/Scenes/The Tannery.md",
    "content": "---\ntype: scene\nsession: \"[[Example Session]]\"\nstatus: in-play\nplace: Docks district\nhook: The smuggler's ledger is hidden in a vat nobody will touch.\nleads:\n  - \"[[Harbourmaster's Office]]\"\n  - \"[[Ambush on Rope Street]]\"\n---\n## Read aloud\nThe stink hits before the door does. Six vats steam in the yard; one is covered with a tarp and chained.\n\n## Who's here\n- [[Old Marra]]\n- 2 dockhands, bored and armed with hooks\n\n## To find\n- [ ] Chain key on Marra's belt\n- [ ] The ledger, under the tarp\n\n## If it goes sideways\nMarra shouts for the dockhands. If the party threatens the vats, she folds and bargains instead.\n"
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
