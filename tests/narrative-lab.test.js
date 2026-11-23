'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../engine.js');
const Lab = require('../narrative-lab.js');

const ROOT = path.join(__dirname, '..');
const CANONICAL_SOURCE = fs.readFileSync(path.join(ROOT, 'game', 'script.rpy'), 'utf8');
const REPORT = Lab.analyzeStory(CANONICAL_SOURCE);
const ENDING_LABELS = [
  'ending_meridian_restored',
  'ending_silent_observatory',
  'ending_tidal_accord',
  'ending_glass_fracture'
];

/* ------------------------------------------------------------------ */
/* 1. Pure-JS SHA-256: known-answer vectors and crypto parity           */
/* ------------------------------------------------------------------ */

Lab.SHA256_VECTORS.forEach(function (pair, i) {
  test('sha256: FIPS known-answer vector ' + i + ' matches', function () {
    assert.equal(Lab.sha256Hex(pair[0]), pair[1]);
  });
});

test('sha256: one million "a" long-message vector matches', function () {
  const s = 'a'.repeat(1000000);
  assert.equal(
    Lab.sha256Hex(s),
    'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'
  );
});

for (let n = 0; n <= 140; n++) {
  test('sha256: parity with node:crypto at input length ' + n, function () {
    const s = 'x'.repeat(n);
    const expected = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    assert.equal(Lab.sha256Hex(s), expected);
  });
}

const UTF8_SAMPLES = [
  'héllo wörld',
  'ÿ',
  'þ',
  '中文字符',
  '日本語のテスト',
  'emoji 😀 test',
  '𝄞𝄢 astral',
  'mixed A9é中😀Z',
  '\t\n\r control',
  'null? no',
  'ünïcödé boundary 漢字',
  'a​b zero width',
  'Œuvres complètes',
  'Ελληνικά'
];

UTF8_SAMPLES.forEach(function (s, i) {
  test('sha256: UTF-8 sample ' + i + ' matches node:crypto', function () {
    const expected = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    assert.equal(Lab.sha256Hex(s), expected);
  });
});

UTF8_SAMPLES.forEach(function (s, i) {
  test('utf8: encode/decode round-trips sample ' + i, function () {
    const decoded = Lab.utf8Decode(Lab.utf8Encode(s));
    assert.equal(decoded, s);
  });
});

test('utf8: encoder emits RFC 3629 bytes for é, 中, and astral pairs', function () {
  assert.deepEqual(Array.from(Lab.utf8Encode('é')), [0xc3, 0xa9]);
  assert.deepEqual(Array.from(Lab.utf8Encode('中')), [0xe4, 0xb8, 0xad]);
  assert.deepEqual(Array.from(Lab.utf8Encode('😀')), [0xf0, 0x9f, 0x98, 0x80]);
});

const UTF8_MALFORMED = [
  ['lone continuation', new Uint8Array([0x80])],
  ['truncated two byte', new Uint8Array([0xc3])],
  ['bad continuation', new Uint8Array([0xc3, 0x41])],
  ['overlong slash', new Uint8Array([0xc0, 0xaf])],
  ['encoded surrogate', new Uint8Array([0xed, 0xa0, 0x80])],
  ['truncated three byte', new Uint8Array([0xe4, 0xb8])],
  ['truncated four byte', new Uint8Array([0xf0, 0x9f, 0x98])],
  ['five byte lead', new Uint8Array([0xf8, 0x88, 0x80, 0x80, 0x80])],
  ['overlong four byte', new Uint8Array([0xf0, 0x80, 0x80, 0x80])]
];

UTF8_MALFORMED.forEach(function (pair) {
  test('utf8: decoder fails closed on ' + pair[0], function () {
    assert.equal(Lab.utf8Decode(pair[1]), null);
  });
});

test('utf8: lone surrogates encode as U+FFFD instead of throwing', function () {
  const bytes = Lab.utf8Encode('a\ud800b');
  assert.deepEqual(Array.from(bytes), [0x61, 0xef, 0xbf, 0xbd, 0x62]);
});

/* ------------------------------------------------------------------ */
/* 2. Base64url codec                                                    */
/* ------------------------------------------------------------------ */

for (let n = 0; n <= 48; n++) {
  test('base64url: round-trips ' + n + ' bytes', function () {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (i * 31 + 7) & 0xff;
    const decoded = Lab.base64urlDecode(Lab.base64urlEncode(bytes));
    assert.ok(decoded !== null);
    assert.deepEqual(Array.from(decoded), Array.from(bytes));
  });
}

