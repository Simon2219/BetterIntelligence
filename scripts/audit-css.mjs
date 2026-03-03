#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const stylesRoot = path.join(root, 'src/client/styles');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

const files = walk(stylesRoot).sort();
let hasError = false;

const pxIssues = [];
const selectorMap = new Map();
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');

  const lines = src.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/(^|[^0-9.-])(-?\d*\.?\d+)px\b/.test(line)) {
      pxIssues.push(`${rel}:${idx + 1}: ${line.trim()}`);
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('@')) return;
    if (!trimmed.endsWith('{')) return;
    const selector = trimmed.slice(0, -1).trim();
    if (!selector.startsWith('.') && !selector.startsWith('#')) return;
    const key = selector;
    if (!selectorMap.has(key)) selectorMap.set(key, []);
    selectorMap.get(key).push(`${rel}:${idx + 1}`);
  });
}

const duplicateSelectors = [...selectorMap.entries()]
  .filter(([, refs]) => new Set(refs.map((r) => r.split(':')[0])).size > 1)
  .sort((a, b) => a[0].localeCompare(b[0]));

console.log(`CSS files scanned: ${files.length}`);
console.log(`Raw px matches: ${pxIssues.length}`);
console.log(`Cross-file duplicate selectors: ${duplicateSelectors.length}`);

if (pxIssues.length) {
  hasError = true;
  console.log('\n[px issues]');
  for (const issue of pxIssues.slice(0, 300)) console.log(`- ${issue}`);
  if (pxIssues.length > 300) console.log(`- ... ${pxIssues.length - 300} more`);
}

if (duplicateSelectors.length) {
  hasError = true;
  console.log('\n[duplicate selectors across files]');
  for (const [selector, refs] of duplicateSelectors.slice(0, 300)) {
    console.log(`- ${selector}`);
    for (const ref of refs) console.log(`  - ${ref}`);
  }
  if (duplicateSelectors.length > 300) {
    console.log(`- ... ${duplicateSelectors.length - 300} more selectors`);
  }
}

if (hasError) process.exit(1);
console.log('No issues found.');
