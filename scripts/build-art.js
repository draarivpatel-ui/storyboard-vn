#!/usr/bin/env node
/*
 * Procedural art for The Glass Meridian.
 *
 * Every background and character layer under game/images/ is written by this
 * script as plain SVG, so the art is reproducible and reviewable as code.
 * It sticks to the SVG subset that Ren'Py renders (NanoSVG): paths, shapes,
 * gradients and opacity. There are no filters, masks, clip paths, <use> or text.
 *
 *   node scripts/build-art.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'game', 'images');

const C = {
  parchment: '#F5F2EA',
  stage: '#EAE4D6',
  ink: '#14181D',
  copper: '#B4532A',
  teal: '#1E5E63',
  brass: '#B8893E',
  brassDark: '#7C5A24',
  tealDeep: '#123F43',
  mist: '#CFDAD5',
  peach: '#EBCDAE',
  stone: '#8C8A82',
  stoneDark: '#5C5B56',
  wood: '#4A3A2C',
  woodLight: '#6A523B',
  glass: '#BFE0DC'
};

function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function n(v) {
  return Math.round(v * 10) / 10;
}

function svg(w, h, defs, body) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">\n' +
    '<defs>\n' + defs + '</defs>\n' + body + '</svg>\n';
}

function lin(id, stops, x1, y1, x2, y2) {
  return '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '">' +
    stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] !== undefined ? ' stop-opacity="' + s[2] + '"' : '') + '/>'; }).join('') +
    '</linearGradient>\n';
}

function rad(id, stops, cx, cy, r) {
  return '<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + cx + '" cy="' + cy + '" r="' + r + '">' +
    stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] !== undefined ? ' stop-opacity="' + s[2] + '"' : '') + '/>'; }).join('') +
    '</radialGradient>\n';
}

function rect(x, y, w, h, fill, extra) {
  return '<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="' + fill + '"' + (extra || '') + '/>\n';
}

function circle(cx, cy, r, fill, extra) {
  return '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="' + fill + '"' + (extra || '') + '/>\n';
}

function ellipse(cx, cy, rx, ry, fill, extra) {
  return '<ellipse cx="' + n(cx) + '" cy="' + n(cy) + '" rx="' + n(rx) + '" ry="' + n(ry) + '" fill="' + fill + '"' + (extra || '') + '/>\n';
}

function poly(points, fill, extra) {
  return '<polygon points="' + points.map(function (p) { return n(p[0]) + ',' + n(p[1]); }).join(' ') + '" fill="' + fill + '"' + (extra || '') + '/>\n';
}

function pathEl(d, fill, extra) {
  return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>\n';
}

function stroke(d, color, width, extra) {
  return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '/>\n';
}

function group(id, inner, extra) {
  return '<g id="' + id + '"' + (extra || '') + '>\n' + inner + '</g>\n';
}

/* A tapered lighthouse with gallery, hood and a lit lamp window. */
function tower(cx, baseY, height, baseW, topW, palette) {
  const topY = baseY - height;
  let s = '';
  s += poly([[cx - baseW / 2, baseY], [cx + baseW / 2, baseY], [cx + topW / 2, topY], [cx - topW / 2, topY]], palette.body);
  s += poly([[cx + baseW * 0.12, baseY], [cx + baseW / 2, baseY], [cx + topW / 2, topY], [cx + topW * 0.12, topY]], palette.shade, ' opacity="0.55"');
  const bands = 3;
  for (let i = 0; i < bands; i++) {
    const t0 = 0.22 + i * 0.24;
    const y0 = baseY - height * t0;
    const w0 = baseW + (topW - baseW) * t0;
    s += rect(cx - w0 / 2, y0 - height * 0.045, w0, height * 0.05, palette.band);
  }
  const winY = topY + height * 0.2;
  s += rect(cx - topW * 0.12, winY, topW * 0.24, height * 0.07, palette.window);
  s += rect(cx - topW * 0.72, topY - 14, topW * 1.44, 16, palette.brass);
  s += rect(cx - topW * 0.62, topY - 54, topW * 1.24, 40, palette.glassFill, ' opacity="0.9"');
  s += rect(cx - topW * 0.62, topY - 54, topW * 1.24, 4, palette.brass);
  for (let i = 0; i < 4; i++) {
    s += rect(cx - topW * 0.62 + i * topW * 0.41, topY - 54, 4, 40, palette.brass);
  }
  s += pathEl('M ' + n(cx - topW * 0.7) + ' ' + n(topY - 54) + ' Q ' + n(cx) + ' ' + n(topY - 120) + ' ' + n(cx + topW * 0.7) + ' ' + n(topY - 54) + ' Z', palette.hood);
  s += rect(cx - 3, topY - 138, 6, 22, palette.brass);
  return s;
}

function sea(y, h, w, seed, top, bottom, ripple, count) {
  const r = rng(seed);
  let s = rect(0, y, w, h, 'url(#' + top + ')');
  for (let i = 0; i < count; i++) {
    const ry = y + 10 + r() * (h - 20);
    const depth = (ry - y) / h;
    const len = 40 + r() * 140 * (0.4 + depth);
    const rx = r() * w;
    s += stroke('M ' + n(rx) + ' ' + n(ry) + ' q ' + n(len / 2) + ' ' + n(-3 - depth * 5) + ' ' + n(len) + ' 0', ripple, n(1 + depth * 2.5), ' opacity="' + n(0.1 + r() * 0.3) + '"');
  }
  return s;
}

function gull(x, y, scale) {
  return stroke('M ' + n(x - 18 * scale) + ' ' + n(y) + ' Q ' + n(x - 8 * scale) + ' ' + n(y - 12 * scale) + ' ' + n(x) + ' ' + n(y) + ' Q ' + n(x + 8 * scale) + ' ' + n(y - 12 * scale) + ' ' + n(x + 18 * scale) + ' ' + n(y), C.ink, n(2.2 * scale), ' opacity="0.7"');
}

function vignette(w, h, strength) {
  return '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="url(#vig)"/>\n';
}