test('base64url: encode is url safe (no plus, slash, or padding)', function () {
  const bytes = new Uint8Array([0xfb, 0xff, 0xfe, 0xfa, 0x00]);
  const enc = Lab.base64urlEncode(bytes);
  assert.equal(/[+/=]/.test(enc), false);
});

const B64_HOSTILE = [
  ['spaces', 'a b c'],
  ['padding', 'abc='],
  ['bang', 'abc!'],
  ['unicode', 'é中'],
  ['length mod one', 'abcde'],
  ['number type', 42],
  ['null type', null],
  ['undefined', undefined],
  ['object type', { a: 1 }]
];

B64_HOSTILE.forEach(function (pair) {
  test('base64url: decode fails closed on ' + pair[0], function () {
    assert.equal(Lab.base64urlDecode(pair[1]), null);
  });
});

test('base64url: known value encodes correctly', function () {
  const bytes = Lab.utf8Encode('{"v":1}');
  assert.equal(Lab.base64urlEncode(bytes), 'eyJ2IjoxfQ');
  assert.equal(Lab.utf8Decode(Lab.base64urlDecode('eyJ2IjoxfQ')), '{"v":1}');
});

/* ------------------------------------------------------------------ */
/* 3. Canonical JSON and Tarjan SCC                                      */
/* ------------------------------------------------------------------ */

test('stableStringify: sorts keys at every depth', function () {
  const a = Lab.stableStringify({ b: 1, a: { d: 4, c: [3, 2] } });
  assert.equal(a, '{"a":{"c":[3,2],"d":4},"b":1}');
});

test('stableStringify: equal objects in different orders produce identical output', function () {
  const a = Lab.stableStringify({ x: 1, y: { p: 1, q: 2 } });
  const b = Lab.stableStringify({ y: { q: 2, p: 1 }, x: 1 });
  assert.equal(a, b);
});

test('stableStringify: handles null, arrays, strings, and numbers', function () {
  assert.equal(Lab.stableStringify(null), 'null');
  assert.equal(Lab.stableStringify([1, 'a', null]), '[1,"a",null]');
  assert.equal(Lab.stableStringify('s'), '"s"');
  assert.equal(Lab.stableStringify(4.5), '4.5');
});

test('tarjanScc: single three-node cycle produces one component', function () {
  const comps = Lab.tarjanScc(['a', 'b', 'c'], { a: ['b'], b: ['c'], c: ['a'] });
  assert.equal(comps.length, 1);
  assert.equal(comps[0].length, 3);
});

test('tarjanScc: linear chain produces singleton components', function () {
  const comps = Lab.tarjanScc(['a', 'b', 'c'], { a: ['b'], b: ['c'], c: [] });
  assert.equal(comps.length, 3);
});

test('countSccCycles: counts self loops and multi-node cycles', function () {
  assert.equal(Lab.countSccCycles(['a'], { a: ['a'] }), 1);
  assert.equal(Lab.countSccCycles(['a'], { a: [] }), 0);
  assert.equal(Lab.countSccCycles(['a', 'b'], { a: ['b'], b: ['a'] }), 1);
  assert.equal(Lab.countSccCycles(['a', 'b', 'c', 'd'], { a: ['b'], b: ['a'], c: ['d'], d: ['c'] }), 2);
});

test('countSccCycles: nested figure-eight graph counts two cycles', function () {
  const adj = { a: ['b', 'c'], b: ['a'], c: ['d'], d: ['c'] };
  assert.equal(Lab.countSccCycles(['a', 'b', 'c', 'd'], adj), 2);
});

test('countSccCycles: canonical script graph reports one choice loop', function () {
  const a = REPORT.analysis;
  const nodes = a.nodes.map(function (n) { return n.name; });
  const adj = {};
  nodes.forEach(function (n) { adj[n] = []; });
  a.edges.forEach(function (e) { adj[e.from].push(e.to); });
  const cycles = Lab.countSccCycles(nodes, adj);
  assert.equal(cycles, a.choiceLoops.length + a.loopsWithoutChoices.length);
  assert.equal(cycles, 1);
});

/* ------------------------------------------------------------------ */
/* 4. Exhaustive path enumeration on the canonical script               */
/* ------------------------------------------------------------------ */

