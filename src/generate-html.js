'use strict';

const fs = require('fs');
const path = require('path');

const PASSAGES_PATH = path.join(__dirname, '..', 'data', 'passages.json');
const ANALYSIS_PATH = path.join(__dirname, '..', 'data', 'analysis.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'route.html');

// DFS: all simple paths from start to a specific target (capped)
function pathsToTarget(graph, start, target, max = 80) {
  const results = [];
  const stack = [[start, [start], new Set([start])]];
  while (stack.length && results.length < max) {
    const [node, arr, visited] = stack.pop();
    if (node === target) { results.push([...arr]); continue; }
    for (const nb of (graph[node] || [])) {
      if (!visited.has(nb)) {
        const v = new Set(visited);
        v.add(nb);
        stack.push([nb, [...arr, nb], v]);
      }
    }
  }
  return results;
}

function main() {
  const passages = JSON.parse(fs.readFileSync(PASSAGES_PATH, 'utf8'));
  const analysis = JSON.parse(fs.readFileSync(ANALYSIS_PATH, 'utf8'));
  const graphMap = analysis.graph;

  const endingSet = new Set(analysis.endings.map(e => e.title));
  const nodeSet = new Set(Object.keys(graphMap));

  // Position scaling: Twine canvas → SVG canvas (6000×4200)
  const CW = 6000, CH = 4200, PAD = 120;
  const xs = passages.filter(p => p.position).map(p => p.position[0]);
  const ys = passages.filter(p => p.position).map(p => p.position[1]);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const sx = v => Math.round(PAD + (v - minX) / (maxX - minX) * (CW - PAD * 2));
  const sy = v => Math.round(PAD + (v - minY) / (maxY - minY) * (CH - PAD * 2));

  // Categorize passage
  function category(p) {
    if (p.title === 'Start') return 'start';
    if (endingSet.has(p.title)) return 'ending';
    if (p.title === 'END') return 'hub';
    if (p.title === 'credits') return 'hub';
    const t = p.tags;
    if (t.some(x => /Glitch|glitch/.test(x))) return 'glitch';
    if (t.some(x => /vague/.test(x))) return 'vague';
    if (t.includes('Gameboy')) return 'gameboy';
    if (t.includes('HouseBurned')) return 'burned';
    if (t.includes('HouseEmpty')) return 'empty';
    if (t.includes('Kitchen')) return 'kitchen';
    if (t.includes('Bathroom')) return 'bathroom';
    if (t.includes('DiningRoom')) return 'dining';
    if (t.includes('Den')) return 'den';
    return 'default';
  }

  // Content map for quick lookup (skip Twine.image passages — they're base64 art)
  const contentMap = new Map(
    passages
      .filter(p => !p.tags.includes('Twine.image'))
      .map(p => [p.title, p.content || ''])
  );

  // Build nodes
  const nodes = passages
    .filter(p => nodeSet.has(p.title))
    .map(p => ({
      id: p.title,
      x: p.position ? sx(p.position[0]) : CW / 2,
      y: p.position ? sy(p.position[1]) : CH / 2,
      cat: category(p),
      out: (graphMap[p.title] || []).length,
      tags: p.tags,
      content: contentMap.get(p.title) || '',
    }));

  // Build edges (source→target, both in nodeSet)
  const edges = [];
  for (const [src, targets] of Object.entries(graphMap)) {
    for (const tgt of targets) {
      if (nodeSet.has(tgt)) edges.push([src, tgt]);
    }
  }

  // Generate routes: up to 80 paths per ending
  console.log('Generating routes per ending...');
  const routes = [];
  for (const ending of analysis.endings) {
    const paths = pathsToTarget(graphMap, 'Start', ending.title, 80);
    for (const p of paths) {
      routes.push({ n: routes.length + 1, e: ending.title, p });
    }
    console.log(`  "${ending.title}": ${paths.length} routes`);
  }

  const data = { nodes, edges, routes, CW, CH, meta: analysis.meta, endings: analysis.endings };
  const html = buildHTML(data);
  fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
  console.log(`\nGenerated: ${OUTPUT_PATH}`);
  console.log(`  Nodes: ${nodes.length}  Edges: ${edges.length}  Routes: ${routes.length}`);
}

function buildHTML({ nodes, edges, routes, CW, CH, meta, endings }) {
  const dataJS = `const NODES=${JSON.stringify(nodes)};
const EDGES=${JSON.stringify(edges)};
const ROUTES=${JSON.stringify(routes)};
const CW=${CW};const CH=${CH};
const ENDINGS=${JSON.stringify(endings)};
const META=${JSON.stringify(meta)};`;

  // Ending color map (used in both CSS and JS)
  const endingColors = {
    'BadEnd': '#ef4444',
    "doesn't have any hands": '#a855f7',
    'Go home': '#84cc16',
    'You leave the Gameboy': '#f97316',
    'glassy and empty her eyes are': '#ec4899',
    'No more games': '#f59e0b',
  };

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>UWWFN — Route Map</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:#0f1117;color:#e2e8f0;font-family:system-ui,sans-serif;font-size:13px}

#app{display:flex;flex-direction:column;height:100vh}
#header{flex-shrink:0;display:flex;align-items:center;gap:16px;padding:10px 16px;background:#161b27;border-bottom:1px solid #1e2a3a}
#header h1{font-size:16px;font-weight:700;color:#f8fafc;white-space:nowrap}
#header .stats{color:#64748b;font-size:12px;white-space:nowrap}
#search{flex:1;max-width:260px;padding:5px 10px;background:#0f1117;border:1px solid #1e2a3a;border-radius:6px;color:#e2e8f0;font-size:12px;outline:none}
#search:focus{border-color:#3b82f6}
#search::placeholder{color:#475569}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}

#body{flex:1;display:flex;min-height:0}

/* Resizers */
.resizer{flex-shrink:0;background:#1e2a3a;z-index:20;transition:background .15s}
.resizer-x{width:4px;cursor:col-resize}
.resizer-x:hover,.resizer-x.dragging{background:#3b82f6}
.resizer-y{height:5px;cursor:row-resize;width:100%}
.resizer-y:hover,.resizer-y.dragging{background:#3b82f6}

/* Sidebar */
#sidebar{width:240px;min-width:0;flex-shrink:0;display:flex;flex-direction:column;background:#0d1117;border-right:none;overflow:hidden;transition:width .18s}
#sidebar.collapsed{width:34px!important}
#sidebar.collapsed .sidebar-body{display:none}
#sidebar.collapsed #btn-reset-route{display:none}
#sidebar.collapsed .sidebar-title{display:none}
#sidebar-header{padding:6px 8px;border-bottom:1px solid #1e2a3a;color:#94a3b8;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden}
.sidebar-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#btn-sidebar-toggle{width:22px;height:22px;flex-shrink:0;background:#161b27;border:1px solid #1e2a3a;border-radius:4px;color:#94a3b8;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:background .1s,color .1s}
#btn-sidebar-toggle:hover{background:#1e2a3a;color:#e2e8f0}
#btn-reset-route{padding:3px 8px;background:#7f1d1d;border:1px solid #ef4444;border-radius:5px;color:#fca5a5;font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;flex-shrink:0}
#btn-reset-route:hover:not(:disabled){background:#991b1b;border-color:#f87171;color:#fff}
#btn-reset-route:disabled{opacity:.35;cursor:default}
.sidebar-body{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}
#route-list{flex:1;overflow-y:auto;padding:4px 0}
#route-list::-webkit-scrollbar{width:4px}
#route-list::-webkit-scrollbar-track{background:transparent}
#route-list::-webkit-scrollbar-thumb{background:#1e2a3a;border-radius:2px}

.ending-group{}
.ending-label{padding:6px 10px 4px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:5px;position:sticky;top:0;z-index:1;background:#0d1117;cursor:pointer;user-select:none}
.ending-label:hover{background:#111827}
.ending-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.ending-label-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.8}
.ending-toggle{font-size:10px;color:#475569;flex-shrink:0;line-height:1;transition:transform .15s}
.ending-routes{}
.ending-routes.collapsed{display:none}
.route-item{display:flex;align-items:center;gap:6px;padding:4px 8px 4px 12px;cursor:pointer;border-radius:4px;margin:0 4px;transition:background .1s}
.route-item:hover{background:#161b27}
.route-item.active{background:#1e2a3a}
.route-item.sel-checked{background:#0f1e35}
.route-num{font-size:11px;font-weight:700;color:#475569;min-width:28px;font-variant-numeric:tabular-nums}
.route-steps{font-size:11px;color:#64748b;margin-left:auto;white-space:nowrap}
/* Route checkbox */
.route-cb{width:14px;height:14px;flex-shrink:0;accent-color:#3b82f6;cursor:pointer;margin-right:2px}
.group-cb{width:12px;height:12px;flex-shrink:0;accent-color:#3b82f6;cursor:pointer}
/* Selection toolbar */
#select-toolbar{flex-shrink:0;display:none;align-items:center;gap:6px;padding:7px 10px;border-top:1px solid #1e3a5f;background:#0a1628;flex-wrap:wrap}
#select-toolbar.visible{display:flex}
#select-count{font-size:11px;font-weight:700;color:#93c5fd;flex:1;min-width:0;white-space:nowrap}
.sel-btn{padding:4px 10px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap;border:1px solid}
.sel-btn-txt{background:#1c1408;border-color:#78350f;color:#fcd34d}
.sel-btn-txt:hover{background:#292107;border-color:#f59e0b;color:#fef08a}
.sel-btn-html{background:#164e13;border-color:#22c55e;color:#86efac}
.sel-btn-html:hover{background:#166534;border-color:#4ade80;color:#bbf7d0}
.sel-btn-clear{background:#1a0a0a;border-color:#7f1d1d;color:#fca5a5}
.sel-btn-clear:hover{background:#291010;border-color:#ef4444;color:#fff}

/* Graph */
#graph-wrap{flex:1;position:relative;overflow:hidden;background:#0a0d14}
svg#graph{width:100%;height:100%;cursor:grab}
svg#graph:active{cursor:grabbing}

.node{cursor:pointer}
.node circle{transition:r .1s,stroke .1s,stroke-width .1s}
.node:hover .node-circle{filter:brightness(1.4)}
.node text{pointer-events:none;user-select:none;font-family:system-ui,sans-serif}
/* Selection ring — overrides dimmed state so selected node is always visible */
.node.selected .node-circle{stroke:#ffffff !important;stroke-width:3px !important;opacity:1 !important;filter:drop-shadow(0 0 8px currentColor) !important}
.sel-ring{display:none;pointer-events:none}
.node.selected .sel-ring{display:block}
@keyframes sel-pulse{0%{r:0;opacity:.7}100%{r:22px;opacity:0}}
.node.selected .sel-ring{animation:sel-pulse 1.6s ease-out infinite}

.edge{stroke:#4a90c4;stroke-width:1.2;fill:none;opacity:.65}
.edge.dimmed{opacity:.05}
.edge.lit{stroke:#f59e0b;stroke-width:2.5;opacity:1}

.node-circle.dimmed{opacity:.1}
.node-circle.lit{filter:drop-shadow(0 0 4px currentColor)}
.node-label.dimmed{opacity:.05}

#controls{position:absolute;top:16px;left:16px;display:flex;flex-direction:column;gap:6px}
.ctrl-btn{width:32px;height:32px;background:#161b27;border:1px solid #1e2a3a;border-radius:6px;color:#94a3b8;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .1s}
.ctrl-btn:hover{background:#1e2a3a;color:#e2e8f0}

/* Detail panel */
#detail{width:260px;flex-shrink:0;display:flex;flex-direction:column;background:#0d1117;border-left:1px solid #1e2a3a;overflow:hidden}
#detail-header{flex-shrink:0}
#detail-inner{flex:1;overflow-y:auto;padding:14px}
#detail-inner::-webkit-scrollbar{width:4px}
#detail-inner::-webkit-scrollbar-thumb{background:#1e2a3a;border-radius:2px}
#detail h2{font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:8px;line-height:1.4;word-break:break-word}
.detail-meta{margin-bottom:12px}
.detail-meta span{display:block;font-size:11px;color:#64748b;margin-bottom:2px}
.detail-meta b{color:#94a3b8}
.link-list{display:flex;flex-direction:column;gap:3px;margin-top:8px}
.link-chip{padding:3px 8px;background:#161b27;border-radius:4px;font-size:11px;color:#93c5fd;cursor:pointer;word-break:break-word;line-height:1.4}
.link-chip:hover{background:#1e3a5f}
.tag-chip{display:inline-block;padding:1px 6px;border-radius:999px;font-size:10px;background:#1e2a3a;color:#94a3b8;margin:2px}
#detail-empty{padding:24px 14px;color:#475569;font-size:12px;line-height:1.6}

/* Permanent nav bar — always visible at bottom of graph */
#nav-bar{position:absolute;bottom:0;left:0;right:0;background:rgba(13,17,23,.97);border-top:none;display:flex;flex-direction:column}
#nav-bar-top{display:flex;align-items:center;gap:10px;padding:8px 14px;flex-shrink:0}
#route-strip-title{font-size:11px;font-weight:600;color:#94a3b8;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-btn{padding:6px 18px;background:#1d4ed8;border:1px solid #3b82f6;border-radius:6px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap}
.nav-btn:hover:not(:disabled){background:#2563eb;border-color:#93c5fd}
.nav-btn:disabled{opacity:.35;cursor:default;background:#1e3558;border-color:#2d4a7a}
#step-counter{font-size:12px;font-weight:700;color:#e2e8f0;min-width:60px;text-align:center;font-variant-numeric:tabular-nums}
#btn-export{padding:6px 14px;background:#164e13;border:1px solid #22c55e;border-radius:6px;color:#86efac;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap}
#btn-export:hover:not(:disabled){background:#166534;border-color:#4ade80;color:#bbf7d0}
#btn-export:disabled{opacity:.3;cursor:default}
#btn-export-txt{padding:6px 14px;background:#1c1408;border:1px solid #78350f;border-radius:6px;color:#fcd34d;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap}
#btn-export-txt:hover:not(:disabled){background:#292107;border-color:#f59e0b;color:#fef08a}
#btn-export-txt:disabled{opacity:.3;cursor:default}
/* Route step chips strip — hidden until route selected */
#route-strip{display:none;flex-wrap:wrap;gap:4px;padding:6px 14px 8px;max-height:60px;overflow-y:auto;border-top:1px solid #1e2a3a}
#route-strip.visible{display:flex}
.step-chip{padding:2px 8px;background:#1e2a3a;border-radius:999px;font-size:10px;color:#cbd5e1;cursor:pointer;white-space:nowrap;transition:background .1s,color .1s}
.step-chip:hover{background:#2d3f52;color:#f1f5f9}
.step-chip.is-ending{background:#7c2020;color:#fca5a5}
.step-chip.is-start{background:#14532d;color:#86efac}
.step-chip.current-step{background:#78350f;color:#fbbf24;outline:1px solid #f59e0b;font-weight:700}

/* Visual novel content renderer */
.passage-text{margin-top:10px;padding-top:10px;border-top:1px solid #1e2a3a;font-size:12px;line-height:1.75;color:#cbd5e1}
.passage-text font{font-size:inherit !important}
.passage-text center{text-align:center}
.passage-text b,.passage-text strong{color:#f1f5f9}
.passage-text em,.passage-text i{color:#94a3b8;font-style:italic}
.choice-chip{display:block;width:100%;text-align:left;margin:4px 0;padding:5px 10px;background:#0f2236;border:1px solid #1e3a5f;border-radius:6px;color:#60a5fa;font-size:11px;cursor:pointer;line-height:1.4;word-break:break-word;transition:background .1s,border-color .1s}
.choice-chip:hover{background:#1e3a5f;border-color:#3b82f6;color:#93c5fd}
.var-ref{color:#a78bfa;font-style:italic;font-size:11px}
.auto-nav{display:block;margin:4px 0;padding:3px 8px;background:#1a2010;border-left:2px solid #4ade80;color:#86efac;font-size:10px;font-style:italic}
.branch-mark{color:#475569;font-size:10px;padding:0 3px;user-select:none}
.passage-label{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#475569;margin-bottom:6px}
</style>
</head>
<body>
<div id="app">
  <div id="header">
    <h1>UWWFN — Route Map</h1>
    <span class="stats" id="stat-text">Loading…</span>
    <input id="search" type="text" placeholder="Search passage…" autocomplete="off" spellcheck="false">
    <span style="margin-left:auto;font-size:11px;color:#334155">Scroll to zoom · Drag to pan · Click node for detail</span>
  </div>
  <div id="body">
    <aside id="sidebar">
      <div id="sidebar-header">
        <button id="btn-sidebar-toggle" title="Collapse sidebar">◀</button>
        <span class="sidebar-title">Routes</span>
        <button id="btn-reset-route" disabled onclick="resetRoute()">× Reset</button>
      </div>
      <div class="sidebar-body">
        <div id="route-list"></div>
        <div id="select-toolbar">
          <span id="select-count">0 selected</span>
          <button class="sel-btn sel-btn-txt" onclick="exportSelected('txt')">↗ TXT</button>
          <button class="sel-btn sel-btn-html" onclick="exportSelected('html')">↗ HTML</button>
          <button class="sel-btn sel-btn-clear" onclick="clearSelection()">✕ Clear</button>
        </div>
      </div>
    </aside>
    <div class="resizer resizer-x" id="sidebar-resizer"></div>

    <div id="graph-wrap">
      <svg id="graph"></svg>
      <div id="controls">
        <button class="ctrl-btn" id="btn-zoom-in" title="Zoom in">+</button>
        <button class="ctrl-btn" id="btn-zoom-out" title="Zoom out">−</button>
        <button class="ctrl-btn" id="btn-reset" title="Reset view" style="font-size:12px">⌂</button>
      </div>
      <div id="nav-bar">
        <div class="resizer resizer-y" id="nav-resizer"></div>
        <div id="nav-bar-top">
          <button class="nav-btn" id="btn-prev" disabled onclick="navigateStep(-1)">← Prev</button>
          <span id="step-counter">— / —</span>
          <button class="nav-btn" id="btn-next" disabled onclick="navigateStep(1)">Next →</button>
          <span id="route-strip-title">Select a route from the sidebar</span>
          <button id="btn-export" disabled onclick="exportRoute()">↗ Export HTML</button>
          <button id="btn-export-txt" disabled onclick="exportRouteTxt()">↗ Export TXT</button>
        </div>
        <div id="route-strip"></div>
      </div>
    </div>

    <div class="resizer resizer-x" id="detail-resizer"></div>
    <aside id="detail">
      <div id="detail-header" style="flex-shrink:0;padding:8px 12px;border-bottom:1px solid #1e2a3a;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#475569;display:flex;align-items:center;gap:6px">
        <span id="detail-sel-dot" style="width:8px;height:8px;border-radius:50%;background:#475569;flex-shrink:0"></span>
        <span id="detail-header-text">No node selected</span>
      </div>
      <div id="detail-inner">
        <div id="detail-empty">Click any node in the graph to see its passage text and outgoing links.</div>
      </div>
    </aside>
  </div>
</div>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
${dataJS}

// ── Category colors ───────────────────────────────────────────────────────────
const CAT_COLOR = {
  start:    '#22c55e',
  ending:   '#ef4444',
  hub:      '#f59e0b',
  glitch:   '#a855f7',
  vague:    '#ec4899',
  gameboy:  '#eab308',
  burned:   '#f97316',
  empty:    '#84cc16',
  kitchen:  '#fb923c',
  bathroom: '#06b6d4',
  dining:   '#8b5cf6',
  den:      '#3b82f6',
  default:  '#475569',
};

const ENDING_COLORS = ${JSON.stringify(endingColors)};

// ── State ─────────────────────────────────────────────────────────────────────
let activeRoute = null;
let activeRouteSet = null; // Set of passage ids in active route
let activeEdgeSet = null;  // Set of "src→tgt" strings in active route
let selectedNode = null;   // currently selected node datum
let currentStep = 0;      // step index within the active route

// ── D3 setup ──────────────────────────────────────────────────────────────────
const svg = d3.select('#graph');
const g = svg.append('g').attr('id', 'root');

// Arrow markers (one per category color + one for highlighted)
const defs = svg.append('defs');
function addMarker(id, color, size = 6) {
  defs.append('marker')
    .attr('id', id)
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 10)
    .attr('refY', 5)
    .attr('markerWidth', size)
    .attr('markerHeight', size)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', color);
}
addMarker('arrow-default', '#4a90c4');
addMarker('arrow-lit', '#f59e0b', 8);

// Zoom
const zoom = d3.zoom()
  .scaleExtent([0.04, 6])
  .on('zoom', e => g.attr('transform', e.transform));
svg.call(zoom).on('dblclick.zoom', null);

// ── Build lookup maps ─────────────────────────────────────────────────────────
const nodeById = new Map(NODES.map(n => [n.id, n]));

// ── Draw edges ────────────────────────────────────────────────────────────────
const edgeG = g.append('g').attr('id', 'edges');

// Offset edge endpoints so arrows don't hide under node circles
function edgeCoords(src, tgt) {
  const s = nodeById.get(src), t = nodeById.get(tgt);
  if (!s || !t) return null;
  const dx = t.x - s.x, dy = t.y - s.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const r = nodeRadius(t) + 4;
  return {
    x1: s.x, y1: s.y,
    x2: t.x - dx / dist * r,
    y2: t.y - dy / dist * r,
  };
}

const edgeLines = edgeG.selectAll('line')
  .data(EDGES)
  .join('line')
  .attr('class', 'edge')
  .attr('marker-end', 'url(#arrow-default)')
  .each(function(d) {
    const c = edgeCoords(d[0], d[1]);
    if (c) d3.select(this).attr('x1', c.x1).attr('y1', c.y1).attr('x2', c.x2).attr('y2', c.y2);
  });

// ── Draw nodes ────────────────────────────────────────────────────────────────
function nodeRadius(n) {
  if (n.cat === 'start') return 12;
  if (n.cat === 'ending') return 10;
  if (n.cat === 'hub') return 9;
  return Math.max(4, Math.min(9, 4 + n.out * 0.6));
}

const nodeG = g.append('g').attr('id', 'nodes');

const nodeElems = nodeG.selectAll('g.node')
  .data(NODES)
  .join('g')
  .attr('class', 'node')
  .attr('transform', d => \`translate(\${d.x},\${d.y})\`)
  .on('click', (e, d) => {
    e.stopPropagation();
    selectNode(e.currentTarget, d);
  })
  .on('mouseenter', (e, d) => showTooltip(e, d))
  .on('mouseleave', hideTooltip);

// Pulsing selection ring (hidden by default, shown via .node.selected CSS)
nodeElems.append('circle')
  .attr('class', 'sel-ring')
  .attr('r', d => nodeRadius(d) + 4)
  .attr('fill', 'none')
  .attr('stroke', '#ffffff')
  .attr('stroke-width', 1.5);

nodeElems.append('circle')
  .attr('class', 'node-circle')
  .attr('r', d => nodeRadius(d))
  .attr('fill', d => CAT_COLOR[d.cat] || CAT_COLOR.default)
  .attr('stroke', d => d.cat === 'ending' ? '#fff' : 'none')
  .attr('stroke-width', 1.5);

// Invisible hit-area on top — much larger than the visible dot so small nodes are easy to click
nodeElems.append('circle')
  .attr('class', 'hit-area')
  .attr('r', d => Math.max(nodeRadius(d) + 10, 18))
  .attr('fill', 'transparent')
  .attr('stroke', 'none')
  .style('cursor', 'pointer');

// Label for start / endings / hubs only
nodeElems.filter(d => ['start','ending','hub'].includes(d.cat))
  .append('text')
  .attr('class', 'node-label')
  .attr('y', d => -nodeRadius(d) - 4)
  .attr('text-anchor', 'middle')
  .attr('fill', d => CAT_COLOR[d.cat])
  .attr('font-size', 9)
  .attr('font-weight', '700')
  .text(d => d.id.length > 24 ? d.id.slice(0, 22) + '…' : d.id);

// ── Tooltip ───────────────────────────────────────────────────────────────────
const tooltip = d3.select('body').append('div')
  .style('position', 'fixed')
  .style('background', '#1e2a3a')
  .style('color', '#e2e8f0')
  .style('padding', '5px 10px')
  .style('border-radius', '6px')
  .style('font-size', '12px')
  .style('pointer-events', 'none')
  .style('display', 'none')
  .style('z-index', '999')
  .style('max-width', '260px')
  .style('line-height', '1.4');

function showTooltip(e, d) {
  tooltip.style('display', 'block')
    .style('left', (e.clientX + 14) + 'px')
    .style('top', (e.clientY - 10) + 'px')
    .html(\`<b>\${d.id}</b><br><span style="color:#64748b">\${d.tags.join(', ') || '—'}</span> · out: \${d.out}\`);
}
function hideTooltip() { tooltip.style('display', 'none'); }

// ── Fit view ──────────────────────────────────────────────────────────────────
function fitView() {
  const el = document.getElementById('graph-wrap');
  const vw = el.clientWidth, vh = el.clientHeight;
  const sc = Math.min(vw / CW, vh / CH) * 0.9;
  const tx = (vw - CW * sc) / 2;
  const ty = (vh - CH * sc) / 2;
  svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(sc));
}

// ── Route highlighting ────────────────────────────────────────────────────────
function highlightRoute(routeIdx) {
  if (routeIdx === null || routeIdx < 0 || routeIdx >= ROUTES.length) {
    clearHighlight();
    return;
  }
  const route = ROUTES[routeIdx];
  activeRoute = routeIdx;
  activeRouteSet = new Set(route.p);
  activeEdgeSet = new Set();
  for (let i = 0; i < route.p.length - 1; i++) {
    activeEdgeSet.add(route.p[i] + '→' + route.p[i + 1]);
  }

  // Nodes
  nodeElems.selectAll('circle.node-circle')
    .classed('dimmed', d => !activeRouteSet.has(d.id))
    .classed('lit', d => activeRouteSet.has(d.id));
  nodeElems.selectAll('text.node-label')
    .classed('dimmed', d => !activeRouteSet.has(d.id));

  // Edges
  edgeLines
    .classed('dimmed', d => !activeEdgeSet.has(d[0] + '→' + d[1]))
    .classed('lit', d => activeEdgeSet.has(d[0] + '→' + d[1]))
    .attr('marker-end', d => activeEdgeSet.has(d[0] + '→' + d[1]) ? 'url(#arrow-lit)' : 'url(#arrow-default)');

  // Route list — mark active
  document.querySelectorAll('.route-item').forEach(el => {
    el.classList.toggle('active', +el.dataset.idx === routeIdx);
  });

  // Route strip
  currentStep = 0;
  showRouteStrip(route);
  updateStepUI();

  // Navigate to the first passage in the route
  panToNode(route.p[0]);

  // Enable Reset button
  document.getElementById('btn-reset-route').disabled = false;

  // Scroll active item into view
  const activeEl = document.querySelector(\`.route-item[data-idx="\${routeIdx}"]\`);
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function clearHighlight() {
  activeRoute = null;
  activeRouteSet = null;
  activeEdgeSet = null;
  currentStep = 0;
  nodeElems.selectAll('circle.node-circle').classed('dimmed', false).classed('lit', false);
  nodeElems.selectAll('text.node-label').classed('dimmed', false);
  edgeLines.classed('dimmed', false).classed('lit', false).attr('marker-end', 'url(#arrow-default)');
  document.querySelectorAll('.route-item').forEach(el => el.classList.remove('active'));
  document.getElementById('btn-reset-route').disabled = true;
  hideRouteStrip();
}

function resetRoute() {
  clearHighlight();
  clearNodeSelection();
  history.replaceState(null, '', location.pathname);
}

// ── Step navigation ───────────────────────────────────────────────────────────
function navigateStep(delta) {
  if (activeRoute === null) return;
  const route = ROUTES[activeRoute];
  const next = Math.max(0, Math.min(route.p.length - 1, currentStep + delta));
  if (next === currentStep) return;
  currentStep = next;
  panToNode(route.p[currentStep]);
  updateStepUI();
}

function updateStepUI() {
  if (activeRoute === null) return;
  const route = ROUTES[activeRoute];
  const total = route.p.length;
  document.getElementById('step-counter').textContent = \`\${currentStep + 1} / \${total}\`;
  document.getElementById('btn-prev').disabled = currentStep === 0;
  document.getElementById('btn-next').disabled = currentStep === total - 1;
  // Highlight current step chip
  document.querySelectorAll('#route-strip .step-chip').forEach((el, i) => {
    el.classList.toggle('current-step', i === currentStep);
  });
  // Scroll current step chip into view
  const cur = document.querySelector('#route-strip .step-chip.current-step');
  if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ── Route strip (bottom of graph) ────────────────────────────────────────────
function showRouteStrip(route) {
  document.getElementById('btn-export').disabled = false;
  document.getElementById('btn-export-txt').disabled = false;
  document.getElementById('route-strip-title').textContent =
    \`Route #\${route.n} → "\${route.e}" (\${route.p.length} steps)\`;
  document.getElementById('route-strip').innerHTML = route.p.map((step, i) => {
    const isStart = i === 0;
    const isEnd = i === route.p.length - 1;
    let cls = 'step-chip';
    if (isStart) cls += ' is-start';
    if (isEnd) cls += ' is-ending';
    const label = step.length > 28 ? step.slice(0, 26) + '…' : step;
    return \`<span class="\${cls}" data-idx="\${i}" onclick="jumpToStep(\${i})">\${label}</span>\`;
  }).join('');
  document.getElementById('route-strip').classList.add('visible');
}

function jumpToStep(i) {
  if (activeRoute === null) return;
  currentStep = i;
  panToNode(ROUTES[activeRoute].p[i]);
  updateStepUI();
}

function hideRouteStrip() {
  document.getElementById('btn-export').disabled = true;
  document.getElementById('btn-export-txt').disabled = true;
  document.getElementById('route-strip-title').textContent = 'Select a route from the sidebar';
  document.getElementById('route-strip').classList.remove('visible');
  document.getElementById('step-counter').textContent = '— / —';
  document.getElementById('btn-prev').disabled = true;
  document.getElementById('btn-next').disabled = true;
}

// ── Node selection (visual + detail) ─────────────────────────────────────────
function selectNode(domElem, d) {
  // Remove selection from any previously selected node
  nodeElems.classed('selected', false);
  // Apply selection to clicked element
  d3.select(domElem).classed('selected', true);
  selectedNode = d;
  showDetail(d);
  // If a route is active and this node is part of it, sync the step counter
  if (activeRoute !== null) {
    const stepIdx = ROUTES[activeRoute].p.indexOf(d.id);
    if (stepIdx !== -1) {
      currentStep = stepIdx;
      updateStepUI();
    }
  }
}

function clearNodeSelection() {
  nodeElems.classed('selected', false);
  selectedNode = null;
  document.getElementById('detail-inner').innerHTML =
    '<div id="detail-empty">Click any node in the graph to see its passage text and outgoing links.</div>';
  document.getElementById('detail-header-text').textContent = 'No node selected';
  document.getElementById('detail-sel-dot').style.background = '#475569';
}

// ── Pan to node ───────────────────────────────────────────────────────────────
function panToNode(id) {
  const n = nodeById.get(id);
  if (!n) return;
  const el = document.getElementById('graph-wrap');
  const vw = el.clientWidth, vh = el.clientHeight;
  const t = d3.zoomTransform(svg.node());
  const newT = d3.zoomIdentity
    .translate(vw / 2 - t.k * n.x, vh / 2 - t.k * n.y)
    .scale(t.k);
  svg.transition().duration(400).call(zoom.transform, newT);
  // Find the DOM element for this node and select it
  const elem = nodeG.selectAll('g.node').filter(d2 => d2.id === id).node();
  if (elem) selectNode(elem, n);
}

// ── Content renderer (Twine → readable HTML) ─────────────────────────────────
function renderContent(raw) {
  if (!raw || !raw.trim()) return '<em style="color:#475569">Empty passage</em>';
  let s = raw;

  // Strip silent blocks entirely
  s = s.replace(/<<silently>>[\\s\\S]*?<<endsilently>>/g, '');

  // Unwrap timed-insert (keep content, drop wrapper tags)
  s = s.replace(/<<timedinsert[^>]*>>/g, '').replace(/<<endtimedinsert>>/g, '');

  // <<print $var>> → styled variable reference
  s = s.replace(/<<print\\s+\\$([\\w.]+)>>/g, '<span class="var-ref">[$1]</span>');

  // <<timedgoto "passage" Xs>> → auto-nav indicator
  s = s.replace(/<<timedgoto\\s+"([^"]+)"\\s+[\\d.]+s>>/g,
    (_, p) => \`<span class="auto-nav">⏱ auto-advance → \${p}</span>\`);

  // <<goto "passage">> → auto-nav indicator
  s = s.replace(/<<goto\\s+"([^"]+)">>/g,
    (_, p) => \`<span class="auto-nav">→ \${p}</span>\`);

  // <<if ...>> / <<else>> / <<elseif ...>> / <<endif>> → subtle branch markers
  s = s.replace(/<<if\\s[^>]+>>/g, '<span class="branch-mark">[if]</span>');
  s = s.replace(/<<elseif\\s[^>]+>>/g, '<span class="branch-mark">[or]</span>');
  s = s.replace(/<<else>>/g, '<span class="branch-mark">[else]</span>');
  s = s.replace(/<<endif>>/g, '');

  // Strip remaining macros (set, sound, display, etc.)
  s = s.replace(/<<[^>]+>>/g, '');

  // Twine whitespace-suppression marker
  s = s.replace(/\\\\s/g, '');

  // [[display|target][optional setter]] → choice button  (setter link syntax)
  s = s.replace(/\\[\\[([^\\]|[]+)(?:\\|([^\\][]+))?\\](?:\\[[^\\]]*\\])?\\]/g, (_, display, target) => {
    const dest = (target || display).trim();
    const text = display.trim();
    return \`<button class="choice-chip" data-node="\${dest.replace(/"/g, '&quot;')}">▶ \${text}</button>\`;
  });

  // Convert newlines to <br>
  s = s.replace(/\\n/g, '<br>');

  // Collapse 3+ consecutive <br> to two
  s = s.replace(/(<br\\s*\\/?\\s*){3,}/gi, '<br><br>');

  return s.trim();
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function showDetail(n) {
  if (!n) return;
  const inner = document.getElementById('detail-inner');
  const tags = n.tags.map(t => \`<span class="tag-chip">\${t}</span>\`).join('');
  const color = CAT_COLOR[n.cat] || CAT_COLOR.default;

  // Update header strip
  document.getElementById('detail-header-text').textContent = n.id.length > 28 ? n.id.slice(0, 26) + '…' : n.id;
  document.getElementById('detail-sel-dot').style.background = color;

  const content = renderContent(n.content || '');

  inner.innerHTML = \`
    <h2 style="color:\${color};display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:\${color};flex-shrink:0"></span>
      \${n.id}
    </h2>
    <div class="detail-meta">
      <span>\${tags || '<span class="tag-chip">untagged</span>'}</span>
      <span style="margin-top:4px"><b>Type:</b> \${n.cat} &nbsp; <b>Links out:</b> \${n.out}</span>
    </div>
    <div class="passage-text">\${content}</div>
  \`;
}

// Event delegation for choice chips inside detail panel (choice-chip uses data-node)
document.addEventListener('click', e => {
  const chip = e.target.closest('.choice-chip');
  if (chip && chip.dataset.node) panToNode(chip.dataset.node);
});

// ── Sidebar route list ────────────────────────────────────────────────────────
// ── Selection state ───────────────────────────────────────────────────────────
const selectedRouteIdxs = new Set();

function updateSelectionToolbar() {
  const n = selectedRouteIdxs.size;
  const toolbar = document.getElementById('select-toolbar');
  toolbar.classList.toggle('visible', n > 0);
  document.getElementById('select-count').textContent = n === 1 ? '1 route selected' : \`\${n} routes selected\`;
}

function toggleRouteCheck(e, idx) {
  e.stopPropagation();
  if (selectedRouteIdxs.has(idx)) selectedRouteIdxs.delete(idx);
  else selectedRouteIdxs.add(idx);
  const item = document.querySelector(\`.route-item[data-idx="\${idx}"]\`);
  if (item) {
    item.classList.toggle('sel-checked', selectedRouteIdxs.has(idx));
    const cb = item.querySelector('.route-cb');
    if (cb) cb.checked = selectedRouteIdxs.has(idx);
  }
  updateSelectionToolbar();
  // sync group checkbox
  const groupRoutes = item && item.closest('.ending-routes');
  if (groupRoutes) syncGroupCheckbox(groupRoutes);
}

function syncGroupCheckbox(routesEl) {
  const allIdxs = [...routesEl.querySelectorAll('.route-item')].map(el => +el.dataset.idx);
  const allChecked = allIdxs.every(i => selectedRouteIdxs.has(i));
  const groupCb = routesEl.previousElementSibling && routesEl.previousElementSibling.querySelector('.group-cb');
  if (groupCb) groupCb.checked = allChecked;
}

function toggleGroupSelect(e, idxList) {
  e.stopPropagation();
  const allSelected = idxList.every(i => selectedRouteIdxs.has(i));
  idxList.forEach(i => allSelected ? selectedRouteIdxs.delete(i) : selectedRouteIdxs.add(i));
  // refresh all items in group
  idxList.forEach(i => {
    const item = document.querySelector(\`.route-item[data-idx="\${i}"]\`);
    if (item) {
      item.classList.toggle('sel-checked', selectedRouteIdxs.has(i));
      const cb = item.querySelector('.route-cb');
      if (cb) cb.checked = selectedRouteIdxs.has(i);
    }
  });
  e.target.checked = !allSelected;
  updateSelectionToolbar();
}

function clearSelection() {
  selectedRouteIdxs.clear();
  document.querySelectorAll('.route-item.sel-checked').forEach(el => el.classList.remove('sel-checked'));
  document.querySelectorAll('.route-cb,.group-cb').forEach(cb => cb.checked = false);
  updateSelectionToolbar();
}

function buildSidebar() {
  const container = document.getElementById('route-list');
  const byEnding = {};
  for (const r of ROUTES) {
    if (!byEnding[r.e]) byEnding[r.e] = [];
    byEnding[r.e].push(r);
  }

  let html = '';
  let gIdx = 0;
  for (const [ending, routes] of Object.entries(byEnding)) {
    const color = ENDING_COLORS[ending] || '#ef4444';
    const id = 'eg-' + gIdx++;
    const label = ending.length > 20 ? ending.slice(0,18)+'…' : ending;
    const idxList = routes.map(r => r.n - 1).join(',');
    html += \`<div class="ending-group">
      <div class="ending-label" onclick="toggleEndingGroup('\${id}',this)">
        <input class="group-cb" type="checkbox" title="Select all in group" onclick="toggleGroupSelect(event,[\${idxList}])" />
        <span class="ending-dot" style="background:\${color}"></span>
        <span class="ending-label-text" title="\${ending}">\${label} <span style="opacity:.5;font-size:9px">(\${routes.length})</span></span>
        <span class="ending-toggle">▾</span>
      </div>
      <div class="ending-routes" id="\${id}">\`;
    for (const r of routes) {
      html += \`<div class="route-item" data-idx="\${r.n - 1}" onclick="selectRoute(\${r.n - 1})">
        <input class="route-cb" type="checkbox" onclick="toggleRouteCheck(event,\${r.n - 1})" />
        <span class="route-num">#\${r.n}</span>
        <span style="font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" title="\${r.p.slice(0,4).join(' → ')}…">\${r.p.slice(1, 4).join(' → ')}\${r.p.length > 4 ? '…' : ''}</span>
        <span class="route-steps">\${r.p.length}s</span>
      </div>\`;
    }
    html += '</div></div>';
  }
  container.innerHTML = html;
}

function toggleEndingGroup(id, labelEl) {
  const routes = document.getElementById(id);
  const toggle = labelEl.querySelector('.ending-toggle');
  const collapsed = routes.classList.toggle('collapsed');
  toggle.textContent = collapsed ? '▸' : '▾';
}

// ── Combined export (selected or all) ────────────────────────────────────────
function buildRouteProse(routeIdx) {
  const route = ROUTES[routeIdx];
  const vars = {};
  const lines = [];
  route.p.forEach((title, i) => {
    const node = nodeById.get(title);
    const raw = node ? (node.content || '') : '';
    const nextTitle = route.p[i + 1] || null;
    Object.assign(vars, extractContentVars(raw));
    const prose = renderPlainText(raw, vars);
    if (prose) { lines.push(prose); lines.push(''); }
    if (nextTitle) {
      const info = findLinkInfo(raw, nextTitle);
      if (info && info.setter) Object.assign(vars, extractSetterVars(info.setter));
    }
  });
  return lines.join('\\n').trim();
}

function exportSelected(format) {
  const idxs = [...selectedRouteIdxs].sort((a,b) => a - b);
  if (!idxs.length) return;
  exportRouteSet(idxs, format);
}

function exportRouteSet(idxs, format) {
  if (format === 'txt') {
    const bar = '\\u2550'.repeat(60);
    // One file per route
    idxs.forEach((idx, i) => {
      setTimeout(() => {
        const route = ROUTES[idx];
        const prose = buildRouteProse(idx);
        const txt = [
          \`UWWFN \\u2014 Route #\${route.n}\`,
          \`Ending  : \${route.e}\`,
          \`Passages: \${route.p.length}\`,
          '',
          bar,
          '',
          prose,
          '',
          bar,
          \`End of route #\${route.n}\`,
        ].join('\\n');
        downloadBlob(txt, 'text/plain;charset=utf-8',
          \`uwwfn-route-\${route.n}-\${route.e.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.txt\`);
      }, i * 300);
    });
  } else {
    exportRoutesHtml(idxs);
  }
}

function exportRoutesHtml(idxs) {
  const tocItems = idxs.map(idx => {
    const r = ROUTES[idx];
    const color = (typeof ENDING_COLORS !== 'undefined' && ENDING_COLORS[r.e]) || '#ef4444';
    return \`<li><a href="#r\${r.n}" style="color:\${color}">Route #\${r.n}</a> — \${escHtml(r.e)} (\${r.p.length} passages)</li>\`;
  }).join('\\n');

  const sections = idxs.map(idx => {
    const route = ROUTES[idx];
    const endingColor = (typeof ENDING_COLORS !== 'undefined' && ENDING_COLORS[route.e]) || '#ef4444';
    const vars = {};
    const stepInfo = route.p.map((title, i) => {
      const node = nodeById.get(title);
      const raw = node ? (node.content || '') : '';
      const nextTitle = route.p[i + 1] || null;
      Object.assign(vars, extractContentVars(raw));
      const renderVars = { ...vars };
      let choiceDisplay = null, setterDesc = [];
      if (nextTitle) {
        const info = findLinkInfo(raw, nextTitle);
        if (info) {
          choiceDisplay = info.display;
          const sv = extractSetterVars(info.setter);
          for (const [k,v] of Object.entries(sv)) { vars[k] = v; setterDesc.push(\`\${k} = "\${v}"\`); }
        }
      }
      return { title, raw, renderVars, nextTitle, choiceDisplay, setterDesc,
               isFirst: i === 0, isLast: i === route.p.length - 1, idx: i };
    });

    const passages = stepInfo.map(({ title, raw, renderVars, nextTitle, choiceDisplay, setterDesc, isFirst, isLast, idx }) => {
      const node = nodeById.get(title);
      const color = node ? (CAT_COLOR[node.cat] || CAT_COLOR.default) : '#475569';
      const body = applyVars(renderContent(raw), renderVars);
      let choiceHtml = '';
      if (!isLast && nextTitle) {
        const label = escHtml(choiceDisplay || nextTitle);
        const setterHtml = setterDesc.length ? \`<div class="choice-setter">\${setterDesc.map(s=>\`<span class="setter-tag">\${escHtml(s)}</span>\`).join('')}</div>\` : '';
        choiceHtml = \`<div class="choice-taken"><span class="choice-arrow">▶</span> \${label}\${setterHtml}</div>\`;
      }
      return \`<section class="passage-section\${isFirst?' is-first':''}\${isLast?' is-last':''}">
        <div class="passage-step">\${isFirst?'START · ':''}\${idx+1} / \${route.p.length}</div>
        <h2 class="passage-title" style="color:\${color}"><span class="passage-dot" style="background:\${color}"></span>\${escHtml(title)}</h2>
        <div class="passage-body">\${body}</div>
        \${choiceHtml}\${!isLast?'<div class="passage-divider"></div>':''}
      </section>\`;
    }).join('\\n');

    return \`<article id="r\${route.n}" class="route-article">
      <header class="route-header">
        <div class="route-label">Route #\${route.n}</div>
        <div class="route-ending" style="color:\${endingColor}">\${escHtml(route.e)}</div>
        <div class="route-info">\${route.p.length} passages · <a href="#toc" class="back-link">↑ back to contents</a></div>
      </header>
      \${passages}
    </article>\`;
  }).join('\\n<div class="route-divider"></div>\\n');

  const html = \`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>UWWFN — \${idxs.length} Routes Export</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{background:#0a0d14;color:#d1d5db;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.8;scroll-behavior:smooth}
body{max-width:740px;margin:0 auto;padding:40px 24px 80px}
a{color:#60a5fa;text-decoration:none}a:hover{text-decoration:underline}
nav#toc{margin-bottom:48px;padding:20px 24px;background:#0d1117;border:1px solid #1e2a3a;border-radius:10px}
nav#toc h2{font-family:system-ui,sans-serif;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#64748b;margin-bottom:14px}
nav#toc ol{padding-left:20px;font-family:system-ui,sans-serif;font-size:12px;color:#64748b;line-height:2}
.route-article{margin-bottom:0}
.route-header{margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid #1e2a3a}
.route-label{font-family:system-ui,sans-serif;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#475569;margin-bottom:6px}
.route-ending{font-family:system-ui,sans-serif;font-size:20px;font-weight:700;margin-bottom:4px}
.route-info{font-family:system-ui,sans-serif;font-size:12px;color:#475569}
.back-link{color:#334155}
.route-divider{margin:64px 0;border-top:2px solid #1e2a3a;position:relative}
.route-divider::after{content:"★ ★ ★";position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:#0a0d14;padding:0 16px;color:#1e3a5f;letter-spacing:10px;font-size:13px}
.passage-section{position:relative}
.passage-step{font-family:system-ui,sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#334155;margin-bottom:10px}
.passage-title{font-family:system-ui,sans-serif;font-size:15px;font-weight:700;margin-bottom:18px;display:flex;align-items:center;gap:10px;line-height:1.4}
.passage-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;display:inline-block}
.passage-body{color:#c9d1d9;line-height:1.9;font-size:16px}
.passage-body br{display:block;content:"";margin-top:.3em}
.passage-body .auto-nav{display:block;margin:10px 0;padding:4px 12px;background:#0f1e0f;border-left:3px solid #22c55e;color:#86efac;font-family:system-ui,sans-serif;font-size:12px;font-style:italic;border-radius:0 4px 4px 0}
.passage-body .branch-mark{color:#334155;font-size:11px;font-family:system-ui,sans-serif;padding:0 4px}
.passage-body .var-ref{color:#a78bfa;font-style:italic;font-family:monospace;font-size:13px}
.passage-body .var-resolved{color:#fbbf24;font-weight:700;font-style:normal;border-bottom:1px dashed #78350f;cursor:help}
.passage-body b,.passage-body strong{color:#f1f5f9}
.passage-body em,.passage-body i{color:#94a3b8}
.passage-body center{text-align:center;display:block}
.passage-body .choice-chip{display:none}
.choice-taken{margin-top:24px;padding:10px 16px;background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;font-family:system-ui,sans-serif;font-size:13px;font-weight:600;display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}
.choice-arrow{color:#60a5fa;flex-shrink:0}
.choice-taken>:nth-child(2){color:#93c5fd;flex:1}
.choice-setter{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;width:100%;padding-left:20px}
.setter-tag{padding:2px 8px;background:#1a0a2e;border:1px solid #7c3aed44;border-radius:999px;font-size:11px;color:#a78bfa;font-family:monospace}
.passage-divider{margin:36px 0;height:1px;background:#1e2a3a;position:relative}
.passage-divider::after{content:"· · ·";position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#0a0d14;padding:0 14px;color:#1e3a5f;letter-spacing:8px;font-size:14px}
.is-last .passage-title{color:#ef4444 !important}
.is-last .passage-dot{box-shadow:0 0 10px currentColor}
footer{margin-top:64px;padding-top:24px;border-top:1px solid #1e2a3a;font-family:system-ui,sans-serif;font-size:11px;color:#334155;text-align:center}
</style>
</head>
<body>
<nav id="toc">
  <h2>Contents — \${idxs.length} route\${idxs.length > 1 ? 's' : ''}</h2>
  <ol>\${tocItems}</ol>
</nav>
\${sections}
<footer>UWWFN — \${idxs.length} routes exported from Route Map viewer</footer>
</body>
</html>\`;

  const fname = idxs.length === 1
    ? \`uwwfn-route-\${ROUTES[idxs[0]].n}-\${ROUTES[idxs[0]].e.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.html\`
    : \`uwwfn-\${idxs.length}routes.html\`;
  downloadBlob(html, 'text/html;charset=utf-8', fname);
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function selectRoute(idx) {
  const n = idx + 1;
  history.replaceState(null, '', '#offset/' + n);
  highlightRoute(idx);
}

// ── Hash routing ──────────────────────────────────────────────────────────────
function readHash() {
  const m = location.hash.match(/^#offset\\/([0-9]+)$/);
  if (m) {
    const idx = parseInt(m[1], 10) - 1;
    highlightRoute(idx);
  } else {
    clearHighlight();
  }
}
window.addEventListener('hashchange', readHash);

// ── Search ────────────────────────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', function() {
  const q = this.value.trim().toLowerCase();
  if (!q) { clearSearch(); return; }
  const matches = new Set(NODES.filter(n => n.id.toLowerCase().includes(q)).map(n => n.id));
  nodeElems.selectAll('circle.node-circle').classed('dimmed', d => !matches.has(d.id)).classed('lit', d => matches.has(d.id));
  nodeElems.selectAll('text.node-label').classed('dimmed', d => !matches.has(d.id));
  edgeLines.classed('dimmed', true).classed('lit', false);
});
function clearSearch() {
  if (activeRoute !== null) { highlightRoute(activeRoute); return; }
  nodeElems.selectAll('circle.node-circle').classed('dimmed', false).classed('lit', false);
  nodeElems.selectAll('text.node-label').classed('dimmed', false);
  edgeLines.classed('dimmed', false).classed('lit', false);
}
document.getElementById('search').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.target.value = ''; clearSearch(); }
});

// Click on empty SVG area: clear search and node selection
svg.on('click', () => {
  const s = document.getElementById('search');
  if (s.value) { s.value = ''; clearSearch(); }
  clearNodeSelection();
});

// ── Zoom controls ─────────────────────────────────────────────────────────────
document.getElementById('btn-zoom-in').addEventListener('click', () => svg.transition().duration(300).call(zoom.scaleBy, 1.5));
document.getElementById('btn-zoom-out').addEventListener('click', () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.5));
document.getElementById('btn-reset').addEventListener('click', () => { svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity); fitView(); });

// ── Story export ──────────────────────────────────────────────────────────────

// Find the link in rawContent that targets nextPassage; returns {display, setter} or null
function findLinkInfo(rawContent, nextPassage) {
  const re = /\\[\\[([^\\]|[]+)(?:\\|([^\\][]+))?\\](?:\\[([^\\]]*)\\])?\\]/g;
  let m;
  while ((m = re.exec(rawContent)) !== null) {
    const display = m[1].trim();
    const target  = m[2] ? m[2].trim() : display;
    const setter  = m[3] || '';
    if (target === nextPassage) return { display, setter };
  }
  return null;
}

// Parse $var = "value" / $var = number / $var = true|false from a setter string
function extractSetterVars(setter) {
  const vars = {};
  if (!setter) return vars;
  const re = /\\$(\\w+)\\s*=\\s*(?:"([^"]*)"|([-\\d.]+)|(true|false))/g;
  let m;
  while ((m = re.exec(setter)) !== null) {
    vars[m[1]] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
  }
  return vars;
}

// Parse <<set $var = value>> macros from passage body
function extractContentVars(rawContent) {
  const vars = {};
  const re = /<<set\\s+\\$(\\w+)\\s*=\\s*(?:"([^"]*)"|([-\\d.]+)|(true|false))>>/g;
  let m;
  while ((m = re.exec(rawContent)) !== null) {
    vars[m[1]] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
  }
  return vars;
}

// Replace <span class="var-ref">[name]</span> with resolved value (or keep as-is)
function applyVars(html, vars) {
  return html.replace(/<span class="var-ref">\\[([^\\]]+)\\]<\\/span>/g, (_, name) => {
    const val = vars[name];
    return val !== undefined
      ? \`<span class="var-resolved" title="\${name} = \${escHtml(String(val))}">\${escHtml(String(val))}</span>\`
      : \`<span class="var-ref">[\${name}]</span>\`;
  });
}

function exportRoute() {
  if (activeRoute === null) return;
  const route = ROUTES[activeRoute];
  const endingColor = (typeof ENDING_COLORS !== 'undefined' && ENDING_COLORS[route.e]) || '#ef4444';

  // Walk the route accumulating variable state
  const vars = {};       // live variable state
  const varLog = [];     // [{step, name, val, via}] for the summary table

  // Pre-scan: collect all variable assignments in route order
  const stepInfo = route.p.map((title, i) => {
    const node = nodeById.get(title);
    const raw = node ? (node.content || '') : '';
    const nextTitle = route.p[i + 1] || null;

    // Variables set by <<set>> macros in this passage's body
    const bodyVars = extractContentVars(raw);
    for (const [k, v] of Object.entries(bodyVars)) {
      if (vars[k] !== v) varLog.push({ step: i + 1, name: k, val: v, via: 'set' });
      vars[k] = v;
    }

    // Snapshot vars for rendering THIS passage (after body sets, before setter link)
    const renderVars = { ...vars };

    // Link chosen from this passage → next
    let choiceDisplay = null;
    let setterDesc = [];
    if (nextTitle) {
      const info = findLinkInfo(raw, nextTitle);
      if (info) {
        choiceDisplay = info.display;
        const sv = extractSetterVars(info.setter);
        for (const [k, v] of Object.entries(sv)) {
          if (vars[k] !== v) varLog.push({ step: i + 1, name: k, val: v, via: 'choice' });
          vars[k] = v;
          setterDesc.push(\`\${k} = "\${v}"\`);
        }
      } else {
        // auto-advance (timedgoto) — no setter
        choiceDisplay = null;
      }
    }

    return { title, raw, renderVars, nextTitle, choiceDisplay, setterDesc, isFirst: i === 0, isLast: i === route.p.length - 1 };
  });

  // Build sections HTML
  const sections = stepInfo.map(({ title, raw, renderVars, nextTitle, choiceDisplay, setterDesc, isFirst, isLast }, i) => {
    const node = nodeById.get(title);
    const color = node ? (CAT_COLOR[node.cat] || CAT_COLOR.default) : '#475569';
    const renderedBody = applyVars(renderContent(raw), renderVars);

    let choiceHtml = '';
    if (!isLast && nextTitle) {
      const label = escHtml(choiceDisplay || nextTitle);
      const setterHtml = setterDesc.length
        ? \`<div class="choice-setter">\${setterDesc.map(s => \`<span class="setter-tag">\${escHtml(s)}</span>\`).join('')}</div>\`
        : '';
      choiceHtml = \`<div class="choice-taken"><span class="choice-arrow">▶</span> \${label}\${setterHtml}</div>\`;
    }

    return \`
      <section class="passage-section\${isFirst ? ' is-first' : ''}\${isLast ? ' is-last' : ''}">
        <div class="passage-step">\${isFirst ? 'START · ' : ''}\${i + 1} / \${route.p.length}</div>
        <h2 class="passage-title" style="color:\${color}">
          <span class="passage-dot" style="background:\${color}"></span>
          \${escHtml(title)}
        </h2>
        <div class="passage-body">\${renderedBody}</div>
        \${choiceHtml}
        \${!isLast ? '<div class="passage-divider"></div>' : ''}
      </section>\`;
  }).join('\\n');

  // Variable summary table
  const varSummaryHtml = varLog.length === 0 ? '' : \`
    <details class="var-summary">
      <summary>Variables set in this route (\${Object.keys(vars).length})</summary>
      <table>
        <thead><tr><th>Step</th><th>Variable</th><th>Value</th><th>Via</th></tr></thead>
        <tbody>\${varLog.map(e => \`<tr><td>\${e.step}</td><td class="var-name">\${escHtml(e.name)}</td><td class="var-val">\${escHtml(String(e.val))}</td><td class="var-via">\${e.via}</td></tr>\`).join('')}</tbody>
      </table>
    </details>\`;

  const html = \`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>UWWFN — Route #\${route.n} — \${escHtml(route.e)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{background:#0a0d14;color:#d1d5db;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.8}
body{max-width:740px;margin:0 auto;padding:40px 24px 80px}

header{margin-bottom:36px;padding-bottom:24px;border-bottom:1px solid #1e2a3a}
.story-label{font-family:system-ui,sans-serif;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#475569;margin-bottom:12px}
.story-title{font-size:28px;font-weight:700;color:#f1f5f9;margin-bottom:6px;font-family:system-ui,sans-serif}
.story-meta{font-family:system-ui,sans-serif;font-size:13px;color:#64748b;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.ending-badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid;font-family:system-ui,sans-serif}

/* Variable summary */
.var-summary{font-family:system-ui,sans-serif;font-size:12px;margin-bottom:36px;background:#0d1117;border:1px solid #1e2a3a;border-radius:8px;overflow:hidden}
.var-summary summary{padding:10px 16px;cursor:pointer;color:#94a3b8;font-weight:600;letter-spacing:.04em;list-style:none;user-select:none}
.var-summary summary::-webkit-details-marker{display:none}
.var-summary summary::before{content:"▸ ";color:#475569}
.var-summary[open] summary::before{content:"▾ "}
.var-summary table{width:100%;border-collapse:collapse;font-size:11px}
.var-summary th{padding:6px 12px;background:#111827;color:#64748b;text-align:left;font-weight:600;letter-spacing:.06em;text-transform:uppercase;border-top:1px solid #1e2a3a}
.var-summary td{padding:5px 12px;border-top:1px solid #1e2a3a;color:#94a3b8}
.var-name{color:#a78bfa;font-family:monospace}
.var-val{color:#86efac;font-family:monospace}
.var-via{color:#475569;font-style:italic}

/* Passage */
.passage-section{position:relative}
.passage-step{font-family:system-ui,sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#334155;margin-bottom:10px}
.passage-title{font-family:system-ui,sans-serif;font-size:15px;font-weight:700;margin-bottom:18px;display:flex;align-items:center;gap:10px;line-height:1.4}
.passage-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;display:inline-block}
.passage-body{color:#c9d1d9;line-height:1.9;font-size:16px}
.passage-body br{display:block;content:"";margin-top:.3em}
.passage-body .auto-nav{display:block;margin:10px 0;padding:4px 12px;background:#0f1e0f;border-left:3px solid #22c55e;color:#86efac;font-family:system-ui,sans-serif;font-size:12px;font-style:italic;border-radius:0 4px 4px 0}
.passage-body .branch-mark{color:#334155;font-size:11px;font-family:system-ui,sans-serif;padding:0 4px}
.passage-body .var-ref{color:#a78bfa;font-style:italic;font-family:system-ui,monospace;font-size:13px}
.passage-body .var-resolved{color:#fbbf24;font-weight:700;font-style:normal;font-family:inherit;border-bottom:1px dashed #78350f;cursor:help}
.passage-body b,.passage-body strong{color:#f1f5f9}
.passage-body em,.passage-body i{color:#94a3b8}
.passage-body center{text-align:center;display:block}
.passage-body .choice-chip{display:none}

/* Choice taken */
.choice-taken{margin-top:24px;padding:10px 16px;background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;font-family:system-ui,sans-serif;font-size:13px;font-weight:600;display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}
.choice-arrow{color:#60a5fa;flex-shrink:0}
.choice-taken>:nth-child(2){color:#93c5fd;flex:1}
.choice-setter{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;width:100%;padding-left:20px}
.setter-tag{padding:2px 8px;background:#1a0a2e;border:1px solid #7c3aed44;border-radius:999px;font-size:11px;color:#a78bfa;font-weight:400;font-family:monospace}

.passage-divider{margin:36px 0;border:none;height:1px;background:#1e2a3a;position:relative}
.passage-divider::after{content:"· · ·";position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#0a0d14;padding:0 14px;color:#1e3a5f;letter-spacing:8px;font-size:14px}

.is-last .passage-title{color:#ef4444 !important}
.is-last .passage-dot{box-shadow:0 0 10px currentColor}

footer{margin-top:64px;padding-top:24px;border-top:1px solid #1e2a3a;font-family:system-ui,sans-serif;font-size:11px;color:#334155;text-align:center}
</style>
</head>
<body>
<header>
  <div class="story-label">UWWFN — Story Export</div>
  <div class="story-title">Route #\${route.n}</div>
  <div class="story-meta">
    <span>Ending: <span class="ending-badge" style="color:\${endingColor};border-color:\${endingColor}44;background:\${endingColor}18">\${escHtml(route.e)}</span></span>
    <span>\${route.p.length} passages</span>
    \${Object.keys(vars).length ? \`<span>\${Object.keys(vars).length} variable\${Object.keys(vars).length > 1 ? 's' : ''} set</span>\` : ''}
  </div>
</header>
\${varSummaryHtml}
\${sections}
<footer>UWWFN route #\${route.n} — exported from Route Map viewer</footer>
</body>
</html>\`;

  downloadBlob(html, 'text/html;charset=utf-8', \`uwwfn-route-\${route.n}-\${route.e.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.html\`);
}

// Render passage content as plain readable prose (no titles, no links, no macros)
function renderPlainText(raw, vars) {
  if (!raw || !raw.trim()) return '';
  let s = raw;
  // Drop silent blocks entirely
  s = s.replace(/<<silently>>[\\s\\S]*?<<endsilently>>/g, '');
  // Unwrap timed-insert (keep inner content)
  s = s.replace(/<<timedinsert[^>]*>>/g, '').replace(/<<endtimedinsert>>/g, '');
  // <<print $var>> → resolved value or bare name
  s = s.replace(/<<print\\s+\\$([\\w.]+)>>/g, (_, name) => {
    return vars && vars[name] !== undefined ? String(vars[name]) : name;
  });
  // Strip all remaining macros
  s = s.replace(/<<[^>]+>>/g, '');
  // Strip Twine links entirely (choices are navigation, not prose)
  s = s.replace(/\\[\\[([^\\]|[]+)(?:\\|([^\\][]+))?\\](?:\\[[^\\]]*\\])?\\]/g, '');
  // Strip HTML tags but preserve newlines from <br>
  s = s.replace(/<br\\s*\\/?>/gi, '\\n');
  s = s.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  s = s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  // Twine whitespace suppression marker
  s = s.replace(/\\\\s/g, '');
  // Collapse excess blank lines
  s = s.replace(/\\n{3,}/g, '\\n\\n').trim();
  return s;
}

function exportRouteTxt() {
  if (activeRoute === null) return;
  const route = ROUTES[activeRoute];

  // Accumulate variable state (same walk as HTML export)
  const vars = {};
  const lines = [];
  lines.push(\`UWWFN — Route #\${route.n}\`);
  lines.push(\`Ending: \${route.e}\`);
  lines.push(\`Passages: \${route.p.length}\`);
  lines.push('');
  lines.push('━'.repeat(60));
  lines.push('');

  route.p.forEach((title, i) => {
    const node = nodeById.get(title);
    const raw = node ? (node.content || '') : '';
    const nextTitle = route.p[i + 1] || null;

    // Apply <<set>> vars from this passage
    Object.assign(vars, extractContentVars(raw));

    const prose = renderPlainText(raw, vars);

    if (prose) {
      lines.push(prose);
      lines.push('');
    }

    // Apply setter vars from the chosen link
    if (nextTitle) {
      const info = findLinkInfo(raw, nextTitle);
      if (info && info.setter) Object.assign(vars, extractSetterVars(info.setter));
    }
  });

  lines.push('━'.repeat(60));
  lines.push(\`End of route #\${route.n} — "\${route.e}"\`);

  const txt = lines.join('\\n');
  downloadBlob(txt, 'text/plain;charset=utf-8', \`uwwfn-route-\${route.n}-\${route.e.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.txt\`);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Sidebar collapse ──────────────────────────────────────────────────────────
const sidebarEl = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('btn-sidebar-toggle');
let sidebarExpandedWidth = 240;
let sidebarCollapsed = false;

sidebarToggleBtn.addEventListener('click', () => {
  sidebarCollapsed = !sidebarCollapsed;
  if (sidebarCollapsed) {
    sidebarExpandedWidth = sidebarEl.offsetWidth;
    sidebarEl.classList.add('collapsed');
    sidebarToggleBtn.textContent = '▶';
    sidebarToggleBtn.title = 'Expand sidebar';
  } else {
    sidebarEl.classList.remove('collapsed');
    sidebarEl.style.width = sidebarExpandedWidth + 'px';
    sidebarToggleBtn.textContent = '◀';
    sidebarToggleBtn.title = 'Collapse sidebar';
  }
});

// ── Panel resize helpers ──────────────────────────────────────────────────────
function startDrag(e, onMove, onUp) {
  document.body.style.userSelect = 'none';
  const move = ev => onMove(ev);
  const up = ev => {
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    if (onUp) onUp(ev);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  e.preventDefault();
}

// Left resizer: drags to resize sidebar width
const sidebarResizer = document.getElementById('sidebar-resizer');
sidebarResizer.addEventListener('mousedown', e => {
  const startX = e.clientX;
  const startW = sidebarEl.offsetWidth;
  sidebarResizer.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  startDrag(e,
    ev => {
      if (sidebarCollapsed) return;
      const newW = Math.max(120, Math.min(520, startW + ev.clientX - startX));
      sidebarEl.style.width = newW + 'px';
      sidebarExpandedWidth = newW;
    },
    () => { sidebarResizer.classList.remove('dragging'); document.body.style.cursor = ''; }
  );
});

// Right resizer: drags to resize detail panel width
const detailEl = document.getElementById('detail');
const detailResizer = document.getElementById('detail-resizer');
detailResizer.addEventListener('mousedown', e => {
  const startX = e.clientX;
  const startW = detailEl.offsetWidth;
  detailResizer.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  startDrag(e,
    ev => {
      const newW = Math.max(120, Math.min(600, startW - (ev.clientX - startX)));
      detailEl.style.width = newW + 'px';
    },
    () => { detailResizer.classList.remove('dragging'); document.body.style.cursor = ''; }
  );
});

// Bottom resizer: drags to resize nav-bar height
const navBar = document.getElementById('nav-bar');
const navResizer = document.getElementById('nav-resizer');
navResizer.addEventListener('mousedown', e => {
  const startY = e.clientY;
  const startH = navBar.offsetHeight;
  navResizer.classList.add('dragging');
  document.body.style.cursor = 'row-resize';
  startDrag(e,
    ev => {
      const newH = Math.max(46, Math.min(400, startH + (startY - ev.clientY)));
      navBar.style.height = newH + 'px';
    },
    () => { navResizer.classList.remove('dragging'); document.body.style.cursor = ''; }
  );
});

// ── Legend ────────────────────────────────────────────────────────────────────
function buildLegend() {
  const pairs = [
    ['start', 'Start'],
    ['ending', 'Ending'],
    ['hub', 'Hub (END/credits)'],
    ['den', 'Den'],
    ['kitchen', 'Kitchen'],
    ['bathroom', 'Bathroom'],
    ['dining', 'Dining Room'],
    ['glitch', 'Glitch'],
    ['vague', 'Vague/Horror'],
    ['gameboy', 'Gameboy'],
    ['default', 'Other'],
  ];
  const legend = d3.select('#graph-wrap').append('div')
    .style('position', 'absolute')
    .style('top', '10px')
    .style('right', '60px')
    .style('background', 'rgba(13,17,23,.82)')
    .style('border', '1px solid #1e2a3a')
    .style('border-radius', '8px')
    .style('padding', '8px 12px')
    .style('font-size', '10px')
    .style('line-height', '1.8')
    .style('color', '#94a3b8');

  legend.append('div').style('font-weight', '700').style('color', '#cbd5e1').style('margin-bottom', '4px').text('Node types');
  for (const [cat, label] of pairs) {
    legend.append('div').html(
      \`<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:\${CAT_COLOR[cat]};vertical-align:middle;margin-right:6px"></span>\${label}\`
    );
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
document.getElementById('stat-text').textContent =
  \`\${META.storyPassages} passages · \${EDGES.length} links · \${ROUTES.length} routes · \${META.namedEndingCount} endings\`;

// ── Init ──────────────────────────────────────────────────────────────────────
window._graphMap = Object.fromEntries(NODES.map(n => [n.id, []]));
for (const [s, t] of EDGES) { if (window._graphMap[s]) window._graphMap[s].push(t); }

buildSidebar();
buildLegend();
requestAnimationFrame(() => {
  fitView();
  readHash();
});
</script>
</body>
</html>`;
}

main();