function vigDefs(w, h, strength) {
  return rad('vig', [[0, C.ink, 0], [0.6, C.ink, 0], [1, C.ink, strength]], w / 2, h / 2, Math.sqrt(w * w + h * h) / 2);
}

/* ------------------------------------------------------------------ */
/* Backgrounds                                                         */
/* ------------------------------------------------------------------ */

function bgHarbor() {
  const W = 1920, H = 1080;
  const r = rng(11);
  let defs = '';
  defs += lin('sky', [[0, '#B9CCCB'], [0.55, C.parchment], [1, C.peach]], 0, 0, 0, 640);
  defs += lin('seaTop', [[0, '#7FA9A8'], [0.35, '#3E7F82'], [1, '#17474B']], 0, 640, 0, H);
  defs += rad('sun', [[0, '#F7DCB8', 0.95], [0.4, '#EBA974', 0.45], [1, '#EBA974', 0]], 1260, 600, 300);
  defs += lin('cliff', [[0, '#2B3B3C'], [1, C.ink]], 0, 420, 0, H);
  defs += lin('stairA', [[0, '#9C9A92'], [1, '#6C6B65']], 0, 700, 0, H);
  defs += vigDefs(W, H, 0.55);
  let b = '';
  b += group('sky', rect(0, 0, W, 660, 'url(#sky)') + circle(1260, 600, 300, 'url(#sun)') + circle(1260, 592, 62, '#F2D2A8', ' opacity="0.85"'));
  let clouds = '';
  for (let i = 0; i < 7; i++) {
    const cx = 100 + r() * 1700, cy = 90 + r() * 260;
    clouds += ellipse(cx, cy, 160 + r() * 160, 14 + r() * 16, '#FFFFFF', ' opacity="' + n(0.2 + r() * 0.25) + '"');
  }
  b += group('clouds', clouds);
  b += group('far-hills',
    pathEl('M 0 640 L 0 560 Q 180 500 360 548 Q 520 580 700 530 Q 860 490 1000 560 L 1000 640 Z', '#8DB0AD', ' opacity="0.8"') +
    pathEl('M 0 640 L 0 600 Q 240 560 460 600 Q 640 620 820 590 L 820 640 Z', '#6E9A98', ' opacity="0.9"'));
  b += group('sea', sea(640, 440, W, 21, 'seaTop', 'seaTop', '#D5ECE8', 150));
  b += group('boats',
    pathEl('M 620 700 L 700 700 L 684 716 L 636 716 Z', C.ink, ' opacity="0.85"') + rect(658, 662, 3, 38, C.ink, ' opacity="0.85"') +
    poly([[661, 664], [661, 698], [690, 698]], '#F5F2EA', ' opacity="0.9"') +
    pathEl('M 980 760 L 1070 760 L 1052 778 L 998 778 Z', C.copper, ' opacity="0.9"') + rect(1022, 716, 3, 44, C.ink, ' opacity="0.8"') +
    poly([[1025, 718], [1025, 758], [1056, 758]], '#EAE4D6', ' opacity="0.9"'));
  b += group('cliff',
    pathEl('M 1180 640 L 1250 520 Q 1330 470 1420 470 L 1620 470 Q 1740 480 1800 560 L 1920 620 L 1920 1080 L 1120 1080 Z', 'url(#cliff)') +
    pathEl('M 1250 520 Q 1330 470 1420 470 L 1620 470 Q 1700 470 1740 500 Q 1640 520 1500 516 Q 1360 512 1250 520 Z', '#3E5A52', ' opacity="0.8"'));
  b += group('tower', tower(1500, 486, 330, 130, 84, { body: '#F3EFE6', shade: '#B9B2A2', band: C.copper, window: '#F2C98A', brass: C.brass, glassFill: '#CDE7E3', hood: C.copper }));
  b += group('gulls', gull(420, 220, 1.1) + gull(520, 260, 0.8) + gull(1020, 180, 0.9) + gull(1650, 300, 0.7));
  let steps = '';
  for (let i = 0; i < 7; i++) {
    const y = 780 + i * 46;
    const x0 = i * 52;
    steps += poly([[x0, y], [x0 + 760 - i * 40, y], [x0 + 760 - i * 40, y + 46], [x0, y + 46]], i % 2 ? '#8C8A82' : '#9C9A92');
    steps += poly([[x0, y], [x0 + 760 - i * 40, y], [x0 + 760 - i * 40, y + 8], [x0, y + 8]], '#B9B6AB');
  }
  steps = pathEl('M 0 760 L 0 1080 L 560 1080 L 760 780 Z', 'url(#stairA)') + steps;
  b += group('stair', steps);
  b += group('rail', stroke('M 40 760 L 320 700 L 760 690', C.ink, 6) + rect(36, 700, 7, 90, C.ink) + rect(320, 640, 7, 70, C.ink) + circle(40, 698, 8, C.brass) + circle(323, 638, 8, C.brass));
  b += group('mist', rect(0, 600, W, 90, '#FFFFFF', ' opacity="0.08"'));
  b += vignette(W, H);
  return svg(W, H, defs, b);
}