test('enumeration: canonical script enumerates a bounded full tree', function () {
  const en = REPORT.enumeration;
  assert.equal(en.error, null);
  assert.equal(en.truncated, false);
  assert.equal(en.errorPaths, 0);
  assert.equal(en.deadPaths, 0);
  assert.ok(en.paths.length > 500, 'expected several hundred playthroughs');
});

test('enumeration: every recorded path signature is unique', function () {
  const sigs = new Set(REPORT.enumeration.paths.map(function (p) { return p.signature; }));
  assert.equal(sigs.size, REPORT.enumeration.paths.length);
});

test('enumeration: every path terminates on a canonical ending label', function () {
  REPORT.enumeration.paths.forEach(function (p) {
    assert.ok(ENDING_LABELS.indexOf(p.ending) !== -1, 'path ended on ' + p.ending);
    assert.equal(p.terminal, true);
  });
});

test('enumeration: choice steps reference real menu labels in the program', function () {
  const program = REPORT.program;
  REPORT.enumeration.paths.forEach(function (p) {
    p.steps.forEach(function (s) {
      assert.ok(program.labels[s.label], 'missing label ' + s.label);
      assert.equal(typeof s.index, 'number');
      assert.ok(s.text.length > 0);
    });
  });
});

test('enumeration: sum of per-ending path counts equals total playthroughs', function () {
  const sum = REPORT.endings.reduce(function (acc, e) { return acc + e.pathCount; }, 0);
  assert.equal(sum, REPORT.enumeration.paths.filter(function (p) { return p.terminal; }).length);
});

test('enumeration: path shares sum to 100 percent', function () {
  const total = REPORT.endings.reduce(function (acc, e) { return acc + e.sharePct; }, 0);
  assert.ok(Math.abs(total - 100) < 0.01, 'share total ' + total);
});

ENDING_LABELS.forEach(function (label) {
  test('ending ' + label + ': reachable with a positive path count', function () {
    const e = REPORT.endings.find(function (x) { return x.label === label; });
    assert.ok(e, 'ending row missing');
    assert.equal(e.reachable, true);
    assert.ok(e.pathCount > 0);
  });

  test('ending ' + label + ': lab shortest route matches engine BFS length', function () {
    const e = REPORT.endings.find(function (x) { return x.label === label; });
    assert.equal(e.choiceCount, e.engineChoiceCount);
    assert.ok(e.choiceCount >= 4 && e.choiceCount <= 8);
  });

  test('ending ' + label + ': shortest route replays through the live runtime', function () {
    const e = REPORT.endings.find(function (x) { return x.label === label; });
    const rt = Engine.createStoryRuntime(REPORT.program);
    let ev = Engine.advanceStory(rt);
    let idx = 0;
    while (ev.type !== 'end') {
      if (ev.type === 'menu') {
        const step = e.shortestChoices[idx++];
        assert.ok(step, 'ran out of steps at menu ' + ev.label);
        ev = Engine.chooseMenuOption(rt, step.index);
      } else {
        ev = Engine.advanceStory(rt);
      }
    }
    assert.equal(ev.ending.label, label);
    assert.ok(e.terminalTrust[0] <= rt.st.vars.trust_score && rt.st.vars.trust_score <= e.terminalTrust[1]);
    assert.ok(e.terminalDrift[0] <= rt.st.vars.calibration_drift && rt.st.vars.calibration_drift <= e.terminalDrift[1]);
  });

  test('ending ' + label + ': terminal ranges and lens outcomes are coherent', function () {
    const e = REPORT.endings.find(function (x) { return x.label === label; });
    assert.ok(e.terminalTrust[0] !== null && e.terminalTrust[0] <= e.terminalTrust[1]);
    assert.ok(e.terminalDrift[0] !== null && e.terminalDrift[0] <= e.terminalDrift[1]);
    assert.equal(e.lensUnlockedTerminal + e.lensLockedTerminal, e.pathCount);
    e.terminalPoints.forEach(function (pt) {
      assert.ok(pt.trust >= e.terminalTrust[0] && pt.trust <= e.terminalTrust[1]);
      assert.ok(pt.drift >= e.terminalDrift[0] && pt.drift <= e.terminalDrift[1]);
    });
  });
});

test('endings: every ending appears exactly once in the comparator', function () {
  assert.equal(REPORT.endings.length, 4);
  const labels = REPORT.endings.map(function (e) { return e.label; }).sort();
  assert.deepEqual(labels, ENDING_LABELS.slice().sort());
});

