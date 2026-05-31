'use strict';

const fs = require('fs');
const path = require('path');

const PASSAGES_PATH = path.join(__dirname, '..', 'data', 'passages.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'analysis.json');

// Tags / names that mark non-story utility passages
const UTILITY_TAGS = new Set(['stylesheet', 'script', 'Twine.image']);
const UTILITY_NAMES = new Set([
  'StoryTitle', 'StoryAuthor', 'StoryInit', 'StorySettings',
  'StoryBanner', 'StoryMenu', 'StorySubtitle',
]);

function isUtility(p) {
  if (UTILITY_NAMES.has(p.title)) return true;
  return p.tags.some((t) => UTILITY_TAGS.has(t));
}

// Build adjacency map: title → [reachable passage titles] (existing only)
function buildGraph(passages) {
  const byTitle = new Map(passages.map((p) => [p.title, p]));
  const graph = new Map();

  for (const p of passages) {
    // Filter links to only known passages (drop broken/external links)
    const validLinks = p.links.filter((l) => byTitle.has(l));
    graph.set(p.title, validLinks);
  }

  return { graph, byTitle };
}

// BFS from start — returns Map<title, distance> for all reachable nodes
function bfs(graph, start) {
  const dist = new Map();
  const queue = [start];
  dist.set(start, 0);
  while (queue.length) {
    const node = queue.shift();
    const d = dist.get(node);
    for (const neighbor of (graph.get(node) || [])) {
      if (!dist.has(neighbor)) {
        dist.set(neighbor, d + 1);
        queue.push(neighbor);
      }
    }
  }
  return dist;
}

// BFS shortest path from start to target — returns path array or null
function shortestPath(graph, start, target) {
  const prev = new Map();
  const queue = [start];
  prev.set(start, null);
  while (queue.length) {
    const node = queue.shift();
    if (node === target) {
      const path = [];
      let cur = target;
      while (cur !== null) { path.unshift(cur); cur = prev.get(cur); }
      return path;
    }
    for (const neighbor of (graph.get(node) || [])) {
      if (!prev.has(neighbor)) {
        prev.set(neighbor, node);
        queue.push(neighbor);
      }
    }
  }
  return null;
}

// DFS to enumerate all simple paths from start to each ending.
// Capped at maxPaths total to avoid combinatorial explosion.
function allSimplePaths(graph, start, endings, maxPaths = 5000) {
  const endingSet = new Set(endings);
  const results = [];
  const stack = [[start, [start], new Set([start])]];

  while (stack.length && results.length < maxPaths) {
    const [node, path, visited] = stack.pop();
    const neighbors = graph.get(node) || [];

    if (endingSet.has(node) && path.length > 1) {
      results.push([...path]);
      continue;
    }

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const newVisited = new Set(visited);
        newVisited.add(neighbor);
        stack.push([neighbor, [...path, neighbor], newVisited]);
      }
    }
  }

  return results;
}

// Count how often each passage appears across all paths (chokepoint analysis)
function chokepoints(allPaths) {
  const count = new Map();
  for (const path of allPaths) {
    for (const node of path) {
      count.set(node, (count.get(node) || 0) + 1);
    }
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([title, freq]) => ({ title, freq }));
}