function bgArchive() {
  const W = 1920, H = 1080;
  const r = rng(23);
  let defs = '';
  defs += lin('wall', [[0, '#3A3026'], [1, '#14181D']], 0, 0, 0, H);
  defs += lin('floor', [[0, '#2A241D'], [1, '#0E1115']], 0, 720, 0, H);
  defs += rad('lampA', [[0, '#F2B476', 0.75], [0.5, '#B4532A', 0.25], [1, '#B4532A', 0]], 520, 330, 420);
  defs += rad('lampB', [[0, '#F2B476', 0.7], [0.5, '#B4532A', 0.22], [1, '#B4532A', 0]], 1500, 300, 420);
  defs += rad('desk', [[0, '#F7E2B8', 0.6], [1, '#F7E2B8', 0]], 1010, 700, 260);
  defs += vigDefs(W, H, 0.7);
  let b = rect(0, 0, W, H, 'url(#wall)');
  let drawers = '';
  const cols = 16, rows = 8;
  const dw = W / cols;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * dw + 6, y = 70 + row * 78;
      const tone = (row + col) % 3 === 0 ? '#54402F' : (row + col) % 3 === 1 ? '#4A3A2C' : '#5C4733';
      drawers += rect(x, y, dw - 12, 68, tone, ' rx="4"');
      drawers += rect(x + 8, y + 8, dw - 28, 52, 'none', ' stroke="#2E241B" stroke-width="2" rx="3"');
      drawers += rect(x + (dw - 12) / 2 - 18, y + 24, 36, 8, '#EAE4D6', ' opacity="0.8" rx="2"');
      drawers += circle(x + (dw - 12) / 2, y + 44, 5, C.brass);
    }
  }
  b += group('drawers', drawers);
  let arches = '';
  for (let i = 0; i <= 4; i++) {
    const x = i * (W / 4);
    arches += rect(x - 26, 0, 52, 700, '#1B1713');
    arches += rect(x - 36, 0, 72, 40, C.brassDark);
  }
  arches += rect(0, 0, W, 54, '#1B1713') + rect(0, 40, W, 8, C.brass);
  b += group('arches', arches);
  b += group('rail', rect(0, 400, W, 8, C.brass, ' opacity="0.9"') + rect(0, 408, W, 4, C.brassDark));
  b += group('floor', poly([[0, 720], [W, 720], [W, H], [0, H]], 'url(#floor)') +
    (function () {
      let lines = '';
      for (let i = -6; i <= 6; i++) lines += stroke('M ' + (960 + i * 90) + ' 720 L ' + (960 + i * 260) + ' ' + H, '#3A3026', 2, ' opacity="0.8"');
      for (let j = 0; j < 6; j++) lines += rect(0, 740 + j * j * 10 + j * 8, W, 2, '#3A3026', ' opacity="0.7"');
      return lines;
    })());
  b += group('lamps', circle(520, 330, 420, 'url(#lampA)') + circle(1500, 300, 420, 'url(#lampB)') +
    rect(508, 70, 24, 190, C.ink) + circle(520, 280, 38, '#F2C98A') + circle(520, 280, 20, '#FFF1D2') +
    rect(1488, 70, 24, 170, C.ink) + circle(1500, 260, 38, '#F2C98A') + circle(1500, 260, 20, '#FFF1D2'));
  b += group('lectern',
    poly([[860, 640], [1160, 640], [1130, 940], [890, 940]], '#3B2C20') +
    poly([[830, 600], [1190, 600], [1160, 650], [860, 650]], '#6A523B') +
    poly([[900, 580], [1010, 560], [1010, 612], [900, 628]], C.parchment) +
    poly([[1010, 560], [1120, 580], [1120, 628], [1010, 612]], '#EAE4D6') +
    stroke('M 1010 560 L 1010 612', '#9C8F77', 2) +
    stroke('M 920 590 L 995 576 M 920 604 L 995 590 M 1026 576 L 1100 592 M 1026 590 L 1100 606', '#9C8F77', 2, ' opacity="0.7"') +
    circle(1010, 700, 260, 'url(#desk)'));
  let dust = '';
  for (let i = 0; i < 70; i++) dust += circle(r() * W, 100 + r() * 800, 1 + r() * 2.2, '#F7E2B8', ' opacity="' + n(0.12 + r() * 0.3) + '"');
  b += group('dust', dust);
  b += vignette(W, H);
  return svg(W, H, defs, b);
}