test('enumeration: honors maxPaths, maxDepth, and maxExpansions caps', function () {
  const prog = REPORT.program;
  const p10 = Lab.enumeratePaths(prog, { maxPaths: 10 });
  assert.ok(p10.paths.length <= 10);
  assert.equal(p10.truncated, true);
  assert.equal(p10.truncateReason, 'max-paths');
  const d2 = Lab.enumeratePaths(prog, { maxDepth: 2 });
  assert.equal(d2.truncated, true);
  const x5 = Lab.enumeratePaths(prog, { maxExpansions: 5 });
  assert.equal(x5.truncated, true);
});

test('enumeration: deterministic across runs', function () {
  const again = Lab.enumeratePaths(REPORT.program);
  assert.equal(again.paths.length, REPORT.enumeration.paths.length);
  assert.deepEqual(
    again.paths.map(function (p) { return p.signature; }),
    REPORT.enumeration.paths.map(function (p) { return p.signature; })
  );
});

test('enumeration: rejected start-missing program returns structured failure', function () {
  const prog = Engine.parseRenpyScript('label only:\n    "hi"\n    return\n');
  const en = Lab.enumeratePaths(prog);
  assert.ok(en.error !== null);
  assert.equal(en.paths.length, 0);
});

/* ------------------------------------------------------------------ */
/* 5. Pivotal-decision sensitivity analysis                             */
/* ------------------------------------------------------------------ */

test('pivots: every canonical menu site is analyzed', function () {
  const siteLabels = REPORT.pivots.map(function (p) { return p.label; }).sort();
  assert.deepEqual(siteLabels, [
    'scene1_arrival', 'scene2_archive_menu', 'scene3_workshop', 'scene4_storm', 'scene5_calibration'
  ]);
});

test('pivots: scene5 calibration menu carries the highest leverage', function () {
  const top = REPORT.pivots[0];
  assert.equal(top.label, 'scene5_calibration');
  assert.ok(top.pivotalContexts > 0);
  assert.ok(top.leverage > 0);
});

test('pivots: scene1 menu is non-pivotal (all branches converge)', function () {
  const s1 = REPORT.pivots.find(function (p) { return p.label === 'scene1_arrival'; });
  assert.ok(s1);
  assert.equal(s1.pivotalContexts, 0);
  assert.equal(s1.flipPairs, 0);
});

test('pivots: covered endings stay inside the canonical ending set', function () {
  REPORT.pivots.forEach(function (p) {
    p.endingsCovered.forEach(function (e) {
      assert.ok(ENDING_LABELS.indexOf(e) !== -1, 'unexpected ending ' + e + ' at ' + p.key);
    });
    assert.ok(p.visits >= 1);
    assert.ok(p.options.length >= 2);
    assert.ok(p.pivotalContexts <= p.visits);
  });
});

test('pivots: option endings unions never exceed the site union', function () {
  REPORT.pivots.forEach(function (p) {
    p.options.forEach(function (o) {
      o.endings.forEach(function (e) {
        assert.ok(p.endingsCovered.indexOf(e) !== -1);
      });
    });
  });
});

test('pivots: mini branch script marks its only menu pivotal', function () {
  const mini = Lab.analyzeStory(Lab.miniBranchScript());
  assert.equal(mini.pivots.length, 1);
  assert.equal(mini.pivots[0].pivotalContexts, 1);
  assert.equal(mini.pivots[0].endingsCovered.length, 2);
});

test('pivots: sites report their scene number when the label names one', function () {
  REPORT.pivots.forEach(function (p) {
    assert.equal(typeof p.scene, 'number');
    assert.ok(p.scene >= 1 && p.scene <= 6);
  });
});

/* ------------------------------------------------------------------ */
/* 6. Proof payload, digest, verify and tamper                          */
/* ------------------------------------------------------------------ */

test('proof: format, version, and 64-hex digest are well formed', function () {
  const proof = REPORT.proof;
  assert.equal(proof.format, 'glass-meridian-lab-proof');
  assert.equal(proof.version, 1);
  assert.match(proof.digest, /^[0-9a-f]{64}$/);
  assert.match(proof.payload.script.sha256, /^[0-9a-f]{64}$/);
});

test('proof: digest matches a direct sha256 of the canonical payload', function () {
  const recomputed = Lab.sha256Hex(Lab.stableStringify(REPORT.proof.payload));
  assert.equal(recomputed, REPORT.proof.digest);
});

test('proof: verifyProof accepts the untouched report', function () {
  const v = Lab.verifyProof(REPORT.proof);
  assert.equal(v.ok, true);
  assert.equal(v.reason, 'verified');
});

