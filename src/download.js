'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const GAME_URL = 'https://html-classic.itch.zone/html/485403/UWWFN/Files/index.html';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'game.html');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let downloaded = 0;

    https.get(url, (res) => {
      const total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total) {
          const pct = ((downloaded / total) * 100).toFixed(1);
          process.stdout.write(`\rDownloading... ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`\nSaved to ${dest}`);
        resolve(dest);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  if (fs.existsSync(OUTPUT_PATH)) {
    const stat = fs.statSync(OUTPUT_PATH);
    console.log(`Game HTML already exists (${(stat.size / 1024 / 1024).toFixed(1)} MB). Use --force to re-download.`);
    if (!process.argv.includes('--force')) return;
  }

  console.log(`Downloading from:\n  ${GAME_URL}`);
  await download(GAME_URL, OUTPUT_PATH);
}

main().catch((err) => {
  console.error('Download failed:', err.message);
  process.exit(1);
});