function bgWorkshop() {
  const W = 1920, H = 1080;
  const r = rng(37);
  let defs = '';
  defs += lin('wall', [[0, '#41352A'], [1, '#1D1812']], 0, 0, 0, H);
  defs += lin('bench', [[0, '#7A5E42'], [1, '#4A3826']], 0, 760, 0, 900);
  defs += lin('window', [[0, '#7FA9A8'], [0.6, '#C8D9D2'], [1, '#EBCDAE']], 0, 130, 0, 560);
  defs += rad('lamp', [[0, '#F4BE80', 0.8], [0.5, '#B4532A', 0.25], [1, '#B4532A', 0]], 1010, 120, 640);
  defs += rad('prism', [[0, '#F7E9C8', 0.5], [1, '#F7E9C8', 0]], 960, 640, 200);
  defs += lin('glassP', [[0, '#DDF2EE', 0.85], [1, '#6FB0B2', 0.55]], 880, 500, 1040, 700);
  defs += vigDefs(W, H, 0.7);
  let b = rect(0, 0, W, H, 'url(#wall)');
  let planks = '';
  for (let i = 0; i < 24; i++) planks += rect(i * 80, 0, 3, H, '#000000', ' opacity="0.25"');
  b += group('planks', planks);
  b += group('window', rect(120, 130, 440, 430, '#1B1813') + rect(140, 150, 400, 390, 'url(#window)') +
    pathEl('M 140 420 Q 250 400 340 424 Q 440 440 540 416 L 540 540 L 140 540 Z', '#3E7F82') +
    pathEl('M 140 470 Q 260 450 340 474 Q 450 490 540 466 L 540 540 L 140 540 Z', '#2B6A6E') +
    rect(336, 150, 8, 390, '#1B1813') + rect(140, 340, 400, 8, '#1B1813') + gull(250, 250, 0.8));
  b += group('pegboard', rect(1380, 150, 440, 420, '#33291F') +
    (function () {
      let t = '';
      const tools = [
        function (x) { return rect(x, 190, 14, 150, C.stoneDark) + rect(x - 14, 180, 42, 28, C.brassDark); },
        function (x) { return rect(x, 200, 10, 190, C.stone) + poly([[x - 12, 380], [x + 22, 380], [x + 5, 430]], C.stoneDark); },
        function (x) { return circle(x + 8, 270, 46, 'none', ' stroke="' + C.brass + '" stroke-width="10"') + rect(x + 4, 316, 8, 80, C.brass); },
        function (x) { return rect(x, 190, 12, 220, C.copper) + rect(x - 10, 190, 32, 18, C.ink); },
        function (x) { return poly([[x, 200], [x + 44, 200], [x + 30, 330], [x + 14, 330]], C.stoneDark) + rect(x + 16, 330, 12, 90, C.woodLight); }
      ];
      tools.forEach(function (fn, i) { t += fn(1430 + i * 78); });
      t += rect(1380, 460, 440, 10, C.brassDark);
      return t;
    })());
  b += group('shelf', rect(120, 640, 560, 14, C.woodLight) +
    circle(210, 600, 36, C.brass, ' opacity="0.95"') + circle(210, 600, 24, '#2B3B3C') + stroke('M 210 600 L 228 582', C.parchment, 4) +
    rect(300, 560, 70, 80, '#2B3B3C') + rect(310, 570, 50, 40, '#F2C98A', ' opacity="0.7"') +
    pathEl('M 440 640 L 440 590 Q 440 560 480 560 Q 520 560 520 590 L 520 640 Z', C.copper) + rect(456, 540, 48, 22, C.brassDark) +
    circle(600, 616, 24, '#6FB0B2', ' opacity="0.8"'));
  b += group('lamp', circle(1010, 120, 640, 'url(#lamp)') + rect(1004, 0, 12, 110, C.ink) + pathEl('M 940 160 Q 1010 70 1080 160 Z', C.copper) + circle(1010, 168, 18, '#FFE5B0'));
  b += group('bench', poly([[0, 780], [W, 780], [W, 960], [0, 960]], 'url(#bench)') + rect(0, 770, W, 18, '#8A6C4C') +
    rect(80, 960, 90, 120, '#2A2018') + rect(1750, 960, 90, 120, '#2A2018') + rect(0, 960, W, 120, '#14110D'));
  b += group('cradle', poly([[800, 770], [1120, 770], [1090, 720], [830, 720]], C.brassDark) + rect(840, 700, 240, 22, C.brass) +
    rect(830, 718, 12, 54, C.brassDark) + rect(1078, 718, 12, 54, C.brassDark) +
    stroke('M 900 722 L 922 722', '#E5C27E', 3) + circle(960, 640, 200, 'url(#prism)'));
  b += group('prism', poly([[960, 470], [1060, 700], [860, 700]], 'url(#glassP)') +
    poly([[960, 470], [960, 700], [860, 700]], '#FFFFFF', ' opacity="0.18"') +
    stroke('M 960 470 L 1060 700 L 860 700 Z', '#E8F7F3', 3, ' opacity="0.9"') +
    stroke('M 760 560 L 910 610', '#F7E9C8', 3, ' opacity="0.9"') +
    stroke('M 1008 615 L 1260 560', '#B4532A', 5, ' opacity="0.85"') +
    stroke('M 1008 625 L 1280 640', '#F2C98A', 4, ' opacity="0.75"') +
    stroke('M 1002 636 L 1260 730', '#6FB0B2', 4, ' opacity="0.75"'));
  let bits = '';
  for (let i = 0; i < 30; i++) bits += circle(r() * W, 780 + r() * 70, 1.5 + r() * 2.5, '#F0D9A8', ' opacity="' + n(0.2 + r() * 0.4) + '"');
  b += group('shavings', bits);
  b += vignette(W, H);
  return svg(W, H, defs, b);
}

function bgStorm() {
  const W = 1920, H = 1080;
  const r = rng(51);
  let defs = '';
  defs += lin('sky', [[0, '#090C10'], [0.5, '#16222B'], [1, '#2C4A52']], 0, 0, 0, 720);
  defs += lin('sea', [[0, '#1E4A50'], [1, '#0A1317']], 0, 700, 0, H);
  defs += lin('beam', [[0, '#F7DCB0', 0.8], [1, '#F7DCB0', 0]], 1450, 250, 120, 330);
  defs += rad('lampGlow', [[0, '#FFE3AE', 0.95], [0.4, '#F0A868', 0.4], [1, '#F0A868', 0]], 1450, 250, 260);
  defs += lin('cliff', [[0, '#0F1519'], [1, '#05080A']], 0, 500, 0, H);
  defs += vigDefs(W, H, 0.6);
  let b = rect(0, 0, W, 720, 'url(#sky)');
  let clouds = '';
  for (let i = 0; i < 16; i++) clouds += ellipse(r() * W, 60 + r() * 380, 180 + r() * 260, 36 + r() * 48, i % 3 === 0 ? '#3C5862' : '#0E161C', ' opacity="' + n(0.35 + r() * 0.4) + '"');
  b += group('clouds', clouds);
  b += group('lightning', stroke('M 640 0 L 600 150 L 650 160 L 590 320 L 640 330 L 560 520', '#F4F0DC', 7, ' opacity="0.9"') +
    stroke('M 600 150 L 540 230', '#F4F0DC', 3, ' opacity="0.7"') + circle(600, 260, 220, 'url(#lampGlow)', ' opacity="0.25"'));
  b += group('sea', rect(0, 700, W, 380, 'url(#sea)') + (function () {
    let w = '';
    for (let i = 0; i < 14; i++) {
      const y = 720 + i * 26;
      const amp = 8 + i * 2.2;
      let d = 'M -40 ' + y;
      for (let x = -40; x < W + 80; x += 120) d += ' q 30 ' + (-amp) + ' 60 0 t 60 0';
      w += stroke(d, i % 2 ? '#7FB4B6' : '#2C5F66', 2 + i * 0.4, ' opacity="' + n(0.25 + i * 0.03) + '"');
    }
    return w;
  })());
  b += group('cliff', pathEl('M 1160 760 L 1250 600 Q 1340 540 1450 540 L 1640 540 Q 1760 560 1830 640 L 1920 700 L 1920 1080 L 1080 1080 Z', 'url(#cliff)'));
  b += group('beam', poly([[1450, 252], [0, 120], [0, 420]], 'url(#beam)', ' opacity="0.8"') + circle(1450, 250, 260, 'url(#lampGlow)'));
  b += group('tower', tower(1450, 548, 400, 140, 88, { body: '#1D2830', shade: '#0A1014', band: '#3B2018', window: '#F2C98A', brass: '#5C4520', glassFill: '#FFE3AE', hood: '#2A1A15' }) +
    rect(1394, 296, 112, 28, '#FFE3AE', ' opacity="0.9"'));
  let foam = '';
  for (let i = 0; i < 40; i++) foam += stroke('M ' + n(r() * W) + ' ' + n(740 + r() * 300) + ' q 20 -10 40 0', '#E8F4F1', 2.5, ' opacity="' + n(0.3 + r() * 0.4) + '"');
  b += group('foam', foam);
  let rain = '';
  for (let i = 0; i < 520; i++) {
    const x = r() * (W + 400) - 200, y = r() * H, len = 40 + r() * 70;
    rain += '<line x1="' + n(x) + '" y1="' + n(y) + '" x2="' + n(x - len * 0.35) + '" y2="' + n(y + len) + '" stroke="#B9D6D6" stroke-width="' + n(1 + r() * 1.4) + '" opacity="' + n(0.16 + r() * 0.3) + '"/>\n';
  }
  b += group('rain', rain);
  b += vignette(W, H);
  return svg(W, H, defs, b);
}