test('proof: repeated analysis returns the identical cached digest', function () {
  const a = Lab.analyzeStory(CANONICAL_SOURCE);
  const b = Lab.analyzeStory(CANONICAL_SOURCE);
  assert.equal(a.proof.digest, b.proof.digest);
  assert.equal(a.proof, b.proof);
});

const TAMPERS = [
  ['playthrough count', function (p) { p.totals.playthroughs += 1; }],
  ['ending label', function (p) { p.endings[0].label = 'ending_forged'; }],
  ['path count', function (p) { p.endings[1].pathCount += 7; }],
  ['share percent', function (p) { p.endings[2].sharePct = 99.9; }],
  ['script hash', function (p) { p.script.sha256 = 'f'.repeat(64); }],
  ['scc count', function (p) { p.totals.sccCycles = 0; }],
  ['pivot leverage', function (p) { p.pivots[0].flipPairs += 100; }],
  ['unreachable labels', function (p) { p.totals.unreachableLabels = 3; }]
];

TAMPERS.forEach(function (pair) {
  test('tamper: mutating ' + pair[0] + ' is detected by verifyProof', function () {
    const forged = Lab.tamperProof(REPORT.proof, pair[1]);
    const v = Lab.verifyProof(forged);
    assert.equal(v.ok, false);
    assert.equal(v.reason, 'digest mismatch');
  });
});

const PROOF_MALFORMED = [
  ['null', null],
  ['a string', 'proof'],
  ['an array', [1, 2]],
  ['missing digest', { payload: {} }],
  ['missing payload', { digest: 'a'.repeat(64) }],
  ['short digest', { payload: {}, digest: 'abc' }],
  ['uppercase digest', { payload: {}, digest: 'A'.repeat(64) }],
  ['non-hex digest', { payload: {}, digest: 'z'.repeat(64) }]
];

PROOF_MALFORMED.forEach(function (pair) {
  test('verify: fails closed on ' + pair[0], function () {
    const v = Lab.verifyProof(pair[1]);
    assert.equal(v.ok, false);
  });
});

/* ------------------------------------------------------------------ */
/* 7. Exporters: JSON, formula-safe CSV, Markdown                        */
/* ------------------------------------------------------------------ */

test('export: JSON parses and carries the same digest and payload', function () {
  const doc = JSON.parse(Lab.exportJson(REPORT.proof));
  assert.equal(doc.digest, REPORT.proof.digest);
  assert.equal(doc.format, 'glass-meridian-lab-proof');
  assert.equal(doc.payload.script.sha256, REPORT.proof.payload.script.sha256);
});

test('export: CSV embeds the report digest in its provenance header', function () {
  const csv = Lab.exportCsv(REPORT.proof);
  assert.ok(csv.indexOf('report_sha256,' + REPORT.proof.digest) !== -1);
  assert.ok(csv.indexOf('script_sha256,' + REPORT.proof.payload.script.sha256) !== -1);
});

test('export: CSV lists one row per ending with honest reachability', function () {
  const csv = Lab.exportCsv(REPORT.proof);
  ENDING_LABELS.forEach(function (label) {
    assert.ok(csv.indexOf(label) !== -1, 'csv missing ' + label);
  });
  assert.ok(csv.indexOf(',TRUE,') !== -1);
});

test('export: CSV uses CRLF line endings throughout', function () {
  const csv = Lab.exportCsv(REPORT.proof);
  assert.equal(csv.indexOf('\n') > 0 && csv[csv.indexOf('\n') - 1] === '\r', true);
  assert.equal(/\r\n$/.test(csv), true);
  assert.equal(/[^\r]\n/.test(csv), false);
});

test('export: CSV totals row matches the payload exactly', function () {
  const csv = Lab.exportCsv(REPORT.proof);
  const t = REPORT.proof.payload.totals;
  const row = [t.labelCount, t.edgeCount, t.unreachableLabels, t.deadEnds, t.sccCycles, t.playthroughs, t.terminatedPlaythroughs, 'FALSE'].join(',');
  assert.ok(csv.indexOf(row) !== -1, 'missing totals row ' + row);
});

test('export: Markdown carries the same digest in its footer', function () {
  const md = Lab.exportMarkdown(REPORT.proof);
  assert.ok(md.indexOf('`' + REPORT.proof.digest + '`') !== -1);
  assert.ok(md.indexOf('| Ending | Reachable |') !== -1);
});