function main() {
  if (!fs.existsSync(PASSAGES_PATH)) {
    console.error(`passages.json not found. Run:  node src/parse.js`);
    process.exit(1);
  }

  const passages = JSON.parse(fs.readFileSync(PASSAGES_PATH, 'utf8'));
  const storyPassages = passages.filter((p) => !isUtility(p));
  const { graph, byTitle } = buildGraph(passages);

  // Find start — prefer 'Start' (intro screen), then 'START'
  const startTitle = byTitle.has('Start') ? 'Start' : 'START';
  console.log(`Start passage: "${startTitle}"`);

  // BFS to find all reachable passages from Start
  const reachable = bfs(graph, startTitle);
  const reachableSet = new Set(reachable.keys());

  // Game endings = story passages that transition to "END" (the restart/credits hub)
  // This is the game's canonical pattern for ending a playthrough.
  const endingTitles = storyPassages
    .filter((p) => reachableSet.has(p.title) && (graph.get(p.title) || []).includes('END'))
    .map((p) => p.title);

  // Fallback: also include true dead ends (no outgoing links at all) that are reachable
  const trueDeadEnds = storyPassages
    .filter((p) => reachableSet.has(p.title) && (graph.get(p.title) || []).length === 0)
    .map((p) => p.title);

  const allEndingTitles = [...new Set([...endingTitles, ...trueDeadEnds])];

  // Unreachable passages
  const unreachable = storyPassages.filter((p) => !reachableSet.has(p.title));

  console.log(`\nGraph stats:`);
  console.log(`  Total passages   : ${passages.length}`);
  console.log(`  Story passages   : ${storyPassages.length}`);
  console.log(`  Reachable        : ${reachable.size}`);
  console.log(`  Unreachable      : ${unreachable.length}`);
  console.log(`  Named endings    : ${endingTitles.length}`);
  console.log(`  True dead ends   : ${trueDeadEnds.length}`);

  // Shortest paths to each ending
  console.log('\nFinding shortest paths to each ending...');
  const endingDetails = allEndingTitles.map((title) => {
    const sp = shortestPath(graph, startTitle, title);
    const p = byTitle.get(title);
    return {
      title,
      tags: p ? p.tags : [],
      distanceFromStart: reachable.get(title) ?? null,
      shortestPath: sp,
    };
  });

  // All simple paths (capped)
  console.log('Enumerating simple paths (cap: 5000)...');
  const allPaths = allSimplePaths(graph, startTitle, allEndingTitles, 5000);
  const capped = allPaths.length >= 5000;
  console.log(`  Found ${allPaths.length} paths${capped ? ' (cap reached)' : ''}`);

  // Path length distribution
  const lengthDist = {};
  for (const p of allPaths) {
    const l = p.length;
    lengthDist[l] = (lengthDist[l] || 0) + 1;
  }

  // Chokepoint passages (appear in most paths)
  const cp = chokepoints(allPaths).slice(0, 20);

  // Per-ending path counts
  const pathsByEnding = {};
  for (const p of allPaths) {
    const end = p[p.length - 1];
    pathsByEnding[end] = (pathsByEnding[end] || 0) + 1;
  }

  // Tag summary
  const tagSummary = {};
  for (const p of storyPassages) {
    for (const t of p.tags) {
      tagSummary[t] = (tagSummary[t] || 0) + 1;
    }
  }

  const analysis = {
    meta: {
      startPassage: startTitle,
      totalPassages: passages.length,
      storyPassages: storyPassages.length,
      reachableCount: reachable.size,
      unreachableCount: unreachable.length,
      namedEndingCount: endingTitles.length,
      trueDeadEndCount: trueDeadEnds.length,
      totalPathsFound: allPaths.length,
      pathsCapped: capped,
    },
    endings: endingDetails.map((e) => ({
      ...e,
      pathCount: pathsByEnding[e.title] || 0,
    })),
    unreachablePassages: unreachable.map((p) => p.title),
    chokepoints: cp,
    pathLengthDistribution: lengthDist,
    tagSummary,
    // Full passage graph: title → outgoing links
    graph: Object.fromEntries(
      storyPassages.map((p) => [p.title, graph.get(p.title) || []])
    ),
    // Sample of all paths (first 200 stored to keep file manageable)
    samplePaths: allPaths.slice(0, 200),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(analysis, null, 2));
  console.log(`\nAnalysis saved to ${OUTPUT_PATH}`);

  // Print summary
  console.log('\n=== ENDINGS ===');
  for (const e of endingDetails.sort((a, b) => (a.distanceFromStart ?? 999) - (b.distanceFromStart ?? 999))) {
    const paths = pathsByEnding[e.title] || 0;
    console.log(`  [${e.distanceFromStart} steps min] "${e.title}" — ${paths} path(s) — tags: ${e.tags.join(', ') || 'none'}`);
  }

  console.log('\n=== TOP CHOKEPOINTS ===');
  for (const { title, freq } of cp.slice(0, 10)) {
    console.log(`  ${freq.toString().padStart(5)} paths pass through "${title}"`);
  }
}

main();