function bgLens() {
  const W = 1920, H = 1080;
  const r = rng(67);
  let defs = '';
  defs += lin('wall', [[0, '#0B1013'], [1, '#1B2A2E']], 0, 0, 0, H);
  defs += rad('glass', [[0, '#DDF2EE', 0.55], [0.55, '#7FB9BA', 0.4], [1, '#1E5E63', 0.55]], 960, 500, 330);
  defs += rad('halo', [[0, '#F7DCB0', 0.55], [1, '#F7DCB0', 0]], 960, 500, 560);
  defs += lin('floor', [[0, '#1B2A2E'], [1, '#080C0E']], 0, 840, 0, H);
  defs += lin('beam', [[0, '#FFF1D2', 0], [0.5, '#FFF1D2', 0.95], [1, '#FFF1D2', 0]], 0, 500, W, 500);
  defs += vigDefs(W, H, 0.75);
  let b = rect(0, 0, W, H, 'url(#wall)');
  let panes = '';
  for (let i = 0; i < 7; i++) {
    const x = 70 + i * 262;
    panes += rect(x, 90, 200, 560, '#07101A');
    for (let s = 0; s < 22; s++) panes += circle(x + 10 + r() * 180, 100 + r() * 540, 0.8 + r() * 2.1, '#F7EEDB', ' opacity="' + n(0.3 + r() * 0.7) + '"');
    panes += rect(x - 12, 90, 12, 560, C.brassDark) + rect(x + 200, 90, 12, 560, C.brassDark);
  }
  b += group('panes', panes + rect(0, 70, W, 24, C.brass) + rect(0, 648, W, 18, C.brassDark));
  b += group('halo', circle(960, 500, 560, 'url(#halo)'));
  let rings = '';
  [330, 290, 250, 210, 170, 130, 90].forEach(function (rr, i) {
    rings += circle(960, 500, rr, i === 0 ? 'url(#glass)' : 'none', ' stroke="' + (i % 2 ? '#E8F7F3' : C.brass) + '" stroke-width="' + (i === 0 ? 18 : 4) + '" opacity="' + (i === 0 ? 1 : 0.55) + '"');
  });
  b += group('lens', rings +
    stroke('M 960 170 L 960 830 M 630 500 L 1290 500 M 727 267 L 1193 733 M 1193 267 L 727 733', C.brass, 3, ' opacity="0.5"') +
    circle(960, 500, 26, C.brass) + circle(960, 500, 12, '#FFF1D2'));
  b += group('hood', pathEl('M 560 90 Q 960 -120 1360 90 Z', C.copper, ' opacity="0.95"') + pathEl('M 700 90 Q 960 -40 1220 90 Z', '#8E3E1E') + rect(940, -10, 40, 60, C.brass));
  b += group('beam', rect(0, 494, W, 12, 'url(#beam)') + rect(0, 498, W, 4, '#FFFFFF', ' opacity="0.85"'));
  b += group('floor', poly([[0, 840], [W, 840], [W, H], [0, H]], 'url(#floor)') +
    ellipse(960, 900, 520, 46, '#F7DCB0', ' opacity="0.18"') + rect(0, 836, W, 8, C.brass));
  b += group('pedestal', poly([[820, 840], [1100, 840], [1060, 760], [860, 760]], '#2B3B3C') + rect(900, 700, 120, 60, C.brassDark) + rect(940, 650, 40, 52, C.brass));
  b += vignette(W, H);
  return svg(W, H, defs, b);
}

function bgDawn() {
  const W = 1920, H = 1080;
  const r = rng(79);
  let defs = '';
  defs += lin('sky', [[0, '#1E3A44'], [0.35, '#4F7F83'], [0.7, '#E6B98A'], [1, '#F7D9A6']], 0, 0, 0, 640);
  defs += lin('sea', [[0, '#F0C890'], [0.2, '#6FA0A2'], [1, '#17474B']], 0, 640, 0, H);
  defs += rad('sun', [[0, '#FFF1D2', 0.95], [0.35, '#F7C58A', 0.55], [1, '#F7C58A', 0]], 1080, 640, 520);
  defs += lin('streak', [[0, '#FFF1D2', 0.85], [1, '#FFF1D2', 0]], 0, 640, 0, 1000);
  defs += lin('cliff', [[0, '#1C2E31'], [1, '#0A1315']], 0, 480, 0, H);
  defs += vigDefs(W, H, 0.45);
  let b = rect(0, 0, W, 660, 'url(#sky)');
  b += group('sun', circle(1080, 640, 520, 'url(#sun)') + circle(1080, 640, 84, '#FFF1D2', ' opacity="0.95"'));
  let clouds = '';
  for (let i = 0; i < 8; i++) clouds += ellipse(120 + r() * 1700, 140 + r() * 360, 140 + r() * 220, 10 + r() * 14, i % 2 ? '#F7C58A' : '#F5E3CC', ' opacity="' + n(0.3 + r() * 0.3) + '"');
  b += group('clouds', clouds);
  b += group('sea', sea(640, 440, W, 83, 'sea', 'sea', '#FFF1D2', 130) + poly([[1020, 640], [1140, 640], [1260, 1000], [900, 1000]], 'url(#streak)', ' opacity="0.7"'));
  b += group('cliff', pathEl('M 0 560 Q 160 440 340 430 L 560 430 Q 700 450 760 560 L 900 700 L 900 1080 L 0 1080 Z', 'url(#cliff)'));
  b += group('tower', tower(330, 440, 300, 120, 78, { body: '#243A3E', shade: '#0A1315', band: '#7A3A1E', window: '#F2C98A', brass: '#8C6A2C', glassFill: '#F7D9A6', hood: '#7A3A1E' }));
  b += group('gulls', gull(1280, 320, 1.1) + gull(1400, 260, 0.9) + gull(1500, 360, 0.7) + gull(1180, 240, 0.8));
  b += group('post', rect(1650, 760, 18, 320, C.ink) + circle(1659, 756, 16, C.ink) + stroke('M 1659 790 Q 1500 860 1380 840', '#2B2218', 5));
  b += vignette(W, H);
  return svg(W, H, defs, b);
}