test('export: Markdown mentions every ending title and pivot site', function () {
  const md = Lab.exportMarkdown(REPORT.proof);
  REPORT.endings.forEach(function (e) { assert.ok(md.indexOf(e.title) !== -1); });
  REPORT.pivots.forEach(function (p) { assert.ok(md.indexOf(p.key) !== -1); });
});

const CSV_CELLS = [
  ['=2+3', "'=2+3"],
  ['+cmd', "'+cmd"],
  ['-10', "'-10"],
  ['@RUN', "'@RUN"],
  ['=CMD()', "'=CMD()"],
  ['\t=1', "'\t=1"],
  [' plain', "' plain"],
  ['plain', 'plain'],
  ['with,comma', '"with,comma"'],
  ['say "hi"', '"say ""hi"""'],
  ['line\nbreak', '"line\nbreak"'],
  ['', ''],
  [42, '42'],
  [null, ''],
  [true, 'true']
];

CSV_CELLS.forEach(function (pair, i) {
  test('csvEscape: case ' + i + ' escapes ' + JSON.stringify(pair[0]), function () {
    assert.equal(Lab.csvEscape(pair[0]), pair[1]);
  });
});

test('csvEscape: formula escapes compose with quoting rules', function () {
  assert.equal(Lab.csvEscape('=a,b'), '"\'=a,b"');
});

/* ------------------------------------------------------------------ */
/* 8. #gm= bookmark codec                                                */
/* ------------------------------------------------------------------ */

const BOOKMARK_VALID = [
  { end: 'ending_meridian_restored' },
  { end: 'ending_silent_observatory', view: 'reach' },
  { end: 'ending_tidal_accord', scene: 5 },
  { scene: 'scene4_storm' },
  { piv: 'scene5_calibration@6' },
  { piv: 'scene2_archive_menu' },
  { view: 'phase' },
  { view: 'leverage' },
  { view: 'export' },
  { view: 'tests' },
  { v: 1, end: 'ending_glass_fracture' },
  { end: 'ending_meridian_restored', scene: 6, piv: 'scene5_calibration@6', view: 'reach' },
  { scene: 1 },
  { scene: 99 },
  {}
];

BOOKMARK_VALID.forEach(function (st, i) {
  test('bookmark: valid state ' + i + ' round-trips', function () {
    const enc = Lab.encodeBookmark(st);
    assert.ok(enc !== null && enc.indexOf('#gm=') === 0);
    const dec = Lab.decodeBookmark(enc);
    assert.ok(dec !== null);
    Object.keys(st).forEach(function (k) {
      assert.equal(dec[k], st[k]);
    });
  });
});

test('bookmark: decode tolerates a missing leading hash', function () {
  const enc = Lab.encodeBookmark({ view: 'phase' }).slice(1);
  const dec = Lab.decodeBookmark(enc);
  assert.equal(dec.view, 'phase');
});

function enc(obj) {
  return '#gm=' + Lab.base64urlEncode(Lab.utf8Encode(JSON.stringify(obj)));
}

function encRaw(jsonText) {
  return '#gm=' + Lab.base64urlEncode(Lab.utf8Encode(jsonText));
}

const BOOKMARK_HOSTILE = [
  ['proto key', encRaw('{"__proto__":{"x":1}}')],
  ['constructor key', encRaw('{"constructor":{"x":1}}')],
  ['prototype key', encRaw('{"prototype":{"x":1}}')],
  ['script tag end', enc({ end: '<script>' })],
  ['number end', enc({ end: 4 })],
  ['bool end', enc({ end: true })],
  ['object end', enc({ end: {} })],
  ['array end', enc({ end: ['a'] })],
  ['long end', enc({ end: 'a'.repeat(200) })],
  ['bad char end', enc({ end: 'ending-x' })],
  ['leading digit end', enc({ end: '9ending' })],
  ['view garbage', enc({ view: 'rm -rf' })],
  ['view number', enc({ view: 3 })],
  ['scene zero', enc({ scene: 0 })],
  ['scene negative', enc({ scene: -4 })],
  ['scene huge', enc({ scene: 100 })],
  ['scene float', enc({ scene: 2.5 })],
  ['scene string digits', enc({ scene: '4x' })],
  ['scene bool', enc({ scene: false })],
  ['piv bad char', enc({ piv: 'a b' })],
  ['piv number', enc({ piv: 9 })],
  ['piv long', enc({ piv: 'x'.repeat(300) })],
  ['version two', enc({ v: 2, view: 'reach' })],
  ['version string', enc({ v: '1', view: 'reach' })],
  ['unknown key', enc({ view: 'reach', extra: 1 })],
  ['json array', enc([1, 2, 3])],
  ['json string', enc('hello')],
  ['json number', enc(7)],
  ['json null', enc(null)],
  ['json bool', enc(true)],
  ['bad base64', '#gm=!!!not!!!'],
  ['mod one base64', '#gm=abcde'],
  ['non json payload', '#gm=' + Lab.base64urlEncode(Lab.utf8Encode('not json at all'))],
  ['empty payload', '#gm='],
  ['wrong prefix', '#gn=eyJ2IjoxfQ'],
  ['no prefix', '#gm'],
  ['empty string', ''],
  ['whitespace', '   '],
  ['giant hash', '#gm=' + 'a'.repeat(9000)]
];

