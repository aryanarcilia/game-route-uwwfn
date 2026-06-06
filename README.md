# UWWFN — Route Analyzer & Graph Viewer

A toolkit for downloading, parsing, analyzing, and visually exploring every route through the Twine horror game **[The Uncle Who Works for Nintendo](https://html-classic.itch.zone/html/485403/UWWFN/Files/index.html)** by Michael Lutz.

It walks the game's passage graph, enumerates all simple paths to each ending, and produces an interactive D3-powered route map viewer as a single self-contained HTML file.

---

## Features

- **Download** — fetches the game HTML directly from itch.io
- **Parse** — extracts all Twine passages, their content, outgoing links (including `<<timedgoto>>`, `<<goto>>`, `<<display>>` macros), tags, and canvas positions
- **Analyze** — builds a directed graph, runs BFS/DFS to find reachable passages, shortest paths to each ending, all simple paths (capped at 5 000), chokepoint analysis, and path-length distribution
- **Generate** — produces `data/route.html`, a fully self-contained interactive route map with:
  - D3 force-graph with all passages as nodes, colored by category
  - Sidebar route list grouped by ending, with route count and passage preview
  - **Multi-route checkbox selection** — check multiple routes to compare them side by side in the graph, each route rendered in its own distinct color
  - **Hover preview** — hovering any route item shows a live dashed-line preview of that path in the graph plus a tooltip card listing all passage names in order
  - Step-by-step navigation through a selected route (Prev / Next)
  - Click any node to read its full passage content in the detail panel
  - Passage search to highlight matching nodes
  - Export selected routes to `.txt` or styled `.html` files
  - Collapsible / resizable sidebar and detail panel

---

## Prerequisites

- **Node.js** ≥ 16
- `npm install` to fetch the only dependency (`node-html-parser`)

---

## Quick Start

```bash
# Install dependencies
npm install

# Run the full pipeline in one shot:
node index.js all
```

`all` runs: **download → parse → analyze → generate** then prints a summary to the terminal.

Open `data/route.html` in any modern browser to explore the route map.

---

## Commands

All commands are run via `node index.js <command>` or the `npm run` shortcuts.

| Command | npm script | Description |
|---------|-----------|-------------|
| `all` | — | Full pipeline + terminal summary |
| `download` | `npm run download` | Fetch `data/game.html` from itch.io |
| `parse` | `npm run parse` | Parse passages → `data/passages.json` |
| `analyze` | `npm run analyze` | Build route graph → `data/analysis.json` |
| `generate` | `npm run generate` | Build `data/route.html` viewer |
| `summary` | — | Print analysis summary from saved data |
| `path <ending>` | — | Show the shortest path to a named ending |
| `passage <title>` | — | Show a passage's content and outgoing links |
| `tags` | — | List all tag groups and their passages |

### Examples

```bash
# Show shortest route to a specific ending
node index.js path "Go home"

# Inspect a passage
node index.js passage "DenHub"

# List all tagged passage groups
node index.js tags

# Print stats without re-running analysis
node index.js summary

# Force re-download even if game.html already exists
node src/download.js --force
```

---

## Data Files

| File | Size | Description |
|------|------|-------------|
| `data/game.html` | ~24 MB | Raw game HTML downloaded from itch.io |
| `data/passages.json` | ~25 MB | All parsed passages with content, tags, links, positions |
| `data/analysis.json` | ~266 KB | Graph metadata, endings, paths, chokepoints |
| `data/route.html` | ~620 KB | Self-contained interactive route map viewer |

> `game.html` and `passages.json` are large and excluded from version control. Run `node index.js download` and `node index.js parse` to regenerate them.

---

## Project Structure

```
UWWFN/
├── index.js              # CLI entry point (all commands)
├── package.json
├── src/
│   ├── download.js       # Fetches game HTML from itch.io
│   ├── parse.js          # Extracts passages, links, tags from HTML
│   ├── analyze.js        # BFS/DFS graph analysis, endings, chokepoints
│   └── generate-html.js  # Builds the self-contained route.html viewer
└── data/
    ├── game.html         # (generated) raw game source
    ├── passages.json     # (generated) parsed passages
    ├── analysis.json     # (generated) route graph & stats
    └── route.html        # (generated) interactive viewer
```

---

## How It Works

### 1. Parse (`src/parse.js`)
Reads the `<div tiddler="…">` elements from Twine's `storeArea`. For each passage it extracts:
- Title, tags, canvas position, creation timestamp
- Raw content (HTML-decoded)
- Outgoing links — standard `[[target]]` / `[[display|target]]` syntax plus Twine macros (`<<timedgoto>>`, `<<goto>>`, `<<display>>`)

### 2. Analyze (`src/analyze.js`)
- Filters out utility passages (StoryTitle, stylesheet, script, Twine.image, etc.)
- Builds a directed adjacency graph (broken/external links are dropped)
- BFS from `Start` to find all reachable passages and their distances
- Identifies endings as passages that link to `END` (the game's canonical restart hub), plus any true dead-ends
- Finds the BFS shortest path to each ending
- DFS to enumerate all simple paths (capped at 5 000 to avoid combinatorial explosion)
- Computes chokepoint frequency (how many paths pass through each passage), path-length distribution, and per-tag counts

### 3. Generate (`src/generate-html.js`)
- Scales Twine canvas coordinates to a 6 000 × 4 200 SVG canvas
- Categorizes each passage by tag/name into a color-coded type (`den`, `kitchen`, `glitch`, `ending`, `hub`, etc.)
- Runs DFS per ending (up to 80 routes each) and embeds all data as inline JSON
- Renders the full D3 interactive viewer with sidebar, graph, detail panel, and navigation bar

---

## Route Map Viewer — Controls

| Interaction | Action |
|-------------|--------|
| Scroll | Zoom in / out |
| Drag canvas | Pan |
| Click node | Select — shows passage content in detail panel |
| Click route in sidebar | Highlight that route on the graph + step navigation |
| Checkbox on route | Lock that route's color into the graph (multi-select) |
| Hover route item | Preview path with dashed animation + passage-list tooltip |
| Group checkbox | Select / deselect all routes for an ending |
| Search box | Highlight nodes matching passage title |
| ◀ button | Collapse sidebar |
| Drag panel edges | Resize sidebar / detail panel / nav bar |
| ← / Next → buttons | Step through passages in the active route |
| ↗ Export HTML / TXT | Export selected routes as readable documents |

---

## Game Endings

The game has 6 named endings, reachable via different choices across a single evening's playthrough:

| Ending | Description |
|--------|-------------|
| `BadEnd` | Caught by the uncle |
| `doesn't have any hands` | Glitch / horror path |
| `Go home` | Left early |
| `You leave the Gameboy` | Survived, moved on |
| `glassy and empty her eyes are` | Dissociation ending |
| `No more games` | Final confrontation |

---

## License

This tooling is for personal study / fan analysis of *The Uncle Who Works for Nintendo* by [Michael Lutz](https://itch.io/profile/michaellutz). The game itself remains the author's property. Please support the original work.
