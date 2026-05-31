'use strict';

/**
 * UWWFN Game Route Analyzer
 *
 * Commands:
 *   node index.js download          Download the game HTML
 *   node index.js parse             Parse passages from HTML → data/passages.json
 *   node index.js analyze           Build route graph → data/analysis.json
 *   node index.js all               Run all three steps in sequence
 *   node index.js summary           Print analysis summary from saved data
 *   node index.js path <ending>     Show shortest path to a named ending
 *   node index.js passage <title>   Show passage details and links
 *   node index.js tags              List all tag groups and their passages
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PASSAGES_PATH = path.join(DATA_DIR, 'passages.json');
const ANALYSIS_PATH = path.join(DATA_DIR, 'analysis.json');

function run(script) {
  execSync(`node ${path.join(__dirname, 'src', script)}`, { stdio: 'inherit' });
}

function requireData(file, hint) {
  if (!fs.existsSync(file)) {
    console.error(`Missing: ${file}`);
    if (hint) console.error(`Run: ${hint}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdSummary() {
  const a = requireData(ANALYSIS_PATH, 'node index.js analyze');

  console.log('\n=== UWWFN ROUTE ANALYSIS ===\n');
  console.log('Game stats:');
  console.log(`  Total passages     : ${a.meta.totalPassages}`);
  console.log(`  Story passages     : ${a.meta.storyPassages}`);
  console.log(`  Reachable          : ${a.meta.reachableCount}`);
  console.log(`  Unreachable        : ${a.meta.unreachableCount} (${a.unreachablePassages.join(', ')})`);
  console.log(`  Named endings      : ${a.meta.namedEndingCount}`);
  console.log(`  Paths found        : ${a.meta.totalPathsFound}${a.meta.pathsCapped ? '+' : ''}`);

  console.log('\nEndings (by minimum distance from Start):');
  const sorted = [...a.endings].sort((x, y) => (x.distanceFromStart ?? 999) - (y.distanceFromStart ?? 999));
  for (const e of sorted) {
    const tag = e.tags.length ? ` [${e.tags.join(', ')}]` : '';
    console.log(`  ${String(e.distanceFromStart).padStart(3)} steps | ${String(e.pathCount).padStart(4)} path(s) | "${e.title}"${tag}`);
  }

  console.log('\nTop 10 chokepoints (passages on most routes):');
  for (const { title, freq } of a.chokepoints.slice(0, 10)) {
    const pct = ((freq / a.meta.totalPathsFound) * 100).toFixed(0);
    console.log(`  ${String(freq).padStart(5)} paths (${pct.padStart(3)}%) — "${title}"`);
  }

  console.log('\nPath length distribution (top 10 buckets):');
  const dist = Object.entries(a.pathLengthDistribution)
    .map(([k, v]) => [Number(k), v])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [len, count] of dist) {
    const bar = '█'.repeat(Math.round((count / a.meta.totalPathsFound) * 40));
    console.log(`  ${String(len).padStart(3)} steps: ${String(count).padStart(5)} ${bar}`);
  }

  console.log('\nTag summary:');
  for (const [tag, count] of Object.entries(a.tagSummary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)}  ${tag}`);
  }
}

function cmdPath(endingTitle) {
  const a = requireData(ANALYSIS_PATH, 'node index.js analyze');
  const ending = a.endings.find(
    (e) => e.title.toLowerCase() === endingTitle.toLowerCase()
  );
  if (!ending) {
    console.error(`Ending not found: "${endingTitle}"`);
    console.error('Available endings:');
    a.endings.forEach((e) => console.error(`  "${e.title}"`));
    process.exit(1);
  }

  console.log(`\nShortest path to "${ending.title}" (${ending.distanceFromStart} steps):\n`);
  if (!ending.shortestPath) {
    console.log('  (no path found)');
    return;
  }
  ending.shortestPath.forEach((title, i) => {
    const prefix = i === 0 ? 'START' : i === ending.shortestPath.length - 1 ? ' END ' : `  ${String(i).padStart(3)}`;
    console.log(`  [${prefix}] ${title}`);
  });
}

function cmdPassage(title) {
  const passages = requireData(PASSAGES_PATH, 'node index.js parse');
  const p = passages.find((x) => x.title.toLowerCase() === title.toLowerCase());
  if (!p) {
    console.error(`Passage not found: "${title}"`);
    process.exit(1);
  }
  console.log(`\n=== "${p.title}" ===`);
  console.log(`Tags    : ${p.tags.join(', ') || '(none)'}`);
  console.log(`Position: ${p.position ? p.position.join(', ') : 'unknown'}`);
  console.log(`Links   : ${p.links.length ? p.links.map((l) => `"${l}"`).join(', ') : '(none — dead end)'}`);
  console.log(`\nContent:\n${p.content}`);
}

function cmdTags() {
  const passages = requireData(PASSAGES_PATH, 'node index.js parse');
  const byTag = {};
  for (const p of passages) {
    for (const t of p.tags) {
      if (!byTag[t]) byTag[t] = [];
      byTag[t].push(p.title);
    }
  }
  for (const [tag, titles] of Object.entries(byTag).sort()) {
    console.log(`\n[${tag}] (${titles.length} passage${titles.length > 1 ? 's' : ''})`);
    for (const t of titles) console.log(`  - ${t}`);
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

const [, , cmd, ...args] = process.argv;

switch (cmd) {
  case 'download':
    run('download.js');
    break;
  case 'parse':
    run('parse.js');
    break;
  case 'analyze':
    run('analyze.js');
    break;
  case 'all':
    run('download.js');
    run('parse.js');
    run('analyze.js');
    cmdSummary();
    break;
  case 'summary':
    cmdSummary();
    break;
  case 'path':
    if (!args[0]) { console.error('Usage: node index.js path <ending-title>'); process.exit(1); }
    cmdPath(args.join(' '));
    break;
  case 'passage':
    if (!args[0]) { console.error('Usage: node index.js passage <title>'); process.exit(1); }
    cmdPassage(args.join(' '));
    break;
  case 'tags':
    cmdTags();
    break;
  default:
    console.log([
      'UWWFN Game Route Analyzer',
      '',
      'Usage: node index.js <command> [args]',
      '',
      'Commands:',
      '  all                   Download, parse, analyze, and print summary',
      '  download              Download the game HTML to data/game.html',
      '  parse                 Parse passages → data/passages.json',
      '  analyze               Build route graph → data/analysis.json',
      '  summary               Print analysis summary',
      '  path <ending>         Show shortest path to a named ending',
      '  passage <title>       Show passage content and links',
      '  tags                  List all tag groups',
    ].join('\n'));
}