BOOKMARK_HOSTILE.forEach(function (pair) {
  test('bookmark: fails closed on ' + pair[0], function () {
    assert.equal(Lab.decodeBookmark(pair[1]), null);
  });
});

test('bookmark: decoded output never carries prototype-poisoning keys', function () {
  const dec = Lab.decodeBookmark(enc({ end: 'ending_tidal_accord', view: 'reach' }));
  assert.equal(Object.prototype.hasOwnProperty.call(dec, '__proto__'), false);
  assert.equal(dec.__proto__, Object.prototype);
});

test('bookmark: normalizeBookmark requires plain objects', function () {
  assert.equal(Lab.normalizeBookmark(null), null);
  assert.equal(Lab.normalizeBookmark('x'), null);
  assert.equal(Lab.normalizeBookmark(4), null);
  assert.equal(Lab.normalizeBookmark([1]), null);
  assert.equal(Lab.normalizeBookmark(undefined), null);
});

test('bookmark: encode rejects un-normalizable state', function () {
  assert.equal(Lab.encodeBookmark({ end: '<x>' }), null);
  assert.equal(Lab.encodeBookmark({ view: 'bogus' }), null);
  assert.equal(Lab.encodeBookmark('string'), null);
  assert.equal(Lab.encodeBookmark(null), null);
});

/* ------------------------------------------------------------------ */
/* 9. Hostile and edge-case inputs                                       */
/* ------------------------------------------------------------------ */

test('analyzeStory: non-string input fails closed', function () {
  [null, undefined, 42, {}, [], true].forEach(function (bad, i) {
    const r = Lab.analyzeStory(bad);
    assert.equal(r.ok, false, 'input ' + i + ' should fail');
  });
});

test('analyzeStory: empty script reports structured failure, not a throw', function () {
  const r = Lab.analyzeStory('');
  assert.equal(r.ok, false);
  assert.equal(r.endings.length, 0);
});

test('analyzeStory: cyclic infinite-jump script is bounded by caps', function () {
  const prog = Engine.parseRenpyScript(Lab.cyclicTestScript());
  const en = Lab.enumeratePaths(prog, { maxDepth: 6, maxPaths: 60 });
  assert.equal(en.error, null);
  assert.ok(en.paths.length <= 60);
});

test('analyzeStory: broken orphan-label script still produces a report', function () {
  const r = Lab.analyzeStory(Lab.brokenTestScript());
  assert.equal(typeof r.proof.digest, 'string');
  assert.ok(r.analysis.unreachableLabels.indexOf('orphan_nowhere') !== -1);
});

test('enumeration: division-by-zero script records an error path, never throws', function () {
  const prog = Engine.parseRenpyScript('label start:\n    $ x = 1 / 0\n    "dead"\n    return\n');
  const en = Lab.enumeratePaths(prog);
  assert.equal(en.error, null);
  assert.ok(en.errorPaths >= 1);
});

