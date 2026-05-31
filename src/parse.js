'use strict';

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'data', 'game.html');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'passages.json');

// Decode HTML entities in passage content
function decodeEntities(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\n/g, '\n');
}

// Extract all [[link]] and [[text|link]] targets from passage content.
// Also handles:
//   Twine setter syntax: [[display|target][$var = value]]
//   Macro navigation:    <<timedgoto "target" Xs>>, <<goto "target">>, <<display "target">>
function extractLinks(rawContent) {
  const links = new Set();

  // --- Standard and setter Twine links ---
  // Matches: [[target]], [[display|target]], [[display|target][setter]]
  // Group 1 = display (or sole target), Group 2 = explicit target after |
  const linkRegex = /\[\[([^\]|[]+)(?:\|([^\][]+))?\](?:\[[^\]]*\])?\]/g;
  let match;
  while ((match = linkRegex.exec(rawContent)) !== null) {
    const display = decodeEntities(match[1].trim());
    const target = match[2] ? decodeEntities(match[2].trim()) : null;
    const dest = target || display;
    if (dest) links.add(dest);
  }

  // --- Macro-based navigation ---
  // Raw HTML encodes " as &quot; and < as &lt; so macros look like:
  //   &lt;&lt;timedgoto &quot;PassageName&quot; 5s&gt;&gt;
  //   &lt;&lt;goto &quot;PassageName&quot;&gt;&gt;
  //   &lt;&lt;display &quot;PassageName&quot;&gt;&gt;
  const macroRegex = /(?:timedgoto|goto|display)\s+&quot;([^&]+)&quot;/g;
  while ((match = macroRegex.exec(rawContent)) !== null) {
    const dest = decodeEntities(match[1].trim());
    if (dest) links.add(dest);
  }

  return [...links];
}

// Parse all <div tiddler="..."> passages from the storeArea
function parsePassages(html) {
  const passages = [];

  // Locate storeArea
  const storeStart = html.indexOf('id="storeArea"');
  if (storeStart === -1) throw new Error('storeArea not found in HTML');

  // Regex to match each tiddler div: attributes then content up to next </div>
  // Passage content is text with HTML-encoded angle brackets — no raw </div> inside
  const tiddlerRegex = /<div\s+tiddler="([^"]+)"([^>]*)>([\s\S]*?)<\/div>/g;
  tiddlerRegex.lastIndex = storeStart;

  let match;
  while ((match = tiddlerRegex.exec(html)) !== null) {
    const title = decodeEntities(match[1]);
    const attrStr = match[2];
    const rawContent = match[3];

    // Parse optional attributes
    const tagsMatch = /\btags="([^"]*)"/.exec(attrStr);
    const posMatch = /\btwine-position="([^"]*)"/.exec(attrStr);
    const createdMatch = /\bcreated="([^"]*)"/.exec(attrStr);

    const tags = tagsMatch ? tagsMatch[1].split(/\s+/).filter(Boolean) : [];
    const position = posMatch
      ? posMatch[1].split(',').map(Number)
      : null;
    const created = createdMatch ? createdMatch[1] : null;

    const content = decodeEntities(rawContent);
    const links = extractLinks(rawContent);

    passages.push({ title, tags, position, created, content, links });
  }

  return passages;
}

function main() {
  if (!fs.existsSync(HTML_PATH)) {
    console.error(`Game HTML not found at ${HTML_PATH}`);
    console.error('Run:  node src/download.js');
    process.exit(1);
  }

  console.log('Reading HTML...');
  const html = fs.readFileSync(HTML_PATH, 'utf8');

  console.log('Parsing passages...');
  const passages = parsePassages(html);
  console.log(`Found ${passages.length} passages`);

  // Basic stats
  const withLinks = passages.filter((p) => p.links.length > 0).length;
  const noLinks = passages.filter((p) => p.links.length === 0).length;
  console.log(`  With outgoing links : ${withLinks}`);
  console.log(`  Dead ends (no links): ${noLinks}`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(passages, null, 2));
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main();
