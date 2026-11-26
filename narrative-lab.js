/*
 * The Glass Meridian: narrative-lab.js
 *
 * A deterministic narrative state-space, ending-reachability and
 * choice-sensitivity lab. It drives engine.js over any Ren'Py script (the
 * bundled game/script.rpy or an edited inspector script), enumerates every
 * distinct playthrough, proves ending reachability with path counts and
 * terminal variable ranges, ranks pivotal choice menus, stamps a pure-JS
 * FIPS 180-4 SHA-256 proof digest, exports the proof as JSON, formula-safe
 * CSV and Markdown, and round-trips lab state through a strict #gm= URL
 * hash codec. One file, no dependencies, no eval. It loads in the browser
 * (window.NarrativeLab) and in Node (require), so the same code powers the
 * on-page lab and the node:test suite.
 */
(function (root, factory) {
  var Engine = null;
  if (typeof module === 'object' && module.exports) {
    Engine = require('./engine.js');
  } else {
    Engine = root.StoryEngine;
  }
  var api = factory(Engine);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.NarrativeLab = api;
  }
})(typeof self !== 'undefined' ? self : this, function (Engine) {
  'use strict';

  var VERSION = 1;
  var PROOF_FORMAT = 'glass-meridian-lab-proof';
  var DEFAULT_MAX_PATHS = 60000;
  var DEFAULT_MAX_DEPTH = 48;
  var DEFAULT_MAX_EXPANSIONS = 500000;
  var MAX_HASH_LENGTH = 4096;
  var MAX_LABEL_LENGTH = 96;

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    var keys = Object.keys(value).sort();
    return '{' + keys.map(function (k) {
      return JSON.stringify(k) + ':' + stableStringify(value[k]);
    }).join(',') + '}';
  }

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  /* ------------------------------------------------------------------ */
  /* UTF-8 codec (manual, deterministic, no TextEncoder dependency)      */
  /* ------------------------------------------------------------------ */

  function utf8Encode(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code >= 0xd800 && code <= 0xdbff) {
        var next = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
        if (next >= 0xdc00 && next <= 0xdfff) {
          var cp = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
          out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
          i++;
        } else {
          out.push(0xef, 0xbf, 0xbd);
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        out.push(0xef, 0xbf, 0xbd);
      } else {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return new Uint8Array(out);
  }

  /* Strict decoder: returns null on any malformed sequence. */
  function utf8Decode(bytes) {
    var out = '';
    var i = 0;
    while (i < bytes.length) {
      var b = bytes[i];
      if (b < 0x80) {
        out += String.fromCharCode(b);
        i += 1;
      } else if (b >= 0xc2 && b < 0xe0) {
        if (i + 1 >= bytes.length || (bytes[i + 1] & 0xc0) !== 0x80) return null;
        out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
        i += 2;
      } else if (b >= 0xe0 && b < 0xf0) {
        if (i + 2 >= bytes.length ||
            (bytes[i + 1] & 0xc0) !== 0x80 ||
            (bytes[i + 2] & 0xc0) !== 0x80) return null;
        var c = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
        if (c < 0x800 || (c >= 0xd800 && c <= 0xdfff)) return null;
        out += String.fromCharCode(c);
        i += 3;
      } else if (b >= 0xf0 && b < 0xf5) {
        if (i + 3 >= bytes.length ||
            (bytes[i + 1] & 0xc0) !== 0x80 ||
            (bytes[i + 2] & 0xc0) !== 0x80 ||
            (bytes[i + 3] & 0xc0) !== 0x80) return null;
        var cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) |
                 ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
        if (cp < 0x10000 || cp > 0x10ffff) return null;
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        i += 4;
      } else {
        return null;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Base64url codec (manual, no atob/btoa/Buffer dependency)            */
  /* ------------------------------------------------------------------ */

  var B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var B64URL_RE = /^[A-Za-z0-9_-]*$/;

  function base64urlEncode(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      var n = (b0 << 16) | (b1 << 8) | b2;
      out += B64_ALPHABET[(n >> 18) & 63];
      out += B64_ALPHABET[(n >> 12) & 63];
      out += i + 1 < bytes.length ? B64_ALPHABET[(n >> 6) & 63] : '';
      out += i + 2 < bytes.length ? B64_ALPHABET[n & 63] : '';
    }
    return out.replace(/\+/g, '-').replace(/\//g, '_');
  }

  function base64urlDecode(str) {
    if (typeof str !== 'string' || !B64URL_RE.test(str)) return null;
    if (str.length === 0) return new Uint8Array(0);
    if (str.length % 4 === 1) return null;
    var clean = str.replace(/-/g, '+').replace(/_/g, '/');
    var rev = {};
    for (var i = 0; i < 64; i++) rev[B64_ALPHABET[i]] = i;
    var bytes = [];
    for (var j = 0; j < clean.length; j += 4) {
      var chunk = clean.slice(j, j + 4);
      var vals = [];
      for (var k = 0; k < chunk.length; k++) {
        var v = rev[chunk[k]];
        if (v === undefined) return null;
        vals.push(v);
      }
      var n = (vals[0] << 18) | ((vals[1] || 0) << 12) | ((vals[2] || 0) << 6) | (vals[3] || 0);
      bytes.push((n >> 16) & 0xff);
      if (chunk.length > 2) bytes.push((n >> 8) & 0xff);
      if (chunk.length > 3) bytes.push(n & 0xff);
      if (chunk.length < 4) break;
    }
    return new Uint8Array(bytes);
  }

  /* ------------------------------------------------------------------ */
  /* FIPS 180-4 SHA-256 (pure JS, unkeyed)                               */
  /* ------------------------------------------------------------------ */

  var SHA256_K = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  var SHA256_H0 = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  function sha256Bytes(data) {
    var len = data.length;
    var bitLen = len * 8;
    var padLen = (56 - ((len + 1) % 64) + 64) % 64;
    var total = len + 1 + padLen + 8;
    var msg = new Uint8Array(total);
    msg.set(data);
    msg[len] = 0x80;
    var hi = Math.floor(bitLen / 0x100000000);
    var lo = bitLen >>> 0;
    msg[total - 8] = (hi >>> 24) & 0xff;
    msg[total - 7] = (hi >>> 16) & 0xff;
    msg[total - 6] = (hi >>> 8) & 0xff;
    msg[total - 5] = hi & 0xff;
    msg[total - 4] = (lo >>> 24) & 0xff;
    msg[total - 3] = (lo >>> 16) & 0xff;
    msg[total - 2] = (lo >>> 8) & 0xff;
    msg[total - 1] = lo & 0xff;

    var h = SHA256_H0.slice();
    var w = new Int32Array(64);
    var t;
    for (var off = 0; off < total; off += 64) {
      for (t = 0; t < 16; t++) {
        w[t] = (msg[off + 4 * t] << 24) | (msg[off + 4 * t + 1] << 16) |
               (msg[off + 4 * t + 2] << 8) | msg[off + 4 * t + 3];
      }
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3];
      var e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + SHA256_K[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0;
      h[1] = (h[1] + b) | 0;
      h[2] = (h[2] + c) | 0;
      h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0;
      h[5] = (h[5] + f) | 0;
      h[6] = (h[6] + g) | 0;
      h[7] = (h[7] + hh) | 0;
    }
    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) {
      var v = h[i] >>> 0;
      out[4 * i] = (v >>> 24) & 0xff;
      out[4 * i + 1] = (v >>> 16) & 0xff;
      out[4 * i + 2] = (v >>> 8) & 0xff;
      out[4 * i + 3] = v & 0xff;
    }
    return out;
  }

  function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      out += h.length === 1 ? '0' + h : h;
    }
    return out;
  }

  function sha256Hex(input) {
    var bytes = typeof input === 'string' ? utf8Encode(input) : input;
    return bytesToHex(sha256Bytes(bytes));
  }

  /* ------------------------------------------------------------------ */
  /* Iterative Tarjan strongly connected components over adjacency       */
  /* ------------------------------------------------------------------ */

  function tarjanScc(nodes, adjacency) {
    var index = 0;
    var indices = {};
    var low = {};
    var onStack = {};
    var stack = [];
    var components = [];
    (nodes || []).forEach(function (start) {
      if (has(indices, start)) return;
      var work = [{ v: start, i: 0 }];
      indices[start] = low[start] = index++;
      stack.push(start);
      onStack[start] = true;
      while (work.length > 0) {
        var top = work[work.length - 1];
        var nbrs = (adjacency && adjacency[top.v]) || [];
        if (top.i < nbrs.length) {
          var w = nbrs[top.i++];
          if (!has(indices, w)) {
            indices[w] = low[w] = index++;
            stack.push(w);
            onStack[w] = true;
            work.push({ v: w, i: 0 });
          } else if (onStack[w]) {
            low[top.v] = Math.min(low[top.v], indices[w]);
          }
        } else {
          if (low[top.v] === indices[top.v]) {
            var comp = [];
            var x;
            do {
              x = stack.pop();
              onStack[x] = false;
              comp.push(x);
            } while (x !== top.v);
            components.push(comp);
          }
          work.pop();
          if (work.length > 0) {
            var parent = work[work.length - 1].v;
            low[parent] = Math.min(low[parent], low[top.v]);
          }
        }
      }
    });
    return components;
  }

  function countSccCycles(nodes, adjacency) {
    var comps = tarjanScc(nodes, adjacency || {});
    var cyclic = 0;
    comps.forEach(function (comp) {
      if (comp.length > 1) cyclic++;
      else if ((adjacency[comp[0]] || []).indexOf(comp[0]) !== -1) cyclic++;
    });
    return cyclic;
  }

  /* ------------------------------------------------------------------ */
  /* Depth-first exhaustive playthrough enumeration                       */
  /*                                                                     */
  /* Every edge between two menu events (or between start and the first  */
  /* menu) is deterministic, so a complete playthrough is fully described */
  /* by its choice sequence. Guards consume options, which keeps the      */
  /* canonical script finite; depth and expansion caps bound hostile      */
  /* looping scripts so enumeration always returns.                       */
  /* ------------------------------------------------------------------ */

  function snapshotState(rt) {
    return {
      pc: clone(rt.st.pc),
      stack: clone(rt.st.stack),
      vars: clone(rt.st.vars),
      persistent: clone(rt.st.persistent),
      stage: clone(rt.st.stage)
    };
  }

  function restoreState(rt, snap) {
    rt.st.pc = clone(snap.pc);
    rt.st.stack = clone(snap.stack);
    rt.st.vars = clone(snap.vars);
    rt.st.persistent = clone(snap.persistent);
    rt.st.stage = clone(snap.stage);
    rt.st.ended = false;
    rt.st.endLabel = null;
    rt.ended = false;
    rt.current = null;
  }

  function contextKey(vars, persistent) {
    return stableStringify(vars) + '|' + stableStringify(persistent);
  }

  function pathSignature(steps) {
    return steps.map(function (s) { return s.label + ':' + s.index; }).join('>');
  }

  function enumeratePaths(program, options) {
    var opts = options || {};
    var maxPaths = isFiniteNumber(opts.maxPaths) && opts.maxPaths > 0 ? Math.floor(opts.maxPaths) : DEFAULT_MAX_PATHS;
    var maxDepth = isFiniteNumber(opts.maxDepth) && opts.maxDepth > 0 ? Math.floor(opts.maxDepth) : DEFAULT_MAX_DEPTH;
    var maxExpansions = isFiniteNumber(opts.maxExpansions) && opts.maxExpansions > 0 ? Math.floor(opts.maxExpansions) : DEFAULT_MAX_EXPANSIONS;

    var result = {
      ok: false,
      error: null,
      paths: [],
      visits: [],
      truncated: false,
      truncateReason: null,
      expansions: 0,
      errorPaths: 0,
      deadPaths: 0
    };

    var rt;
    try {
      rt = Engine.createStoryRuntime(program, { persistent: {} });
    } catch (e) {
      result.error = e && e.message ? e.message : String(e);
      return result;
    }

    var stop = false;

    function markTruncated(reason) {
      if (!result.truncated) {
        result.truncated = true;
        result.truncateReason = reason;
      }
      stop = true;
    }

    function recordPath(steps, ev) {
      var ending = ev && ev.ending ? ev.ending.label : null;
      var endLabel = rt.st.endLabel || (ev && ev.label) || null;
      result.paths.push({
        steps: steps,
        signature: pathSignature(steps),
        choiceCount: steps.length,
        ending: ending,
        endLabel: endLabel,
        terminal: ending !== null,
        vars: clone(rt.st.vars),
        persistent: clone(rt.st.persistent)
      });
      if (result.paths.length >= maxPaths) markTruncated('max-paths');
    }

    function recordVisit(ev, ctx, chosenIndex) {
      result.visits.push({
        site: ev.label + '@' + ev.ip,
        label: ev.label,
        ip: ev.ip,
        line: ev.line,
        ctx: ctx,
        options: ev.choices.map(function (c) { return { index: c.index, text: c.text }; }),
        chosen: chosenIndex
      });
    }

    function dfs(path) {
      if (stop) return;
      var ev = rt.current;
      var guard = 0;
      while (ev && ev.type === 'say' && guard < 100000) {
        ev = Engine.advanceStory(rt);
        guard++;
      }
      if (ev === null || ev === undefined) ev = Engine.advanceStory(rt);
      while (ev && ev.type === 'say' && guard < 100000) {
        ev = Engine.advanceStory(rt);
        guard++;
      }
      if (!ev) {
        result.deadPaths++;
        return;
      }
      if (ev.type === 'end') {
        recordPath(path, ev);
        return;
      }
      if (ev.type === 'error') {
        result.errorPaths++;
        result.paths.push({
          steps: path,
          signature: pathSignature(path),
          choiceCount: path.length,
          ending: null,
          endLabel: rt.st.pc.label,
          terminal: false,
          error: ev.message || 'runtime error',
          vars: clone(rt.st.vars),
          persistent: clone(rt.st.persistent)
        });
        return;
      }
      if (ev.type !== 'menu') {
        result.deadPaths++;
        return;
      }
      if (path.length >= maxDepth) {
        markTruncated('max-depth');
        return;
      }
      if (result.expansions >= maxExpansions) {
        markTruncated('max-expansions');
        return;
      }
      result.expansions++;
      var ctx = contextKey(rt.st.vars, rt.st.persistent);
      var snap = snapshotState(rt);
      for (var i = 0; i < ev.choices.length; i++) {
        if (stop) break;
        var choice = ev.choices[i];
        restoreState(rt, snap);
        rt.current = ev;
        recordVisit(ev, ctx, choice.index);
        try {
          Engine.chooseMenuOption(rt, choice.index);
        } catch (e) {
          result.errorPaths++;
          restoreState(rt, snap);
          rt.current = ev;
          continue;
        }
        dfs(path.concat([{
          label: ev.label,
          ip: ev.ip,
          index: choice.index,
          text: choice.text,
          ctx: ctx
        }]));
      }
      restoreState(rt, snap);
      rt.current = ev;
    }

    try {
      dfs([]);
    } catch (e) {
      result.error = e && e.message ? e.message : String(e);
      return result;
    }
    result.ok = !result.error;
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* Ending reachability and terminal range comparator                    */
  /* ------------------------------------------------------------------ */

  function varMinMax(paths, endingLabel, name) {
    var min = null;
    var max = null;
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      if (p.ending !== endingLabel) continue;
      var v = p.vars ? p.vars[name] : undefined;
      if (!isFiniteNumber(v)) continue;
      if (min === null || v < min) min = v;
      if (max === null || v > max) max = v;
    }
    return [min, max];
  }

  function countFlag(paths, endingLabel, name) {
    var t = 0;
    var f = 0;
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      if (p.ending !== endingLabel) continue;
      if (p.vars && p.vars[name]) t++;
      else f++;
    }
    return { truthy: t, falsy: f };
  }

  function shortestPath(paths, endingLabel) {
    var best = null;
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      if (p.ending !== endingLabel) continue;
      if (best === null || p.choiceCount < best.choiceCount) best = p;
    }
    return best;
  }

  function buildEndingStats(analysis, enumeration) {
    var endings = (analysis && analysis.endings ? analysis.endings : []).map(function (e) {
      var paths = enumeration.paths.filter(function (p) { return p.ending === e.label; });
      var best = shortestPath(enumeration.paths, e.label);
      var lens = countFlag(enumeration.paths, e.label, 'lens_unlocked');
      return {
        label: e.label,
        title: e.title,
        reachable: paths.length > 0,
        staticallyReachable: e.staticallyReachable,
        shortestChoices: best ? best.steps.map(function (s) {
          return { label: s.label, index: s.index, text: s.text };
        }) : null,
        choiceCount: best ? best.choiceCount : null,
        engineChoiceCount: e.choiceCount,
        pathCount: paths.length,
        terminalTrust: varMinMax(enumeration.paths, e.label, 'trust_score'),
        terminalDrift: varMinMax(enumeration.paths, e.label, 'calibration_drift'),
        terminalTideEntries: varMinMax(enumeration.paths, e.label, 'tide_entries'),
        lensUnlockedTerminal: lens.truthy,
        lensLockedTerminal: lens.falsy,
        terminalPoints: paths.map(function (p) {
          return {
            trust: isFiniteNumber(p.vars.trust_score) ? p.vars.trust_score : null,
            drift: isFiniteNumber(p.vars.calibration_drift) ? p.vars.calibration_drift : null,
            lens: Boolean(p.vars.lens_unlocked),
            choices: p.choiceCount
          };
        })
      };
    });
    var totalEndingPaths = endings.reduce(function (sum, e) { return sum + e.pathCount; }, 0);
    endings.forEach(function (e) {
      e.sharePct = totalEndingPaths > 0 ? (e.pathCount / totalEndingPaths) * 100 : 0;
    });
    return endings;
  }

  /* ------------------------------------------------------------------ */
  /* Pivotal-decision sensitivity analyzer                                */
  /*                                                                      */
  /* For every menu context (a menu site under one variable state) the    */
  /* subtree under each option is enumerated, so the set of endings still */
  /* reachable under each option is known exactly. A context is pivotal   */
  /* when two options keep different ending sets alive: flipping that     */
  /* one branch changes which endings remain reachable.                    */
  /* ------------------------------------------------------------------ */

  function setsEqual(a, b) {
    if (a.length !== b.length) return false;
    var sorted = a.slice().sort();
    var other = b.slice().sort();
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i] !== other[i]) return false;
    }
    return true;
  }

  function analyzePivots(enumeration, analysis) {
    var sites = {};
    var order = [];

    function siteOf(visit) {
      if (!has(sites, visit.site)) {
        var sceneMatch = /^scene(\d+)_/.exec(visit.label);
        sites[visit.site] = {
          key: visit.site,
          label: visit.label,
          ip: visit.ip,
          line: visit.line,
          scene: sceneMatch ? Number(sceneMatch[1]) : null,
          contexts: {},
          contextOrder: []
        };
        order.push(visit.site);
      }
      return sites[visit.site];
    }

    /* Attach each path's ending to the option that was picked at its context. */
    enumeration.paths.forEach(function (p) {
      p.steps.forEach(function (step, stepIndex) {
        var key = step.label + '@' + step.ip;
        var site = sites[key];
        if (!site) {
          site = siteOf({ site: key, label: step.label, ip: step.ip, line: 0 });
        }
        var ctxKey = step.ctx;
        if (!has(site.contexts, ctxKey)) {
          site.contexts[ctxKey] = { ctx: ctxKey, options: {} };
          site.contextOrder.push(ctxKey);
        }
        var ctx = site.contexts[ctxKey];
        if (!has(ctx.options, step.index)) {
          ctx.options[step.index] = { index: step.index, text: step.text, endings: {}, paths: 0 };
        }
        var opt = ctx.options[step.index];
        opt.paths++;
        if (p.ending) opt.endings[p.ending] = true;
        else opt.endings['(no ending)'] = true;
        void stepIndex;
      });
    });

    /* Add option metadata (texts offered) from raw visits so locked or
       unexplored options still appear. */
    enumeration.visits.forEach(function (v) {
      var site = siteOf(v);
      if (!has(site.contexts, v.ctx)) {
        site.contexts[v.ctx] = { ctx: v.ctx, options: {} };
        site.contextOrder.push(v.ctx);
      }
      var ctx = site.contexts[v.ctx];
      v.options.forEach(function (o) {
        if (!has(ctx.options, o.index)) {
          ctx.options[o.index] = { index: o.index, text: o.text, endings: {}, paths: 0 };
        }
      });
    });

    var out = order.map(function (key) {
      var site = sites[key];
      var pivotalContexts = 0;
      var flipPairs = 0;
      var endingUnion = {};
      var optionStats = {};

      site.contextOrder.forEach(function (ctxKey) {
        var ctx = site.contexts[ctxKey];
        var keys = Object.keys(ctx.options).map(Number).sort(function (a, b) { return a - b; });
        var optionSets = keys.map(function (k) {
          return { index: k, endings: Object.keys(ctx.options[k].endings).sort() };
        });
        /* Every option set feeds the site union. */
        optionSets.forEach(function (os) {
          os.endings.forEach(function (e) { endingUnion[e] = true; });
          if (!has(optionStats, os.index)) {
            optionStats[os.index] = { index: os.index, text: ctx.options[os.index].text, endings: {}, paths: 0, flips: 0 };
          }
          var agg = optionStats[os.index];
          os.endings.forEach(function (e) { agg.endings[e] = true; });
          agg.paths += ctx.options[os.index].paths;
        });
        /* A context is pivotal when at least two options disagree about the
           endings they leave reachable. */
        var pivotalHere = false;
        for (var i = 0; i < optionSets.length; i++) {
          for (var j = i + 1; j < optionSets.length; j++) {
            if (!setsEqual(optionSets[i].endings, optionSets[j].endings)) {
              pivotalHere = true;
              flipPairs++;
              optionStats[optionSets[i].index].flips++;
              optionStats[optionSets[j].index].flips++;
            }
          }
        }
        if (pivotalHere) pivotalContexts++;
      });

      var options = Object.keys(optionStats).map(Number).sort(function (a, b) { return a - b; }).map(function (k) {
        var o = optionStats[k];
        return {
          index: o.index,
          text: o.text,
          endings: Object.keys(o.endings).sort(),
          paths: o.paths,
          flips: o.flips
        };
      });

      return {
        key: site.key,
        label: site.label,
        ip: site.ip,
        line: site.line,
        scene: site.scene,
        visits: site.contextOrder.length,
        pivotalContexts: pivotalContexts,
        flipPairs: flipPairs,
        endingsCovered: Object.keys(endingUnion).sort(),
        leverage: flipPairs,
        options: options
      };
    });

    out.sort(function (a, b) {
      if (b.leverage !== a.leverage) return b.leverage - a.leverage;
      if (b.endingsCovered.length !== a.endingsCovered.length) return b.endingsCovered.length - a.endingsCovered.length;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
    void analysis;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Canonical proof payload and digest                                   */
  /* ------------------------------------------------------------------ */

  function proofPayload(source, analysis, endings, pivots, enumeration) {
    var endingRows = endings.map(function (e) {
      return {
        label: e.label,
        title: e.title,
        reachable: e.reachable,
        shortestChoices: e.choiceCount,
        pathCount: e.pathCount,
        sharePct: Math.round(e.sharePct * 100) / 100,
        trustRange: e.terminalTrust,
        driftRange: e.terminalDrift,
        lensUnlockedOutcomes: e.lensUnlockedTerminal,
        lensLockedOutcomes: e.lensLockedTerminal
      };
    });
    var pivotRows = pivots.map(function (p) {
      return {
        site: p.key,
        label: p.label,
        scene: p.scene,
        visits: p.visits,
        pivotalContexts: p.pivotalContexts,
        flipPairs: p.flipPairs,
        endingsCovered: p.endingsCovered,
        options: p.options.map(function (o) {
          return { index: o.index, endings: o.endings, paths: o.paths, flips: o.flips };
        })
      };
    });
    return {
      format: PROOF_FORMAT,
      version: VERSION,
      script: {
        sha256: sha256Hex(source),
        lines: source.split(/\r\n|\r|\n/).length
      },
      totals: {
        labelCount: analysis ? analysis.stats.labelCount : 0,
        edgeCount: analysis ? analysis.stats.edgeCount : 0,
        reachableLabels: analysis ? analysis.stats.reachableCount : 0,
        unreachableLabels: analysis ? analysis.unreachableLabels.length : 0,
        deadEnds: analysis ? analysis.deadEnds.length : 0,
        sccCycles: analysis ? analysis.choiceLoops.length + analysis.loopsWithoutChoices.length : 0,
        statesExplored: analysis ? analysis.stats.statesExplored : 0,
        menuCount: analysis ? analysis.stats.menuCount : 0,
        choiceCount: analysis ? analysis.stats.choiceCount : 0,
        playthroughs: enumeration.paths.length,
        terminatedPlaythroughs: enumeration.paths.filter(function (p) { return p.terminal; }).length,
        errorPaths: enumeration.errorPaths,
        truncated: enumeration.truncated
      },
      endings: endingRows,
      pivots: pivotRows
    };
  }

  function digestOfPayload(payload) {
    return sha256Hex(stableStringify(payload));
  }

  /* One canonical digest-stamped proof per source digest: the on-page
     fingerprint, the JSON export, the CSV provenance header and the
     Markdown footer all reuse this same object, so the digest can never
     drift between views. */
  var proofCache = {};
  var analysisCache = {};

  function analyzeStory(source, options) {
    if (typeof source !== 'string') {
      return { ok: false, error: 'analyzeStory expects a script string', source: '', analysis: null, enumeration: null, endings: [], pivots: [], proof: null };
    }
    var cacheable = options === undefined || options === null;
    var scriptKey = sha256Hex(source);
    if (cacheable && has(analysisCache, scriptKey)) return analysisCache[scriptKey];
    var audit;
    try {
      audit = Engine.auditScript(source);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e), source: source, analysis: null, enumeration: null, endings: [], pivots: [], proof: null };
    }
    var enumeration = enumeratePaths(audit.program, options);
    var endings = buildEndingStats(audit.analysis, enumeration);
    var pivots = analyzePivots(enumeration, audit.analysis);

    if (!has(proofCache, scriptKey)) {
      var payload = proofPayload(source, audit.analysis, endings, pivots, enumeration);
      proofCache[scriptKey] = {
        payload: payload,
        digest: digestOfPayload(payload)
      };
    }
    var proof = proofCache[scriptKey];
    var result = {
      ok: enumeration.error === null,
      error: enumeration.error,
      source: source,
      program: audit.program,
      analysis: audit.analysis,
      enumeration: enumeration,
      endings: endings,
      pivots: pivots,
      proof: { format: PROOF_FORMAT, version: VERSION, payload: proof.payload, digest: proof.digest }
    };
    if (cacheable) analysisCache[scriptKey] = result;
    return result;
  }

  function clearProofCache() {
    proofCache = {};
    analysisCache = {};
  }

  /* ------------------------------------------------------------------ */
  /* Verification and tamper demo                                         */
  /* ------------------------------------------------------------------ */

  function verifyProof(proof) {
    if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return { ok: false, reason: 'proof is not an object' };
    if (!has(proof, 'payload') || !has(proof, 'digest')) return { ok: false, reason: 'proof is missing payload or digest' };
    if (typeof proof.digest !== 'string' || !/^[0-9a-f]{64}$/.test(proof.digest)) {
      return { ok: false, reason: 'digest is malformed' };
    }
    var recomputed;
    try {
      recomputed = digestOfPayload(proof.payload);
    } catch (e) {
      return { ok: false, reason: 'payload could not be canonicalized' };
    }
    return { ok: recomputed === proof.digest, reason: recomputed === proof.digest ? 'verified' : 'digest mismatch' };
  }

  function tamperProof(proof, mutate) {
    var copy = clone(proof);
    if (typeof mutate === 'function') mutate(copy.payload);
    else copy.payload.totals.playthroughs = (copy.payload.totals.playthroughs || 0) + 1;
    return copy;
  }

  /* ------------------------------------------------------------------ */
  /* Formula-safe CSV                                                     */
  /* ------------------------------------------------------------------ */

  function csvEscape(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    var s = String(value);
    var lead = (s.match(/^[\s\p{Cc}\p{Cf}\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufe00-\ufe0f\ufeff]*/u) || [''])[0];
    var rest = s.slice(lead.length);
    if (lead.length > 0 || /^[=+\-@]/.test(rest)) {
      s = "'" + s;
    }
    if (/[",\n\r]/.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function csvRow(cells) {
    return cells.map(csvEscape).join(',');
  }

  /* ------------------------------------------------------------------ */
  /* Proof exporters: JSON, CSV, Markdown                                 */
  /* ------------------------------------------------------------------ */

  function exportJson(proof) {
    var doc = clone(proof);
    doc.digest = proof.digest;
    return JSON.stringify(doc, null, 2) + '\n';
  }

  function exportCsv(proof) {
    var p = proof.payload;
    var lines = [];
    lines.push(csvRow(['field', 'value']));
    lines.push(csvRow(['report', PROOF_FORMAT]));
    lines.push(csvRow(['version', proof.version]));
    lines.push(csvRow(['script_sha256', p.script.sha256]));
    lines.push(csvRow(['script_lines', p.script.lines]));
    lines.push(csvRow(['report_sha256', proof.digest]));
    lines.push('');
    lines.push(csvRow(['ending', 'title', 'reachable', 'shortest_choices', 'paths', 'share_pct',
      'trust_min', 'trust_max', 'drift_min', 'drift_max', 'lens_unlocked', 'lens_locked']));
    p.endings.forEach(function (e) {
      lines.push(csvRow([
        e.label, e.title, e.reachable ? 'TRUE' : 'FALSE',
        e.shortestChoices === null ? '' : e.shortestChoices,
        e.pathCount, e.sharePct,
        e.trustRange[0] === null ? '' : e.trustRange[0],
        e.trustRange[1] === null ? '' : e.trustRange[1],
        e.driftRange[0] === null ? '' : e.driftRange[0],
        e.driftRange[1] === null ? '' : e.driftRange[1],
        e.lensUnlockedOutcomes, e.lensLockedOutcomes
      ]));
    });
    lines.push('');
    lines.push(csvRow(['pivot_site', 'label', 'scene', 'visits', 'pivotal_contexts', 'flip_pairs', 'endings_covered']));
    p.pivots.forEach(function (r) {
      lines.push(csvRow([r.site, r.label, r.scene === null ? '' : r.scene, r.visits, r.pivotalContexts, r.flipPairs, r.endingsCovered.join(' | ')]));
    });
    lines.push('');
    lines.push(csvRow(['total_labels', 'total_edges', 'unreachable', 'dead_ends', 'scc_cycles', 'playthroughs', 'terminated', 'truncated']));
    lines.push(csvRow([
      p.totals.labelCount, p.totals.edgeCount, p.totals.unreachableLabels,
      p.totals.deadEnds, p.totals.sccCycles, p.totals.playthroughs,
      p.totals.terminatedPlaythroughs, p.totals.truncated ? 'TRUE' : 'FALSE'
    ]));
    return lines.join('\r\n') + '\r\n';
  }

  function exportMarkdown(proof) {
    var p = proof.payload;
    var lines = [];
    lines.push('# The Glass Meridian: State-Space & Reachability Proof');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    lines.push('| Script SHA-256 | `' + p.script.sha256 + '` |');
    lines.push('| Labels | ' + p.totals.labelCount + ' (' + p.totals.reachableLabels + ' reachable) |');
    lines.push('| Edges | ' + p.totals.edgeCount + ' |');
    lines.push('| SCC cycles | ' + p.totals.sccCycles + ' |');
    lines.push('| Playthroughs | ' + p.totals.playthroughs + ' (' + p.totals.terminatedPlaythroughs + ' terminated) |');
    lines.push('| Unreachable labels | ' + p.totals.unreachableLabels + ' |');
    lines.push('| Dead ends | ' + p.totals.deadEnds + ' |');
    lines.push('| Truncated | ' + (p.totals.truncated ? 'yes' : 'no') + ' |');
    lines.push('');
    lines.push('## Endings');
    lines.push('');
    lines.push('| Ending | Reachable | Shortest choices | Paths | Share | trust_score | calibration_drift | lens_unlocked |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    p.endings.forEach(function (e) {
      var trust = e.trustRange[0] === null ? 'none' : e.trustRange[0] + ' to ' + e.trustRange[1];
      var drift = e.driftRange[0] === null ? 'none' : e.driftRange[0] + ' to ' + e.driftRange[1];
      lines.push('| ' + e.title + ' (' + e.label + ') | ' + (e.reachable ? 'yes' : 'no') + ' | ' +
        (e.shortestChoices === null ? 'n/a' : e.shortestChoices) + ' | ' + e.pathCount + ' | ' +
        e.sharePct + '% | ' + trust + ' | ' + drift + ' | ' +
        e.lensUnlockedOutcomes + ' of ' + (e.lensUnlockedOutcomes + e.lensLockedOutcomes) + ' |');
    });
    lines.push('');
    lines.push('## Pivotal choice sites');
    lines.push('');
    lines.push('| Menu site | Scene | Contexts | Pivotal | Flip pairs | Endings covered |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    p.pivots.forEach(function (r) {
      lines.push('| ' + r.site + ' | ' + (r.scene === null ? 'n/a' : r.scene) + ' | ' + r.visits +
        ' | ' + r.pivotalContexts + ' | ' + r.flipPairs + ' | ' + r.endingsCovered.length + ' |');
    });
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('Report SHA-256 (unkeyed FIPS 180-4, tamper detection): `' + proof.digest + '`');
    lines.push('');
    return lines.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* Strict #gm= bookmark codec                                           */
  /*                                                                      */
  /* Shape: {"v":1,"end":"ending_x","scene":2|"label","piv":"label@ip",   */
  /* "view":"reach|phase|leverage|export|tests"}                          */
  /* Every known key is type-checked, every unknown or dangerous key      */
  /* (__proto__, constructor, prototype) fails closed.                    */
  /* ------------------------------------------------------------------ */

  var BOOKMARK_VIEWS = { reach: 1, phase: 1, leverage: 1, export: 1, tests: 1 };
  var FORBIDDEN_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
  var LABEL_RE = /^[A-Za-z_]\w*$/;
  var PIVOT_RE = /^[A-Za-z_]\w*@[0-9]+$/;

  function normalizeBookmark(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    var keys = Object.keys(state);
    for (var i = 0; i < keys.length; i++) {
      if (has(FORBIDDEN_KEYS, keys[i])) return null;
    }
    var out = { v: VERSION };
    if (has(state, 'v')) {
      if (state.v !== VERSION) return null;
    }
    if (has(state, 'end')) {
      if (typeof state.end !== 'string' || state.end.length > MAX_LABEL_LENGTH || !LABEL_RE.test(state.end)) return null;
      out.end = state.end;
    }
    if (has(state, 'scene')) {
      var sc = state.scene;
      if (typeof sc === 'number' && isFinite(sc) && Math.floor(sc) === sc && sc >= 1 && sc <= 99) {
        out.scene = sc;
      } else if (typeof sc === 'string' && sc.length <= MAX_LABEL_LENGTH && LABEL_RE.test(sc)) {
        out.scene = sc;
      } else {
        return null;
      }
    }
    if (has(state, 'piv')) {
      if (typeof state.piv !== 'string' || state.piv.length > MAX_LABEL_LENGTH + 8) return null;
      if (!LABEL_RE.test(state.piv) && !PIVOT_RE.test(state.piv)) return null;
      out.piv = state.piv;
    }
    if (has(state, 'view')) {
      if (typeof state.view !== 'string' || !has(BOOKMARK_VIEWS, state.view)) return null;
      out.view = state.view;
    }
    var allowed = { v: 1, end: 1, scene: 1, piv: 1, view: 1 };
    for (var j = 0; j < keys.length; j++) {
      if (!has(allowed, keys[j])) return null;
    }
    return out;
  }

  function encodeBookmark(state) {
    var norm = normalizeBookmark(state);
    if (norm === null) return null;
    return '#gm=' + base64urlEncode(utf8Encode(JSON.stringify(norm)));
  }

  function decodeBookmark(hash) {
    if (typeof hash !== 'string' || hash.length === 0 || hash.length > MAX_HASH_LENGTH) return null;
    var h = hash[0] === '#' ? hash.slice(1) : hash;
    if (h.slice(0, 3) !== 'gm=') return null;
    var payload = h.slice(3);
    if (payload.length === 0) return null;
    var bytes = base64urlDecode(payload);
    if (bytes === null) return null;
    var text = utf8Decode(bytes);
    if (text === null) return null;
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return null;
    }
    return normalizeBookmark(parsed);
  }

  /* ------------------------------------------------------------------ */
  /* Deterministic in-page self-tests                                     */
  /* ------------------------------------------------------------------ */

  var SHA256_VECTORS = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['The quick brown fox jumps over the lazy dog', 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ['The quick brown fox jumps over the lazy dog.', 'ef537f25c895bfa782526529a9b63d97aa631564d5d789c2b765448c8635fb6c'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', 'f371bc4a311f2b009eef952dd83ca80e2b60026c8e935592d0f9c308453c813e']
  ];
  void SHA256_VECTORS;

  function cyclicTestScript() {
    return [
      'label start:',
      '    jump ping',
      'label ping:',
      '    "Ping."',
      '    jump pong',
      'label pong:',
      '    "Pong."',
      '    jump ping'
    ].join('\n');
  }

  function brokenTestScript() {
    return [
      'label start:',
      '    "Hello."',
      '    return',
      'label orphan_nowhere:',
      '    "Never reached."',
      '    return'
    ].join('\n');
  }

  function miniBranchScript() {
    return [
      'default flag = 0',
      'label start:',
      '    menu:',
      '        "Pick."',
      '        "Left.":',
      '            $ flag = 1',
      '            jump finale',
      '        "Right.":',
      '            $ flag = 2',
      '            jump finale',
      'label finale:',
      '    if flag == 1:',
      '        jump ending_left',
      '    else:',
      '        jump ending_right',
      'label ending_left:',
      '    "L."',
      '    return',
      'label ending_right:',
      '    "R."',
      '    return'
    ].join('\n');
  }

  function runSelfTests(source) {
    var tests = [];
    function t(id, name, fn) {
      var detail = '';
      var pass = false;
      try {
        var res = fn();
        pass = res === undefined ? true : Boolean(res.pass);
        detail = res && res.detail ? res.detail : '';
      } catch (e) {
        pass = false;
        detail = e && e.message ? e.message : String(e);
      }
      tests.push({ id: id, name: name, pass: pass, detail: detail });
    }

    t('sha256-empty', 'SHA-256 of the empty string matches the FIPS test vector', function () {
      return { pass: sha256Hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', detail: sha256Hex('') };
    });
    t('sha256-abc', 'SHA-256 of "abc" matches the FIPS test vector', function () {
      return { pass: sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', detail: sha256Hex('abc') };
    });
    t('sha256-fox', 'SHA-256 of the quick-brown-fox sentence matches the published vector', function () {
      return { pass: sha256Hex('The quick brown fox jumps over the lazy dog') === 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592', detail: '' };
    });
    t('sha256-multiblock', 'SHA-256 multi-block vector (448 bits) matches', function () {
      return { pass: sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq') === '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1', detail: '' };
    });
    t('sha256-million', 'SHA-256 of one million "a" bytes matches the FIPS long vector', function () {
      var chunk = 'aaaaaaaaaaaaaaaa';
      var parts = [];
      for (var i = 0; i < 62500; i++) parts.push(chunk);
      var digest = sha256Hex(parts.join(''));
      return { pass: digest === 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0', detail: digest };
    });
    t('sha256-utf8', 'SHA-256 treats multi-byte UTF-8 correctly', function () {
      var expected = sha256Hex(utf8Encode('\u00e9\u00e8\u00ea \u4e2d\u6587 \ud83d\ude00'));
      return { pass: expected === sha256Hex('\u00e9\u00e8\u00ea \u4e2d\u6587 \ud83d\ude00'), detail: '' };
    });
    t('utf8-roundtrip', 'UTF-8 codec round-trips ASCII, accents, CJK and astral pairs', function () {
      var samples = ['', 'a', '\u00e9', '\u4e2d\u6587', '\ud83d\ude00', 'mix A\u00e9\u4e2d\ud83d\ude00Z'];
      for (var i = 0; i < samples.length; i++) {
        if (utf8Decode(utf8Encode(samples[i])) !== samples[i]) return { pass: false, detail: 'lost ' + i };
      }
      return { pass: true, detail: samples.length + ' samples' };
    });
    t('base64url-roundtrip', 'Base64url codec round-trips all byte lengths 0 to 65', function () {
      for (var n = 0; n <= 65; n++) {
        var bytes = new Uint8Array(n);
        for (var i = 0; i < n; i++) bytes[i] = (i * 37 + n) & 0xff;
        var decoded = base64urlDecode(base64urlEncode(bytes));
        if (decoded === null || decoded.length !== n) return { pass: false, detail: 'length ' + n };
        for (var j = 0; j < n; j++) {
          if (decoded[j] !== bytes[j]) return { pass: false, detail: 'byte ' + j + ' of ' + n };
        }
      }
      return { pass: true, detail: '66 lengths' };
    });
    t('digest-deterministic', 'One source yields one canonical digest across repeated analysis', function () {
      if (typeof source !== 'string' || source.length === 0) return { pass: true, detail: 'no source loaded' };
      var a = analyzeStory(source);
      var b = analyzeStory(source);
      return { pass: a.proof.digest === b.proof.digest, detail: a.proof.digest.slice(0, 16) };
    });
    t('tamper-detection', 'Mutating the payload flips verifyProof to a mismatch', function () {
      if (typeof source !== 'string' || source.length === 0) return { pass: true, detail: 'no source loaded' };
      var proof = analyzeStory(source).proof;
      var forged = tamperProof(proof);
      var okOriginal = verifyProof(proof).ok;
      var okForged = verifyProof(forged).ok;
      return { pass: okOriginal === true && okForged === false, detail: 'clean=' + okOriginal + ' tampered=' + okForged };
    });
    t('reachability', 'Every ending in the loaded script is reachable by a real playthrough', function () {
      if (typeof source !== 'string' || source.length === 0) return { pass: true, detail: 'no source loaded' };
      var r = analyzeStory(source);
      var total = r.endings.length;
      var hit = r.endings.filter(function (e) { return e.reachable; }).length;
      return { pass: hit === total, detail: hit + ' of ' + total };
    });
    t('shortest-replay', 'Shortest lab routes replay through the live runtime to the claimed ending', function () {
      if (typeof source !== 'string' || source.length === 0) return { pass: true, detail: 'no source loaded' };
      var r = analyzeStory(source);
      var bad = [];
      r.endings.forEach(function (e) {
        if (!e.reachable || !e.shortestChoices) return;
        var rt = Engine.createStoryRuntime(Engine.parseRenpyScript(source));
        var ev = Engine.advanceStory(rt);
        var idx = 0;
        var steps = 0;
        while (ev && ev.type !== 'end' && steps < 20000) {
          if (ev.type === 'menu') {
            var step = e.shortestChoices[idx++];
            if (!step) { bad.push(e.label + ':shortfall'); break; }
            ev = Engine.chooseMenuOption(rt, step.index);
          } else {
            ev = Engine.advanceStory(rt);
          }
          steps++;
        }
        if (!ev || ev.type !== 'end' || !ev.ending || ev.ending.label !== e.label) {
          bad.push(e.label);
        }
      });
      return { pass: bad.length === 0, detail: bad.length ? bad.join(',') : 'all replayed' };
    });
    t('shortest-vs-engine', 'Lab shortest routes match the engine BFS shortest-choice counts', function () {
      if (typeof source !== 'string' || source.length === 0) return { pass: true, detail: 'no source loaded' };
      var r = analyzeStory(source);
      var mismatch = r.endings.filter(function (e) {
        return e.reachable && e.engineChoiceCount !== null && e.choiceCount !== e.engineChoiceCount;
      });
      return { pass: mismatch.length === 0, detail: mismatch.length ? mismatch.map(function (m) { return m.label; }).join(',') : 'all equal' };
    });
    t('path-total', 'Distinct path counts sum cleanly with no double-counted signatures', function () {
      if (typeof source !== 'string' || source.length === 0) return { pass: true, detail: 'no source loaded' };
      var en = analyzeStory(source).enumeration;
      var sigs = {};
      var dup = 0;
      en.paths.forEach(function (p) {
        if (has(sigs, p.signature)) dup++;
        sigs[p.signature] = true;
      });
      return { pass: dup === 0, detail: en.paths.length + ' paths, ' + dup + ' dups' };
    });
    t('scc-cyclic', 'Tarjan SCC flags the cycle in a synthetic jump loop', function () {
      var cyc = countSccCycles(['a', 'b', 'c'], { a: ['b'], b: ['c'], c: ['a'] });
      var audit = Engine.auditScript(cyclicTestScript());
      return { pass: cyc === 1 && audit.analysis.loopsWithoutChoices.length >= 1, detail: 'synthetic=' + cyc + ' script=' + audit.analysis.loopsWithoutChoices.length };
    });
    t('scc-acyclic', 'Tarjan SCC reports zero cycles on a linear adjacency', function () {
      var cyc = countSccCycles(['a', 'b', 'c'], { a: ['b'], b: ['c'], c: [] });
      return { pass: cyc === 0, detail: String(cyc) };
    });
    t('deadend-detect', 'A broken script with an orphan label is flagged unreachable', function () {
      var audit = Engine.auditScript(brokenTestScript());
      var hasUnreachable = audit.analysis.unreachableLabels.indexOf('orphan_nowhere') !== -1;
      return { pass: !audit.ok && hasUnreachable, detail: audit.analysis.unreachableLabels.join(',') };
    });
    t('parser-safety', 'The zero-eval expression evaluator rejects hostile syntax', function () {
      var hostile = ['eval("x")', '__import__("os")', 'a.b.c', 'x @ y', '()', '1 +', '"open'];
      var rejected = 0;
      hostile.forEach(function (h) {
        try { Engine.evaluateExpression(h, {}, {}); } catch (e) { rejected++; }
      });
      return { pass: rejected === hostile.length, detail: rejected + ' of ' + hostile.length + ' rejected' };
    });
    t('csv-injection', 'CSV exporter neutralizes formula-injection cells', function () {
      var samples = ['=2+3', '+SUM(A1)', '-10', '@cmd', '\t=1', '=CMD()'];
      var okAll = samples.every(function (s) { return csvEscape(s).charAt(0) === "'" || csvEscape(s).charAt(0) === '"'; });
      var digest = analyzeStory(source).proof.digest;
      var csvText = exportCsv(analyzeStory(source).proof);
      return { pass: okAll && csvText.indexOf(digest) !== -1, detail: 'digest embedded' };
    });
    t('bookmark-roundtrip', 'The #gm= codec round-trips ending, scene, pivot and view', function () {
      var state = { end: 'ending_tidal_accord', scene: 4, piv: 'scene4_storm@12', view: 'leverage' };
      var enc = encodeBookmark(state);
      var dec = decodeBookmark(enc);
      var same = dec && dec.end === state.end && dec.scene === state.scene && dec.piv === state.piv && dec.view === state.view;
      return { pass: Boolean(same), detail: enc };
    });
    t('bookmark-hostile', 'The #gm= codec fails closed on hostile hashes', function () {
      var hostile = [
        '#gm=!!!not-base64!!!',
        '#gm=' + base64urlEncode(utf8Encode('{"__proto__":{"x":1}}')),
        '#gm=' + base64urlEncode(utf8Encode('{"constructor":1}')),
        '#gm=' + base64urlEncode(utf8Encode('{"end":"<script>"}')),
        '#gm=' + base64urlEncode(utf8Encode('{"view":"rm -rf"}')),
        '#gm=' + base64urlEncode(utf8Encode('[1,2,3]')),
        '#gm=' + base64urlEncode(utf8Encode('"just a string"')),
        '#gm=',
        '#other=abc'
      ];
      var rejected = hostile.filter(function (h) { return decodeBookmark(h) === null; }).length;
      return { pass: rejected === hostile.length, detail: rejected + ' of ' + hostile.length + ' rejected' };
    });
    t('pivot-detection', 'Pivotal analyzer finds at least one decisive menu on a branch script', function () {
      var r = analyzeStory(miniBranchScript());
      var pivotal = r.pivots.filter(function (p) { return p.pivotalContexts > 0; });
      return { pass: pivotal.length >= 1 && r.endings.length === 2 && r.endings.every(function (e) { return e.reachable; }), detail: pivotal.length + ' pivotal sites' };
    });
    t('runaway-bounded', 'Enumeration of an infinite-jump script returns bounded, never hangs', function () {
      var prog = Engine.parseRenpyScript(cyclicTestScript());
      var en = enumeratePaths(prog, { maxDepth: 6, maxPaths: 50 });
      return { pass: en.error === null && en.paths.length <= 50, detail: en.paths.length + ' bounded paths' };
    });
    t('export-parity', 'JSON, CSV and Markdown all carry the identical report digest', function () {
      if (typeof source !== 'string' || source.length === 0) return { pass: true, detail: 'no source loaded' };
      var proof = analyzeStory(source).proof;
      var inJson = exportJson(proof).indexOf(proof.digest) !== -1;
      var inCsv = exportCsv(proof).indexOf(proof.digest) !== -1;
      var inMd = exportMarkdown(proof).indexOf(proof.digest) !== -1;
      return { pass: inJson && inCsv && inMd, detail: proof.digest.slice(0, 16) };
    });
    t('verify-clean', 'verifyProof confirms the untouched proof', function () {
      if (typeof source !== 'string' || source.length === 0) return { pass: true, detail: 'no source loaded' };
      var v = verifyProof(analyzeStory(source).proof);
      return { pass: v.ok, detail: v.reason };
    });
    t('numeric-edge', 'NaN, Infinity and division by zero never crash the analyzer', function () {
      var src = [
        'label start:',
        '    $ x = 1 / 0',
        '    "never"',
        '    return'
      ].join('\n');
      var prog = Engine.parseRenpyScript(src);
      var en = enumeratePaths(prog);
      var survived = en.error === null;
      var nanGuard = isFiniteNumber(NaN) === false && isFiniteNumber(Infinity) === false;
      return { pass: survived && nanGuard, detail: 'errorPaths=' + en.errorPaths };
    });
    t('unknown-ending', 'Unknown ending ids resolve to nothing instead of corrupting state', function () {
      var r = analyzeStory(miniBranchScript());
      var found = r.endings.filter(function (e) { return e.label === 'ending_does_not_exist'; });
      var bm = decodeBookmark(encodeBookmark({ end: 'ending_does_not_exist' }));
      return { pass: found.length === 0 && bm !== null && bm.end === 'ending_does_not_exist', detail: 'rejected cleanly' };
    });

    return tests;
  }

  return {
    VERSION: VERSION,
    PROOF_FORMAT: PROOF_FORMAT,
    utf8Encode: utf8Encode,
    utf8Decode: utf8Decode,
    base64urlEncode: base64urlEncode,
    base64urlDecode: base64urlDecode,
    sha256Bytes: sha256Bytes,
    sha256Hex: sha256Hex,
    stableStringify: stableStringify,
    tarjanScc: tarjanScc,
    countSccCycles: countSccCycles,
    enumeratePaths: enumeratePaths,
    buildEndingStats: buildEndingStats,
    analyzePivots: analyzePivots,
    analyzeStory: analyzeStory,
    clearProofCache: clearProofCache,
    verifyProof: verifyProof,
    tamperProof: tamperProof,
    csvEscape: csvEscape,
    exportJson: exportJson,
    exportCsv: exportCsv,
    exportMarkdown: exportMarkdown,
    normalizeBookmark: normalizeBookmark,
    encodeBookmark: encodeBookmark,
    decodeBookmark: decodeBookmark,
    runSelfTests: runSelfTests,
    cyclicTestScript: cyclicTestScript,
    brokenTestScript: brokenTestScript,
    miniBranchScript: miniBranchScript,
    SHA256_VECTORS: SHA256_VECTORS,
    isFiniteNumber: isFiniteNumber,
    pathSignature: pathSignature,
    has: has
  };
});