/* ------------------------------------------------------------------ */
/* Characters. Each figure is a body layer plus one face layer per      */
/* expression, drawn on the same 520 by 900 canvas.                     */
/* ------------------------------------------------------------------ */

const FACE = { cx: 260, cy: 282, rx: 90, ry: 112 };

function bodyLayer(cfg) {
  let s = '';
  s += cfg.hairBack;
  s += rect(226, 372, 68, 100, cfg.skinShade);
  s += pathEl('M 40 900 L 56 560 Q 70 480 190 452 L 330 452 Q 450 480 464 560 L 480 900 Z', cfg.coat);
  s += pathEl('M 190 452 Q 260 520 330 452 L 306 440 Q 260 480 214 440 Z', cfg.collar);
  s += cfg.coatDetail;
  s += pathEl('M 226 430 Q 260 472 294 430 L 294 380 L 226 380 Z', cfg.skin);
  s += cfg.neckwear;
  return svg(520, 900, '', s);
}

function faceBase(cfg) {
  let s = '';
  s += ellipse(FACE.cx - FACE.rx - 2, FACE.cy + 8, 14, 24, cfg.skin);
  s += ellipse(FACE.cx + FACE.rx + 2, FACE.cy + 8, 14, 24, cfg.skin);
  s += ellipse(FACE.cx, FACE.cy, FACE.rx, FACE.ry, cfg.skin);
  s += pathEl('M 190 330 Q 260 400 330 330 Q 300 392 260 394 Q 220 392 190 330 Z', cfg.skinShade, ' opacity="0.35"');
  return s;
}

function eyes(kind, cfg) {
  const L = 218, R = 302, y = 282;
  const iris = cfg.iris;
  let s = '';
  function open(cx, ry) {
    return ellipse(cx, y, 15, ry, '#F8F4EA') + circle(cx, y + 1, Math.min(ry, 8.5), iris) + circle(cx, y + 1, 4, '#0B0E11') + circle(cx - 2.5, y - 2, 1.8, '#FFFFFF');
  }
  if (kind === 'open') s += open(L, 12) + open(R, 12);
  else if (kind === 'wide') s += open(L, 14) + open(R, 14);
  else if (kind === 'narrow') {
    s += open(L, 8) + open(R, 8);
    s += pathEl('M ' + (L - 16) + ' ' + (y - 1) + ' Q ' + L + ' ' + (y - 14) + ' ' + (L + 16) + ' ' + (y - 1) + ' L ' + (L + 16) + ' ' + (y - 5) + ' Q ' + L + ' ' + (y - 18) + ' ' + (L - 16) + ' ' + (y - 5) + ' Z', cfg.skin);
    s += pathEl('M ' + (R - 16) + ' ' + (y - 1) + ' Q ' + R + ' ' + (y - 14) + ' ' + (R + 16) + ' ' + (y - 1) + ' L ' + (R + 16) + ' ' + (y - 5) + ' Q ' + R + ' ' + (y - 18) + ' ' + (R - 16) + ' ' + (y - 5) + ' Z', cfg.skin);
  } else if (kind === 'happy') {
    s += stroke('M ' + (L - 14) + ' ' + (y + 4) + ' Q ' + L + ' ' + (y - 14) + ' ' + (L + 14) + ' ' + (y + 4), cfg.line, 5);
    s += stroke('M ' + (R - 14) + ' ' + (y + 4) + ' Q ' + R + ' ' + (y - 14) + ' ' + (R + 14) + ' ' + (y + 4), cfg.line, 5);
  }
  return s;
}

function brows(kind, cfg) {
  const L = 218, R = 302, y = 250;
  const w = cfg.browWidth || 6;
  const c = cfg.browColor;
  const map = {
    calm: ['M ' + (L - 20) + ' ' + (y + 2) + ' Q ' + L + ' ' + (y - 8) + ' ' + (L + 20) + ' ' + (y + 1), 'M ' + (R - 20) + ' ' + (y + 1) + ' Q ' + R + ' ' + (y - 8) + ' ' + (R + 20) + ' ' + (y + 2)],
    worried: ['M ' + (L - 20) + ' ' + (y + 8) + ' Q ' + (L + 6) + ' ' + (y - 2) + ' ' + (L + 20) + ' ' + (y - 8), 'M ' + (R - 20) + ' ' + (y - 8) + ' Q ' + (R - 6) + ' ' + (y - 2) + ' ' + (R + 20) + ' ' + (y + 8)],
    smile: ['M ' + (L - 20) + ' ' + (y - 2) + ' Q ' + L + ' ' + (y - 14) + ' ' + (L + 20) + ' ' + (y - 2), 'M ' + (R - 20) + ' ' + (y - 2) + ' Q ' + R + ' ' + (y - 14) + ' ' + (R + 20) + ' ' + (y - 2)],
    flat: ['M ' + (L - 22) + ' ' + (y + 6) + ' L ' + (L + 22) + ' ' + (y + 2), 'M ' + (R - 22) + ' ' + (y + 2) + ' L ' + (R + 22) + ' ' + (y + 6)],
    smirk: ['M ' + (L - 20) + ' ' + (y + 4) + ' Q ' + L + ' ' + (y - 2) + ' ' + (L + 20) + ' ' + (y + 2), 'M ' + (R - 20) + ' ' + (y - 6) + ' Q ' + R + ' ' + (y - 20) + ' ' + (R + 20) + ' ' + (y - 8)],
    soft: ['M ' + (L - 20) + ' ' + (y + 2) + ' Q ' + L + ' ' + (y - 10) + ' ' + (L + 20) + ' ' + (y + 2), 'M ' + (R - 20) + ' ' + (y + 2) + ' Q ' + R + ' ' + (y - 10) + ' ' + (R + 20) + ' ' + (y + 2)],
    stern: ['M ' + (L - 24) + ' ' + (y - 4) + ' L ' + (L + 22) + ' ' + (y + 6), 'M ' + (R - 22) + ' ' + (y + 6) + ' L ' + (R + 24) + ' ' + (y - 4)]
  };
  return stroke(map[kind][0], c, w) + stroke(map[kind][1], c, w);
}