test('enumeration: a menu that loops forever hits the depth cap', function () {
  const src = [
    'label start:',
    '    menu:',
    '        "Loop again.":',
    '            jump start',
    '        "Stop." if False:',
    '            jump ending_done',
    'label ending_done:',
    '    "d"',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  const en = Lab.enumeratePaths(prog, { maxDepth: 8, maxPaths: 40 });
  assert.equal(en.truncated, true);
  assert.ok(en.paths.length <= 40);
});

test('analyzeStory: numeric edge vars never crash endings or ranges', function () {
  const src = [
    'default trust_score = 0',
    'default calibration_drift = 0',
    'default lens_unlocked = False',
    'label start:',
    '    $ trust_score = 999999999',
    '    jump ending_huge',
    'label ending_huge:',
    '    "big"',
    '    return'
  ].join('\n');
  const r = Lab.analyzeStory(src);
  assert.equal(r.ok, true);
  const e = r.endings.find(function (x) { return x.label === 'ending_huge'; });
  assert.equal(e.reachable, true);
  assert.equal(e.terminalTrust[0], 999999999);
});

test('isFiniteNumber: rejects NaN, Infinity, -0 edge cases, and non-numbers', function () {
  assert.equal(Lab.isFiniteNumber(NaN), false);
  assert.equal(Lab.isFiniteNumber(Infinity), false);
  assert.equal(Lab.isFiniteNumber(-Infinity), false);
  assert.equal(Lab.isFiniteNumber('4'), false);
  assert.equal(Lab.isFiniteNumber(null), false);
  assert.equal(Lab.isFiniteNumber(undefined), false);
  assert.equal(Lab.isFiniteNumber(-0), true);
  assert.equal(Lab.isFiniteNumber(0.5), true);
});

test('analyzeStory: unknown ending ids simply never appear in results', function () {
  const found = REPORT.endings.filter(function (e) { return e.label === 'ending_nonexistent'; });
  assert.equal(found.length, 0);
});

test('analyzeStory: a script with zero endings yields empty comparator rows', function () {
  const r = Lab.analyzeStory('label start:\n    "solo line"\n    return\n');
  assert.equal(r.ok, true);
  assert.equal(r.endings.length, 0);
  assert.equal(r.enumeration.paths.length, 1);
  assert.equal(r.enumeration.paths[0].ending, null);
});

test('analyzeStory: tamperProof default mutation increments playthroughs', function () {
  const forged = Lab.tamperProof(REPORT.proof);
  assert.equal(forged.payload.totals.playthroughs, REPORT.proof.payload.totals.playthroughs + 1);
  assert.equal(Lab.verifyProof(forged).ok, false);
});

/* ------------------------------------------------------------------ */
/* 10. In-page deterministic self-test runner                            */
/* ------------------------------------------------------------------ */

const SELF_TESTS = Lab.runSelfTests(CANONICAL_SOURCE);

test('selftests: runner returns at least 16 structured results', function () {
  assert.ok(SELF_TESTS.length >= 16, 'got ' + SELF_TESTS.length);
  SELF_TESTS.forEach(function (r) {
    assert.equal(typeof r.id, 'string');
    assert.equal(typeof r.name, 'string');
    assert.equal(typeof r.pass, 'boolean');
    assert.equal(typeof r.detail, 'string');
  });
});

test('selftests: ids are unique', function () {
  const ids = new Set(SELF_TESTS.map(function (r) { return r.id; }));
  assert.equal(ids.size, SELF_TESTS.length);
});

SELF_TESTS.forEach(function (r) {
  test('selftest ' + r.id + ' passes against the canonical script', function () {
    assert.equal(r.pass, true, r.name + ' failed: ' + r.detail);
  });
});

/* ------------------------------------------------------------------ */
/* 11. Lab engine interop and consistency with analyzeNarrativeGraph    */
/* ------------------------------------------------------------------ */

test('interop: lab reachability agrees with engine audit for every ending', function () {
  REPORT.endings.forEach(function (e) {
    const eng = REPORT.analysis.endings.find(function (x) { return x.label === e.label; });
    assert.equal(e.reachable, eng.reachable);
    assert.equal(e.choiceCount, eng.choiceCount);
  });
});

test('interop: lab totals mirror engine audit stats', function () {
  const t = REPORT.proof.payload.totals;
  const s = REPORT.analysis.stats;
  assert.equal(t.labelCount, s.labelCount);
  assert.equal(t.edgeCount, s.edgeCount);
  assert.equal(t.reachableLabels, s.reachableCount);
  assert.equal(t.menuCount, s.menuCount);
  assert.equal(t.choiceCount, s.choiceCount);
});

test('interop: every ending title matches engine endingTitle', function () {
  REPORT.endings.forEach(function (e) {
    assert.equal(e.title, Engine.endingTitle(e.label));
  });
});

test('interop: pathSignature formatting is canonical label:index joined', function () {
  const sig = Lab.pathSignature([{ label: 'a', index: 0 }, { label: 'b', index: 2 }]);
  assert.equal(sig, 'a:0>b:2');
  assert.equal(Lab.pathSignature([]), '');
});
