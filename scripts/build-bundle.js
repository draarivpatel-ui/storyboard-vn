#!/usr/bin/env node
/*
 * Bundles game/script.rpy into assets/script-bundle.js so index.html works
 * both when served over HTTP and when opened directly via file://.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'game', 'script.rpy');
const OUT = path.join(ROOT, 'assets', 'script-bundle.js');

const content = fs.readFileSync(SRC, 'utf8');
const bundle = '/* Generated from game/script.rpy by scripts/build-bundle.js */\n' +
  'window.GLASS_MERIDIAN_SCRIPT = ' + JSON.stringify(content) + ';\n';

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, bundle, 'utf8');
console.log('Bundled game/script.rpy into assets/script-bundle.js (' + bundle.length + ' bytes)');