function mouth(kind, cfg) {
  const x = 260, y = 346;
  const lip = cfg.lip;
  switch (kind) {
    case 'calm': return stroke('M ' + (x - 20) + ' ' + y + ' Q ' + x + ' ' + (y + 5) + ' ' + (x + 20) + ' ' + y, lip, 5);
    case 'worried': return stroke('M ' + (x - 18) + ' ' + (y + 6) + ' Q ' + x + ' ' + (y - 6) + ' ' + (x + 18) + ' ' + (y + 6), lip, 5);
    case 'smile': return pathEl('M ' + (x - 28) + ' ' + (y - 4) + ' Q ' + x + ' ' + (y + 30) + ' ' + (x + 28) + ' ' + (y - 4) + ' Q ' + x + ' ' + (y + 6) + ' ' + (x - 28) + ' ' + (y - 4) + ' Z', '#7A2E22') + stroke('M ' + (x - 28) + ' ' + (y - 4) + ' Q ' + x + ' ' + (y + 12) + ' ' + (x + 28) + ' ' + (y - 4), lip, 4);
    case 'flat': return stroke('M ' + (x - 20) + ' ' + y + ' L ' + (x + 20) + ' ' + y, lip, 5);
    case 'smirk': return stroke('M ' + (x - 18) + ' ' + (y + 4) + ' Q ' + (x + 4) + ' ' + (y + 6) + ' ' + (x + 24) + ' ' + (y - 8), lip, 5);
    case 'open': return ellipse(x, y + 2, 12, 9, '#7A2E22') + stroke('M ' + (x - 16) + ' ' + (y - 2) + ' Q ' + x + ' ' + (y - 8) + ' ' + (x + 16) + ' ' + (y - 2), lip, 3);
    case 'thin': return stroke('M ' + (x - 22) + ' ' + (y + 2) + ' L ' + (x + 22) + ' ' + (y + 2), lip, 4);
    case 'soft': return stroke('M ' + (x - 20) + ' ' + (y - 2) + ' Q ' + x + ' ' + (y + 12) + ' ' + (x + 20) + ' ' + (y - 2), lip, 5);
    case 'grave': return stroke('M ' + (x - 22) + ' ' + (y + 8) + ' Q ' + x + ' ' + (y - 6) + ' ' + (x + 22) + ' ' + (y + 8), lip, 5);
    default: return '';
  }
}

function faceLayer(cfg, expr) {
  let s = faceBase(cfg);
  s += cfg.cheek ? ellipse(206, 322, 16, 8, cfg.cheek, ' opacity="' + (expr.blush || 0.18) + '"') + ellipse(314, 322, 16, 8, cfg.cheek, ' opacity="' + (expr.blush || 0.18) + '"') : '';
  s += eyes(expr.eyes, cfg);
  s += cfg.eyewear || '';
  s += brows(expr.brows, cfg);
  s += stroke('M 260 296 Q 252 322 262 326', cfg.skinShade, 3, ' opacity="0.7"');
  s += mouth(expr.mouth, cfg);
  s += cfg.hairFront;
  s += cfg.hairTop || '';
  return svg(520, 900, '', s);
}

const MIRA = {
  skin: '#9A6244', skinShade: '#7C4C34', cheek: '#C9694A', iris: '#3A2A1E', line: '#2A1B14', lip: '#5C2A22', browColor: '#2A1B14',
  coat: '#1E5E63', collar: '#F5F2EA',
  hairBack: pathEl('M 150 270 Q 140 140 260 130 Q 380 140 370 270 L 380 440 Q 340 470 300 440 L 220 440 Q 180 470 140 440 Z', '#2B1D17'),
  hairFront: pathEl('M 160 270 Q 150 150 260 140 Q 372 150 360 270 Q 356 214 300 192 Q 256 232 190 214 Q 168 236 160 270 Z', '#2B1D17') +
    pathEl('M 210 172 Q 260 152 316 176 Q 270 168 210 172 Z', '#4A3228', ' opacity="0.8"'),
  coatDetail: stroke('M 260 520 L 260 900', '#123F43', 4) + circle(260, 590, 9, '#B4532A') + circle(260, 680, 9, '#B4532A') + circle(260, 770, 9, '#B4532A') +
    pathEl('M 40 900 L 56 560 L 120 600 L 110 900 Z', '#17474B', ' opacity="0.7"') + pathEl('M 480 900 L 464 560 L 400 600 L 410 900 Z', '#17474B', ' opacity="0.7"') +
    pathEl('M 150 470 Q 260 560 370 470 L 350 520 Q 260 600 170 520 Z', '#F5F2EA') + stroke('M 196 500 Q 260 560 324 500', '#B4532A', 5),
  neckwear: ''
};

