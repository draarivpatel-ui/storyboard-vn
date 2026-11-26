'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function attrs(source) {
  const out = {};
  for (const match of source.matchAll(/([:\w-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
    const raw = match[2];
    out[match[1].toLowerCase()] = raw == null ? '' : raw.replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function tags(source) {
  const out = [];
  const re = /<([a-zA-Z][\w-]*)((?:\s+[:\w-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?\s*>/g;
  for (const match of source.matchAll(re)) {
    out.push({ tag: match[1].toLowerCase(), attrs: attrs(match[2] || ''), raw: match[0] });
  }
  return out;
}

function isExternal(ref) {
  return /^(?:https?:)?\/\//i.test(ref.trim());
}

function localRef(ref) {
  const clean = ref.trim();
  if (!clean || clean.startsWith('#') || isExternal(clean) || /^(?:data|blob|mailto|tel|javascript):/i.test(clean)) return null;
  const withoutQuery = clean.split('#', 1)[0].split('?', 1)[0];
  return withoutQuery || null;
}

function resolveLocal(ref, base = ROOT) {
  const clean = localRef(ref);
  if (!clean) return null;
  return path.resolve(base, clean.startsWith('/') ? clean.slice(1) : clean);
}

const pageTags = tags(HTML);

function stylesheetFiles() {
  const files = [];
  for (const tag of pageTags) {
    if (tag.tag !== 'link' || tag.attrs.rel !== 'stylesheet' || !tag.attrs.href) continue;
    const file = resolveLocal(tag.attrs.href);
    if (file) files.push(file);
  }
  return files;
}

function collectCss() {
  const pieces = [...HTML.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const seen = new Set();
  const readSheet = (file) => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    pieces.push(text);
    for (const match of text.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]\s*\)?/gi)) {
      const nested = resolveLocal(match[1], path.dirname(file));
      if (nested) readSheet(nested);
    }
  };
  for (const file of stylesheetFiles()) readSheet(file);
  return pieces.join('\n');
}

function scriptFiles() {
  const files = [];
  for (const tag of pageTags) {
    if (tag.tag !== 'script' || !tag.attrs.src) continue;
    const file = resolveLocal(tag.attrs.src);
    if (file) files.push(file);
  }
  return files;
}

function collectRuntimeJavaScript() {
  const pieces = [...HTML.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const seen = new Set();
  const readScript = (file) => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    pieces.push(text);
    const importRe = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(importRe)) {
      const spec = match[1];
      if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
      const nested = path.resolve(path.dirname(file), spec);
      const candidates = path.extname(nested) ? [nested] : [nested + '.js', nested + '.mjs', path.join(nested, 'index.js'), path.join(nested, 'index.mjs')];
      for (const candidate of candidates) if (fs.existsSync(candidate)) readScript(candidate);
    }
  };
  for (const file of scriptFiles()) readScript(file);
  return pieces.join('\n');
}

test('static integrity: document ids are unique', () => {
  const ids = pageTags.map((tag) => tag.attrs.id).filter(Boolean);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  assert.deepEqual(duplicates, []);
});

test('static integrity: label and ARIA references point at real ids', () => {
  const ids = new Set(pageTags.map((tag) => tag.attrs.id).filter(Boolean));
  const broken = [];
  for (const tag of pageTags) {
    for (const name of ['for', 'aria-controls', 'aria-labelledby', 'aria-describedby']) {
      const value = tag.attrs[name];
      if (!value) continue;
      for (const token of value.split(/\s+/).filter(Boolean)) {
        if (!ids.has(token)) broken.push(`${tag.tag}[${name}] -> ${token}`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

function checkCssAssetRefs(css, base, missing) {
  for (const match of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"]/gi)) {
    const ref = match[1] || match[2];
    if (!ref || ref.startsWith('%23')) continue;
    const file = resolveLocal(ref, base);
    if (file && !fs.existsSync(file)) missing.push(`css ${ref}`);
  }
}

test('static integrity: local HTML and CSS asset paths exist', () => {
  const missing = [];
  const attrByTag = { script: 'src', link: 'href', img: 'src', audio: 'src', video: 'src', source: 'src', track: 'src', iframe: 'src' };
  for (const tag of pageTags) {
    const attr = attrByTag[tag.tag];
    if (!attr || !tag.attrs[attr]) continue;
    const file = resolveLocal(tag.attrs[attr]);
    if (file && !fs.existsSync(file)) missing.push(`${tag.tag} ${tag.attrs[attr]}`);
  }
  for (const match of HTML.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    checkCssAssetRefs(match[1], ROOT, missing);
  }
  const seen = new Set();
  const walkSheet = (file) => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    const base = path.dirname(file);
    checkCssAssetRefs(text, base, missing);
    for (const match of text.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]\s*\)?/gi)) {
      const nested = resolveLocal(match[1], base);
      if (nested) walkSheet(nested);
    }
  };
  for (const file of stylesheetFiles()) walkSheet(file);
  assert.deepEqual(missing, []);
});

test('static integrity: runtime assets have no external CDN dependency', () => {
  const externalAssets = [];
  const attrByTag = { script: 'src', link: 'href', img: 'src', audio: 'src', video: 'src', source: 'src', track: 'src', iframe: 'src' };
  for (const tag of pageTags) {
    const attr = attrByTag[tag.tag];
    if (attr && tag.attrs[attr] && isExternal(tag.attrs[attr])) externalAssets.push(tag.attrs[attr]);
  }
  assert.deepEqual(externalAssets, []);

  const cdn = /(?:https?:)?\/\/(?:cdn\.|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com)/i;
  const runtime = [HTML, collectCss(), collectRuntimeJavaScript()].join('\n');
  assert.equal(cdn.test(runtime), false, 'runtime source references a public CDN');
});

test('static integrity: print and keyboard focus stylesheets exist', () => {
  const css = collectCss();
  assert.match(css, /@media[^{}]*\bprint\b/i);
  assert.ok(css.includes(':focus-visible'), ':focus-visible rule missing');
});
