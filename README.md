# Run Mode for Obsidian (v0.1)

A phone-friendly way to run a session from your notes: a board of prepped scenes, tap a scene to see only what it needs, tap a name for a pop-up card, and adjust trackers at the bottom. It reads your normal Markdown notes, so nothing gets locked in.

## Install (phone or computer)

1. In Obsidian: Settings → Community plugins → **Browse**, search **BRAT**, install and enable it.
2. Open BRAT's settings → **Add beta plugin** → paste `alfonsomartinezdev/obsidian-run-mode` → **Add plugin**.
3. Back in Community plugins, switch **Run Mode** on.
4. Open the command palette and run **Run Mode: Open Run mode**.

BRAT checks this repo for new versions, so updates arrive automatically.

## Build from source

```
npm install
npm run build
```

## Campaigns

Run mode treats each folder at the top of your vault as a campaign (or each folder inside the one you set under Settings → Run Mode → Campaigns folder). It opens straight to the campaign and session you used last. Tap the campaign name at the top of the board to switch.

New sessions and scenes go inside the current campaign's folder, in `Sessions` and `Scenes` subfolders (both names can be changed in settings).

## How to set up your notes

The quickest way: use the **Create a session**, **New scene** and **Add example campaign** buttons in Run mode. They create notes with the right properties for you. The details below are for setting notes up by hand.

Run mode looks at each note's **properties** (the block at the top) and **headings**. Templates for all three note kinds are in the sample vault's `Templates` folder.

### Session note

```yaml
type: session
campaign: "[[A Crown of Salt]]"
status: next          # the session marked "next" opens by default
trackers:
  - name: Guild rep
    value: 3          # numbers get − and + buttons
  - name: Alarm
    value: 2
    max: 6            # optional cap, shown as 2/6
  - name: Ledger found
    value: false      # true/false becomes a Yes/No toggle
```

### Scene note

```yaml
type: scene
session: "[[Session 7]]"   # which session's board it appears on
status: unvisited          # unvisited, in-play or visited (changed from the app)
place: Docks district
hook: One line shown on the board card.
leads:
  - "[[Harbourmaster's Office]]"
```

Headings Run mode understands in a scene:

| Heading | Shown as |
|---|---|
| `## Read aloud` | Highlighted box at the top |
| `## Who's here` | Each `[[link]]` becomes a tappable chip that opens a card |
| `## To find` | `- [ ]` checkboxes you can tick during play (saved to the note) |
| `## Leads` | Links added to the "Leads to" buttons |
| Any other heading | Collapsible section, closed by default |

### Character, monster, place or item note

```yaml
type: NPC          # anything except "scene" opens as a card
role: Tannery owner
tagline: One-line description at the top of the card.
stats:
  AC: 11
  HP: 9
```

Use `## Players know` and `## DM only` headings for the two coloured boxes. Any other headings show as collapsible sections. A note with no headings shows its whole text.

### Using your own heading names

Settings → Run Mode lets you change every heading name, with alternatives separated by commas. "DM only" already also accepts "GM only", "Secrets" and "DM notes".

## Good to know

- Any `[[link]]` inside Run mode opens a card (or the scene, if it's a scene note) instead of leaving the view.
- The search bar finds any note by name or alias.
- A scene can appear in more than one session: give it a list, e.g. `session: ["[[Session 7]]", "[[Session 8]]"]`.
- Everything Run mode changes (status, ticks, tracker values) is written straight into your notes.

## Not in v0.1 yet

Moving unvisited scenes to the next session automatically, pinned "always on hand" cards, and a quick note field for jotting during play. Tell me what feels slow at the table and that's what goes in next.