const SOREN = {
  skin: '#D9A980', skinShade: '#B98760', cheek: '#C77B5A', iris: '#2F4F3A', line: '#2A1B14', lip: '#7A3A2A', browColor: '#3A2418', browWidth: 7,
  coat: '#2B2623', collar: '#E8E0D0',
  hairBack: pathEl('M 168 250 Q 160 150 260 138 Q 360 150 352 250 L 350 300 L 170 300 Z', '#3A2418'),
  hairFront: pathEl('M 164 262 Q 150 140 262 128 Q 380 140 358 262 Q 350 196 296 174 Q 240 214 200 186 Q 170 206 164 262 Z', '#3A2418') +
    pathEl('M 200 150 Q 262 118 330 154 Q 270 140 200 150 Z', '#5A3A28', ' opacity="0.8"'),
  hairTop: stroke('M 176 184 Q 260 140 344 184', '#8C6A2C', 12, ' opacity="0.95"') + circle(214, 168, 22, 'none', ' stroke="#B8893E" stroke-width="8"') + circle(306, 168, 22, 'none', ' stroke="#B8893E" stroke-width="8"') + circle(214, 168, 15, '#BFE0DC', ' opacity="0.55"') + circle(306, 168, 15, '#BFE0DC', ' opacity="0.55"'),
  coatDetail: pathEl('M 130 520 L 390 520 L 410 900 L 110 900 Z', '#B4532A') + pathEl('M 130 520 L 390 520 L 380 560 L 140 560 Z', '#8E3E1E') +
    rect(198, 640, 124, 70, '#8E3E1E') + stroke('M 198 674 L 322 674', '#5C2A14', 3) + circle(208, 560, 8, '#B8893E') + circle(312, 560, 8, '#B8893E') +
    pathEl('M 40 900 L 56 560 Q 70 500 130 480 L 130 900 Z', '#E8E0D0', ' opacity="0.9"') + pathEl('M 480 900 L 464 560 Q 450 500 390 480 L 390 900 Z', '#E8E0D0', ' opacity="0.9"'),
  neckwear: ''
};

const VOSS = {
  skin: '#C99A72', skinShade: '#A87B58', cheek: '#B8705A', iris: '#4A5A66', line: '#2A2622', lip: '#6A3A30', browColor: '#E8E4DC', browWidth: 7,
  coat: '#1B1E24', collar: '#F5F2EA',
  hairBack: pathEl('M 156 270 Q 150 150 260 138 Q 370 150 364 270 L 356 340 L 164 340 Z', '#E4E0D8'),
  hairFront: pathEl('M 166 262 Q 160 160 260 148 Q 360 160 354 262 Q 346 206 260 196 Q 176 206 166 262 Z', '#ECE8E0') +
    pathEl('M 250 372 Q 260 420 270 372 Q 330 380 340 330 Q 300 392 260 396 Q 220 392 180 330 Q 190 380 250 372 Z', '#E4E0D8', ' opacity="0.95"'),
  eyewear: circle(218, 282, 26, 'none', ' stroke="#B8893E" stroke-width="5"') + circle(302, 282, 26, 'none', ' stroke="#B8893E" stroke-width="5"') + stroke('M 244 282 Q 260 272 276 282', '#B8893E', 5) +
    circle(218, 282, 25, '#BFE0DC', ' opacity="0.12"') + circle(302, 282, 25, '#BFE0DC', ' opacity="0.12"'),
  coatDetail: pathEl('M 40 900 L 56 560 Q 70 480 190 452 L 330 452 Q 450 480 464 560 L 480 900 Z', '#1B1E24') +
    pathEl('M 190 452 L 260 700 L 330 452 L 300 446 L 260 560 L 220 446 Z', '#2B2F36') +
    pathEl('M 226 470 L 260 520 L 294 470 L 260 450 Z', '#F5F2EA') +
    circle(260, 600, 8, '#B8893E') + circle(260, 680, 8, '#B8893E') + circle(260, 760, 8, '#B8893E') +
    stroke('M 330 520 Q 400 600 340 700', '#B8893E', 4) + circle(340, 704, 12, '#B8893E'),
  neckwear: pathEl('M 236 462 L 260 494 L 284 462 L 260 474 Z', '#B4532A')
};

function expressionsFor(name) {
  return {
    mira: [
      ['calm', { eyes: 'open', brows: 'calm', mouth: 'calm' }],
      ['worried', { eyes: 'wide', brows: 'worried', mouth: 'worried', blush: 0.1 }],
      ['smile', { eyes: 'happy', brows: 'smile', mouth: 'smile', blush: 0.32 }]
    ],
    soren: [
      ['guarded', { eyes: 'narrow', brows: 'flat', mouth: 'flat' }],
      ['smirk', { eyes: 'open', brows: 'smirk', mouth: 'smirk' }],
      ['open', { eyes: 'open', brows: 'soft', mouth: 'open', blush: 0.24 }]
    ],
    voss: [
      ['stern', { eyes: 'narrow', brows: 'stern', mouth: 'thin' }],
      ['soft', { eyes: 'open', brows: 'soft', mouth: 'soft', blush: 0.22 }],
      ['grave', { eyes: 'wide', brows: 'worried', mouth: 'grave', blush: 0.08 }]
    ]
  }[name];
}

function write(file, content) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), content);
}

function main() {
  write('bg_harbor.svg', bgHarbor());
  write('bg_archive.svg', bgArchive());
  write('bg_workshop.svg', bgWorkshop());
  write('bg_storm.svg', bgStorm());
  write('bg_lens.svg', bgLens());
  write('bg_dawn.svg', bgDawn());
  [['mira', MIRA], ['soren', SOREN], ['voss', VOSS]].forEach(function (pair) {
    write(pair[0] + '_body.svg', bodyLayer(pair[1]));
    expressionsFor(pair[0]).forEach(function (e) {
      write(pair[0] + '_face_' + e[0] + '.svg', faceLayer(pair[1], e[1]));
    });
  });
  const count = fs.readdirSync(OUT).filter(function (f) { return f.endsWith('.svg'); }).length;
  console.log('Wrote ' + count + ' SVG files to ' + OUT);
}

main();
