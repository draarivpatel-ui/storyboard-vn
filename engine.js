/*
 * The Glass Meridian: engine.js
 *
 * A Ren'Py script subset parser, a deterministic story runtime, and a narrative
 * graph analyzer. One file, no dependencies, no eval. It loads in the browser
 * (window.StoryEngine) and in Node (require), so the same code is played on the
 * web and verified by node:test.
 *
 * Supported subset of Ren'Py 8 script syntax
 *   define name = Character("Display", color="#hex")
 *   default name = literal            (also default persistent.name = literal)
 *   image tag attr = "file.svg"       (or Composite(...) with several svg layers)
 *   label name:                       (fall through into the next label, as in Ren'Py)
 *   scene / show / hide / with        (stage directions)
 *   speaker "text"  or  "text"        (dialogue and narration, with [name] interpolation)
 *   menu: caption, then  "choice" if guard:  blocks
 *   $ name = expr, +=, -=, *=, /=, //=, %=
 *   if / elif / else
 *   jump label, call label, return, pass
 * Anything else is reported as a warning and skipped, never executed.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.StoryEngine = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;
  var MAX_STEPS = 20000;
  var MAX_CHECKPOINTS = 200;
  var DEFAULT_MAX_STATES = 60000;

  function StoryError(message) {
    this.name = 'StoryError';
    this.message = message;
    this.stack = new Error(message).stack;
  }
  StoryError.prototype = Object.create(Error.prototype);
  StoryError.prototype.constructor = StoryError;

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
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + stableStringify(value[k]); }).join(',') + '}';
  }

  /* ------------------------------------------------------------------ */
  /* Expressions: tokenizer, parser, evaluator                           */
  /* ------------------------------------------------------------------ */

  var NAME_START = /[A-Za-z_]/;
  var NAME_PART = /[A-Za-z0-9_]/;
  var DIGIT = /[0-9]/;
  var KEYWORD_OPS = { and: 1, or: 1, not: 1 };
  var CONSTANTS = { True: true, False: false, None: null };

  function tokenizeExpression(src) {
    var tokens = [];
    var i = 0;
    while (i < src.length) {
      var c = src[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (DIGIT.test(c) || (c === '.' && DIGIT.test(src[i + 1] || ''))) {
        var j = i;
        var dots = 0;
        while (j < src.length && (DIGIT.test(src[j]) || src[j] === '.')) {
          if (src[j] === '.') dots++;
          j++;
        }
        if (dots > 1) throw new StoryError('Malformed number "' + src.slice(i, j) + '"');
        tokens.push({ t: 'num', v: Number(src.slice(i, j)) });
        i = j;
        continue;
      }
      if (c === '"' || c === "'") {
        var s = scanString(src, i);
        if (!s) throw new StoryError('Unterminated string in expression');
        tokens.push({ t: 'str', v: s.value });
        i = s.end;
        continue;
      }
      if (NAME_START.test(c)) {
        var k = i;
        while (k < src.length && (NAME_PART.test(src[k]) || src[k] === '.')) k++;
        var word = src.slice(i, k);
        if (has(KEYWORD_OPS, word)) tokens.push({ t: 'kw', v: word });
        else tokens.push({ t: 'name', v: word });
        i = k;
        continue;
      }
      var two = src.slice(i, i + 2);
      if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '//') {
        tokens.push({ t: 'op', v: two });
        i += 2;
        continue;
      }
      if ('+-*/%<>()'.indexOf(c) !== -1) {
        tokens.push({ t: c === '(' ? 'lp' : c === ')' ? 'rp' : 'op', v: c });
        i++;
        continue;
      }
      throw new StoryError('Unsupported character "' + c + '" in expression');
    }
    return tokens;
  }

  function parseExpression(src) {
    var tokens = tokenizeExpression(src);
    var pos = 0;

    function peek() { return tokens[pos]; }
    function isKw(word) { return pos < tokens.length && tokens[pos].t === 'kw' && tokens[pos].v === word; }
    function isOp(list) {
      return pos < tokens.length && tokens[pos].t === 'op' && list.indexOf(tokens[pos].v) !== -1;
    }

    function parseOr() {
      var left = parseAnd();
      while (isKw('or')) { pos++; left = { k: 'or', a: left, b: parseAnd() }; }
      return left;
    }
    function parseAnd() {
      var left = parseNot();
      while (isKw('and')) { pos++; left = { k: 'and', a: left, b: parseNot() }; }
      return left;
    }
    function parseNot() {
      if (isKw('not')) { pos++; return { k: 'not', a: parseNot() }; }
      return parseCompare();
    }
    function parseCompare() {
      var first = parseSum();
      var ops = [];
      var items = [first];
      while (isOp(['==', '!=', '<', '<=', '>', '>='])) {
        ops.push(tokens[pos].v);
        pos++;
        items.push(parseSum());
      }
      return ops.length === 0 ? first : { k: 'cmp', ops: ops, items: items };
    }
    function parseSum() {
      var left = parseTerm();
      while (isOp(['+', '-'])) {
        var op = tokens[pos].v;
        pos++;
        left = { k: 'bin', op: op, a: left, b: parseTerm() };
      }
      return left;
    }
    function parseTerm() {
      var left = parseUnary();
      while (isOp(['*', '/', '//', '%'])) {
        var op = tokens[pos].v;
        pos++;
        left = { k: 'bin', op: op, a: left, b: parseUnary() };
      }
      return left;
    }
    function parseUnary() {
      if (isOp(['-', '+'])) {
        var op = tokens[pos].v;
        pos++;
        return { k: 'un', op: op, a: parseUnary() };
      }
      return parseAtom();
    }
    function parseAtom() {
      var tok = peek();
      if (!tok) throw new StoryError('Unexpected end of expression');
      if (tok.t === 'num') { pos++; return { k: 'lit', v: tok.v }; }
      if (tok.t === 'str') { pos++; return { k: 'lit', v: tok.v }; }
      if (tok.t === 'name') {
        pos++;
        if (has(CONSTANTS, tok.v)) return { k: 'lit', v: CONSTANTS[tok.v] };
        return { k: 'name', name: tok.v };
      }
      if (tok.t === 'lp') {
        pos++;
        var inner = parseOr();
        if (!peek() || peek().t !== 'rp') throw new StoryError('Missing closing parenthesis');
        pos++;
        return inner;
      }
      throw new StoryError('Unexpected "' + tok.v + '" in expression');
    }

    if (tokens.length === 0) throw new StoryError('Empty expression');
    var ast = parseOr();
    if (pos < tokens.length) throw new StoryError('Unexpected "' + tokens[pos].v + '" in expression');
    return ast;
  }

  function truthy(v) {
    return !(v === null || v === false || v === 0 || v === '' || v === undefined);
  }

  function lookupName(name, env) {
    if (name.indexOf('persistent.') === 0) {
      var key = name.slice('persistent.'.length);
      if (key.indexOf('.') !== -1) throw new StoryError('Unsupported attribute access "' + name + '"');
      return has(env.persistent, key) ? env.persistent[key] : null;
    }
    if (name.indexOf('.') !== -1) throw new StoryError('Unsupported attribute access "' + name + '"');
    if (!has(env.vars, name)) throw new StoryError('name "' + name + '" is not defined');
    return env.vars[name];
  }

  function kindOf(v) {
    if (v === null) return 'None';
    if (typeof v === 'boolean') return 'bool';
    return typeof v;
  }

  function evalAst(ast, env) {
    switch (ast.k) {
      case 'lit': return ast.v;
      case 'name': return lookupName(ast.name, env);
      case 'not': return !truthy(evalAst(ast.a, env));
      case 'and': {
        var l = evalAst(ast.a, env);
        return truthy(l) ? evalAst(ast.b, env) : l;
      }
      case 'or': {
        var l2 = evalAst(ast.a, env);
        return truthy(l2) ? l2 : evalAst(ast.b, env);
      }
      case 'un': {
        var v = evalAst(ast.a, env);
        if (typeof v !== 'number' && typeof v !== 'boolean') throw new StoryError('Cannot apply unary ' + ast.op + ' to ' + kindOf(v));
        return ast.op === '-' ? -Number(v) : Number(v);
      }
      case 'bin': return applyBinary(ast.op, evalAst(ast.a, env), evalAst(ast.b, env));
      case 'cmp': {
        var left = evalAst(ast.items[0], env);
        for (var i = 0; i < ast.ops.length; i++) {
          var right = evalAst(ast.items[i + 1], env);
          if (!compare(ast.ops[i], left, right)) return false;
          left = right;
        }
        return true;
      }
      default: throw new StoryError('Unknown expression node');
    }
  }

  function applyBinary(op, a, b) {
    if (op === '+' && typeof a === 'string' && typeof b === 'string') return a + b;
    var okA = typeof a === 'number' || typeof a === 'boolean';
    var okB = typeof b === 'number' || typeof b === 'boolean';
    if (!okA || !okB) throw new StoryError('Cannot apply ' + op + ' to ' + kindOf(a) + ' and ' + kindOf(b));
    var x = Number(a);
    var y = Number(b);
    switch (op) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
      case '/':
        if (y === 0) throw new StoryError('Division by zero');
        return x / y;
      case '//':
        if (y === 0) throw new StoryError('Division by zero');
        return Math.floor(x / y);
      case '%':
        if (y === 0) throw new StoryError('Modulo by zero');
        return x - y * Math.floor(x / y);
      default: throw new StoryError('Unknown operator ' + op);
    }
  }

  function compare(op, a, b) {
    if (op === '==') return looseEqual(a, b);
    if (op === '!=') return !looseEqual(a, b);
    var bothNum = (typeof a === 'number' || typeof a === 'boolean') && (typeof b === 'number' || typeof b === 'boolean');
    var bothStr = typeof a === 'string' && typeof b === 'string';
    if (!bothNum && !bothStr) throw new StoryError('Cannot compare ' + kindOf(a) + ' and ' + kindOf(b));
    var x = bothNum ? Number(a) : a;
    var y = bothNum ? Number(b) : b;
    switch (op) {
      case '<': return x < y;
      case '<=': return x <= y;
      case '>': return x > y;
      default: return x >= y;
    }
  }

  function looseEqual(a, b) {
    var numA = typeof a === 'number' || typeof a === 'boolean';
    var numB = typeof b === 'number' || typeof b === 'boolean';
    if (numA && numB) return Number(a) === Number(b);
    return a === b;
  }

  function collectNames(ast, out) {
    if (!ast) return out;
    if (ast.k === 'name') out.push(ast.name);
    if (ast.a) collectNames(ast.a, out);
    if (ast.b) collectNames(ast.b, out);
    if (ast.items) ast.items.forEach(function (item) { collectNames(item, out); });
    return out;
  }

  function evaluateExpression(src, vars, persistent) {
    var env = { vars: vars || {}, persistent: persistent || {} };
    return evalAst(parseExpression(src), env);
  }

  /* ------------------------------------------------------------------ */
  /* Text helpers                                                        */
  /* ------------------------------------------------------------------ */

  function scanString(text, start) {
    var quote = text[start];
    var out = '';
    for (var i = start + 1; i < text.length; i++) {
      var c = text[i];
      if (c === '\\') {
        var n = text[i + 1];
        if (n === undefined) return null;
        out += n === 'n' ? '\n' : n;
        i++;
      } else if (c === quote) {
        return { value: out, end: i + 1 };
      } else {
        out += c;
      }
    }
    return null;
  }

  function stripComment(line) {
    var quote = null;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '#') {
        return line.slice(0, i);
      }
    }
    return line;
  }

  function stripTextTags(text) {
    return text
      .replace(/\{\{/g, '\u0001')
      .replace(/\{\/?[a-zA-Z]+(?:=[^}]*)?\}/g, '')
      .replace(/\u0001/g, '{');
  }

  /* Splits dialogue text into literal parts and parsed [expression] parts. */
  function parseInterpolation(text, diag, line) {
    var parts = [];
    var buffer = '';
    var i = 0;
    while (i < text.length) {
      var c = text[i];
      if (c === '[' && text[i + 1] === '[') { buffer += '['; i += 2; continue; }
      if (c === '[') {
        var close = text.indexOf(']', i);
        if (close === -1) {
          diag.push({ severity: 'error', line: line, message: 'Unclosed [ in dialogue text' });
          buffer += text.slice(i);
          break;
        }
        var inner = text.slice(i + 1, close).trim();
        try {
          var ast = parseExpression(inner);
          if (buffer) parts.push({ lit: stripTextTags(buffer) });
          buffer = '';
          parts.push({ ast: ast, src: inner });
        } catch (e) {
          diag.push({ severity: 'error', line: line, message: 'Bad interpolation [' + inner + ']: ' + e.message });
          buffer += text.slice(i, close + 1);
        }
        i = close + 1;
        continue;
      }
      buffer += c;
      i++;
    }
    if (buffer) parts.push({ lit: stripTextTags(buffer) });
    return parts;
  }

  function formatValue(v) {
    if (v === null) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    return String(v);
  }

  function renderParts(parts, env) {
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      out += has(p, 'lit') ? p.lit : formatValue(evalAst(p.ast, env));
    }
    return out;
  }

  function titleCase(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  function endingTitle(labelName) {
    return labelName.replace(/^ending_/, '').split('_').filter(Boolean).map(titleCase).join(' ');
  }

  function isEndingLabel(labelName) {
    return labelName.indexOf('ending_') === 0 && labelName.length > 'ending_'.length;
  }

  function sceneOfLabel(labelName) {
    var m = /^scene(\d+)_/.exec(labelName);
    return m ? Number(m[1]) : null;
  }

  /* ------------------------------------------------------------------ */
  /* Parser                                                              */
  /* ------------------------------------------------------------------ */

  var UNSUPPORTED_TOP = { init: 1, python: 1, screen: 1, transform: 1, style: 1, translate: 1, layeredimage: 1 };
  var UNSUPPORTED_STMT = { play: 1, stop: 1, queue: 1, pause: 1, window: 1, voice: 1, nvl: 1, python: 1, init: 1, camera: 1 };

  function readLogicalLines(source, diag) {
    var raw = source.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    var lines = [];
    for (var i = 0; i < raw.length; i++) {
      var text = raw[i];
      if (text.indexOf('"""') !== -1) {
        diag.push({ severity: 'error', line: i + 1, message: 'Triple-quoted strings are not supported by this runtime' });
        continue;
      }
      text = stripComment(text).replace(/\s+$/, '');
      if (text.trim() === '') continue;
      var lead = /^[ \t]*/.exec(text)[0];
      if (lead.indexOf('\t') !== -1) {
        diag.push({ severity: 'warning', line: i + 1, message: 'Tab indentation counted as four spaces' });
      }
      lines.push({ indent: lead.replace(/\t/g, '    ').length, text: text.slice(lead.length), line: i + 1 });
    }
    return lines;
  }

  function parseCharacterCall(rhs) {
    var m = /^Character\s*\(/.exec(rhs);
    if (!m) return null;
    var idx = rhs.indexOf('(') + 1;
    while (rhs[idx] === ' ') idx++;
    var name = null;
    if (rhs[idx] === '"' || rhs[idx] === "'") {
      var s = scanString(rhs, idx);
      if (s) name = s.value;
    } else if (rhs.slice(idx, idx + 4) === 'None') {
      name = null;
    } else {
      return null;
    }
    var colorMatch = /color\s*=\s*(["'])(#[0-9a-fA-F]{3,8})\1/.exec(rhs);
    return { name: name, color: colorMatch ? colorMatch[2] : null };
  }

  function parseRenpyScript(source) {
    if (typeof source !== 'string') throw new TypeError('parseRenpyScript expects a string');
    var diag = [];
    var lines = readLogicalLines(source, diag);
    var ctx = { lines: lines, pos: 0, diag: diag };
    var program = {
      version: VERSION,
      labels: {},
      labelOrder: [],
      characters: {},
      constants: {},
      defaults: [],
      images: {},
      diagnostics: diag,
      lineCount: source.split(/\r\n|\r|\n/).length
    };

    parseTopLevel(ctx, program);
    linkLabels(program);
    validateProgram(program);
    return program;
  }

  function skipBlock(ctx, parentIndent) {
    while (ctx.pos < ctx.lines.length && ctx.lines[ctx.pos].indent > parentIndent) ctx.pos++;
  }

  function parseTopLevel(ctx, program) {
    var lines = ctx.lines;
    while (ctx.pos < lines.length) {
      var L = lines[ctx.pos];
      ctx.pos++;
      var text = L.text;
      var word = (/^[A-Za-z_]\w*/.exec(text) || [''])[0];

      if (L.indent !== 0) {
        ctx.diag.push({ severity: 'error', line: L.line, message: 'Unexpected indentation at top level' });
        continue;
      }
      if (word === 'label') { parseLabel(ctx, program, L); continue; }
      if (word === 'define') { parseDefine(ctx, program, L, text); continue; }
      if (word === 'default') { parseDefault(ctx, program, L, text); continue; }
      if (word === 'image') { parseImage(ctx, program, L, text); continue; }
      if (has(UNSUPPORTED_TOP, word)) {
        ctx.diag.push({ severity: 'warning', line: L.line, message: 'Top-level "' + word + '" is valid Ren\'Py but is ignored by the browser runtime' });
        if (/:$/.test(text)) skipBlock(ctx, 0);
        continue;
      }
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Statement outside a label: ' + text });
      if (/:$/.test(text)) skipBlock(ctx, 0);
    }
  }

  function parseDefine(ctx, program, L, text) {
    var m = /^define\s+([A-Za-z_][\w.]*)\s*=\s*(.+)$/.exec(text);
    if (!m) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Malformed define statement' });
      return;
    }
    var name = m[1];
    var rhs = m[2].trim();
    var chr = parseCharacterCall(rhs);
    if (chr) {
      program.characters[name] = { name: chr.name, color: chr.color, id: name };
      return;
    }
    if (name.indexOf('.') !== -1) return;
    try {
      var ast = parseExpression(rhs);
      program.constants[name] = evalAst(ast, { vars: clone(program.constants), persistent: {} });
    } catch (e) {
      ctx.diag.push({ severity: 'warning', line: L.line, message: 'define ' + name + ' ignored: ' + e.message });
    }
  }

  function parseDefault(ctx, program, L, text) {
    var m = /^default\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*=\s*(.+)$/.exec(text);
    if (!m) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Malformed default statement' });
      return;
    }
    try {
      program.defaults.push({ name: m[1], ast: parseExpression(m[2].trim()), src: m[2].trim(), line: L.line });
    } catch (e) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Bad default ' + m[1] + ': ' + e.message });
    }
  }

  function parseImage(ctx, program, L, text) {
    if (/:$/.test(text)) {
      ctx.diag.push({ severity: 'warning', line: L.line, message: 'ATL image blocks are ignored by the browser runtime' });
      skipBlock(ctx, 0);
      return;
    }
    var m = /^image\s+([A-Za-z_][\w ]*?)\s*=\s*(.+)$/.exec(text);
    if (!m) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Malformed image statement' });
      return;
    }
    var name = m[1].trim().replace(/\s+/g, ' ');
    var layers = [];
    var re = /["']([^"']+\.(?:svg|png|jpg|jpeg|webp|avif))["']/gi;
    var hit;
    while ((hit = re.exec(m[2])) !== null) layers.push(hit[1]);
    if (layers.length === 0) {
      ctx.diag.push({ severity: 'warning', line: L.line, message: 'Image "' + name + '" has no image file layers' });
    }
    program.images[name] = { name: name, tag: name.split(' ')[0], layers: layers, line: L.line };
  }

  function parseLabel(ctx, program, L) {
    var m = /^label\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*:$/.exec(L.text);
    if (!m) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Malformed label statement: ' + L.text });
      skipBlock(ctx, 0);
      return;
    }
    var name = m[1];
    var body = parseChildBlock(ctx, L);
    if (has(program.labels, name)) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Duplicate label "' + name + '"' });
      return;
    }
    var code = [];
    compileBlock(body, code, [], name);
    program.labels[name] = { name: name, line: L.line, code: code, next: null };
    program.labelOrder.push(name);
  }

  function linkLabels(program) {
    for (var i = 0; i < program.labelOrder.length; i++) {
      var name = program.labelOrder[i];
      program.labels[name].next = i + 1 < program.labelOrder.length ? program.labelOrder[i + 1] : null;
    }
  }

  function parseChildBlock(ctx, parent) {
    var next = ctx.lines[ctx.pos];
    if (!next || next.indent <= parent.indent) {
      ctx.diag.push({ severity: 'error', line: parent.line, message: 'Expected an indented block after "' + parent.text + '"' });
      return [];
    }
    return parseBlock(ctx, next.indent);
  }

  function parseBlock(ctx, indent) {
    var nodes = [];
    var lines = ctx.lines;
    while (ctx.pos < lines.length) {
      var L = lines[ctx.pos];
      if (L.indent < indent) break;
      if (L.indent > indent) {
        ctx.diag.push({ severity: 'error', line: L.line, message: 'Unexpected indentation' });
        ctx.pos++;
        continue;
      }
      ctx.pos++;
      var node = parseStatement(ctx, L);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  function parseCondition(ctx, L, src) {
    try {
      return parseExpression(src);
    } catch (e) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Bad condition "' + src + '": ' + e.message });
      return null;
    }
  }

  function parseStatement(ctx, L) {
    var text = L.text;

    if (text[0] === '$') return parseAssignment(ctx, L);
    if (/^(?:show|hide|call)\s+screen\b/.test(text)) {
      ctx.diag.push({ severity: 'warning', line: L.line, message: 'Screen statements are valid Ren\'Py but are skipped by the browser runtime' });
      return null;
    }

    var word = (/^[A-Za-z_]\w*/.exec(text) || [''])[0];

    if (word === 'if') {
      var m = /^if\s+(.+):$/.exec(text);
      if (!m) {
        ctx.diag.push({ severity: 'error', line: L.line, message: 'Malformed if statement' });
        skipBlock(ctx, L.indent);
        return null;
      }
      var node = { type: 'if', branches: [], elseBody: null, line: L.line };
      node.branches.push({ text: m[1].trim(), cond: parseCondition(ctx, L, m[1].trim()), body: parseChildBlock(ctx, L), line: L.line });
      while (ctx.pos < ctx.lines.length && ctx.lines[ctx.pos].indent === L.indent) {
        var nxt = ctx.lines[ctx.pos];
        var em = /^elif\s+(.+):$/.exec(nxt.text);
        if (em) {
          ctx.pos++;
          node.branches.push({ text: em[1].trim(), cond: parseCondition(ctx, nxt, em[1].trim()), body: parseChildBlock(ctx, nxt), line: nxt.line });
          continue;
        }
        if (/^else\s*:$/.test(nxt.text)) {
          ctx.pos++;
          node.elseBody = parseChildBlock(ctx, nxt);
        }
        break;
      }
      return node;
    }
    if (word === 'elif' || word === 'else') {
      ctx.diag.push({ severity: 'error', line: L.line, message: '"' + word + '" without a matching if' });
      if (/:$/.test(text)) skipBlock(ctx, L.indent);
      return null;
    }
    if (word === 'menu') return parseMenu(ctx, L);
    if (word === 'jump' || word === 'call') {
      var jm = /^(jump|call)\s+([A-Za-z_]\w*)$/.exec(text);
      if (!jm) {
        ctx.diag.push({ severity: 'error', line: L.line, message: 'Malformed ' + word + ' statement (expression targets are not supported)' });
        return null;
      }
      return { type: jm[1], target: jm[2], line: L.line };
    }
    if (word === 'return') {
      if (text !== 'return') ctx.diag.push({ severity: 'warning', line: L.line, message: 'return values are ignored' });
      return { type: 'return', line: L.line };
    }
    if (word === 'pass' && text === 'pass') return { type: 'pass', line: L.line };
    if (word === 'scene' || word === 'show') return parseStage(ctx, L, word);
    if (word === 'hide') {
      var hm = /^hide\s+([A-Za-z_]\w*)(?:\s+with\s+([A-Za-z_]\w*))?$/.exec(text);
      if (!hm) {
        ctx.diag.push({ severity: 'error', line: L.line, message: 'Malformed hide statement' });
        return null;
      }
      return { type: 'hide', tag: hm[1], transition: hm[2] || null, line: L.line };
    }
    if (word === 'with') {
      var wm = /^with\s+([A-Za-z_]\w*)$/.exec(text);
      if (!wm) {
        ctx.diag.push({ severity: 'error', line: L.line, message: 'Malformed with statement' });
        return null;
      }
      return { type: 'with', transition: wm[1], line: L.line };
    }
    if (word === 'label') {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Labels cannot be nested inside other blocks' });
      if (/:$/.test(text)) skipBlock(ctx, L.indent);
      return null;
    }
    if (has(UNSUPPORTED_STMT, word)) {
      ctx.diag.push({ severity: 'warning', line: L.line, message: '"' + word + '" is valid Ren\'Py but is skipped by the browser runtime' });
      if (/:$/.test(text)) skipBlock(ctx, L.indent);
      return null;
    }

    var say = parseDialogue(ctx, L);
    if (say) return say;
    ctx.diag.push({ severity: 'error', line: L.line, message: 'Unrecognized statement: ' + text });
    if (/:$/.test(text)) skipBlock(ctx, L.indent);
    return null;
  }

  function parseAssignment(ctx, L) {
    var m = /^\$\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*(\/\/=|\+=|-=|\*=|\/=|%=|=(?!=))\s*(.+)$/.exec(L.text);
    if (!m) {
      ctx.diag.push({ severity: 'warning', line: L.line, message: 'Python statement skipped by the browser runtime: ' + L.text });
      return null;
    }
    var ast;
    try {
      ast = parseExpression(m[3].trim());
    } catch (e) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Bad expression "' + m[3].trim() + '": ' + e.message });
      return null;
    }
    return { type: 'assign', target: m[1], op: m[2], ast: ast, src: L.text.slice(1).trim(), line: L.line };
  }

  function parseStage(ctx, L, word) {
    var rest = L.text.slice(word.length).trim();
    var transition = null;
    var wm = /\s+with\s+([A-Za-z_]\w*)$/.exec(rest);
    if (wm) {
      transition = wm[1];
      rest = rest.slice(0, wm.index);
    }
    var at = null;
    var am = /\s+at\s+([A-Za-z_][\w ,]*)$/.exec(rest);
    if (am) {
      at = am[1].trim().split(/\s*,\s*/)[0];
      rest = rest.slice(0, am.index);
    }
    if (word === 'scene' && rest === '') {
      return { type: 'scene', image: null, transition: transition, line: L.line };
    }
    if (!/^[A-Za-z_]\w*(?: [A-Za-z_]\w*)*$/.test(rest)) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Malformed ' + word + ' statement: ' + L.text });
      return null;
    }
    return { type: word, image: rest.replace(/\s+/g, ' '), at: at, transition: transition, line: L.line };
  }

  function parseDialogue(ctx, L) {
    var text = L.text;
    var speaker = null;
    var pos = 0;
    var m = /^([A-Za-z_][\w.]*)((?:\s+[A-Za-z_]\w*)*)\s+(?=["'])/.exec(text);
    if (m) {
      speaker = m[1];
      pos = m[0].length;
    }
    if (text[pos] !== '"' && text[pos] !== "'") return null;
    var s = scanString(text, pos);
    if (!s) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Unterminated string' });
      return null;
    }
    var tail = text.slice(s.end).trim();
    if (tail !== '' && !/^with\s+[A-Za-z_]\w*$/.test(tail)) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Unexpected text after dialogue string: ' + tail });
      return null;
    }
    return { type: 'say', speaker: speaker, text: s.value, line: L.line };
  }

  function parseMenu(ctx, L) {
    if (!/^menu(?:\s+[A-Za-z_]\w*)?\s*:$/.test(L.text)) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Malformed menu statement' });
      skipBlock(ctx, L.indent);
      return null;
    }
    var node = { type: 'menu', caption: null, choices: [], line: L.line };
    var next = ctx.lines[ctx.pos];
    if (!next || next.indent <= L.indent) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Menu has no choices' });
      return null;
    }
    var indent = next.indent;
    while (ctx.pos < ctx.lines.length && ctx.lines[ctx.pos].indent >= indent) {
      var C = ctx.lines[ctx.pos];
      if (C.indent > indent) {
        ctx.diag.push({ severity: 'error', line: C.line, message: 'Unexpected indentation in menu' });
        ctx.pos++;
        continue;
      }
      ctx.pos++;
      if (C.text[0] !== '"' && C.text[0] !== "'") {
        ctx.diag.push({ severity: 'error', line: C.line, message: 'Menu entries must start with a quoted string' });
        if (/:$/.test(C.text)) skipBlock(ctx, C.indent);
        continue;
      }
      var s = scanString(C.text, 0);
      if (!s) {
        ctx.diag.push({ severity: 'error', line: C.line, message: 'Unterminated menu string' });
        continue;
      }
      var tail = C.text.slice(s.end).trim();
      if (tail === '') {
        if (node.choices.length === 0 && node.caption === null) node.caption = s.value;
        else ctx.diag.push({ severity: 'error', line: C.line, message: 'A menu caption is only allowed before the first choice' });
        continue;
      }
      var gm = /^(?:if\s+(.+))?:$/.exec(tail);
      if (!gm) {
        ctx.diag.push({ severity: 'error', line: C.line, message: 'Malformed menu choice: ' + C.text });
        if (/:$/.test(C.text)) skipBlock(ctx, C.indent);
        continue;
      }
      var guardText = gm[1] ? gm[1].trim() : null;
      var guard = guardText ? parseCondition(ctx, C, guardText) : null;
      node.choices.push({ text: s.value, cond: guard, guardText: guardText, body: parseChildBlock(ctx, C), line: C.line });
    }
    if (node.choices.length === 0) {
      ctx.diag.push({ severity: 'error', line: L.line, message: 'Menu has no choices' });
      return null;
    }
    return node;
  }

  /* ------------------------------------------------------------------ */
  /* Compiler: statement tree to flat instructions per label             */
  /* ------------------------------------------------------------------ */

  function compileBlock(nodes, code, guards, labelName) {
    nodes.forEach(function (n) {
      var common = { line: n.line, guards: guards, label: labelName };
      switch (n.type) {
        case 'say':
          code.push(Object.assign({ op: 'say', speaker: n.speaker, rawText: n.text, parts: null }, common));
          break;
        case 'scene':
        case 'show':
          code.push(Object.assign({ op: n.type, image: n.image, at: n.at || null, transition: n.transition }, common));
          break;
        case 'hide':
          code.push(Object.assign({ op: 'hide', tag: n.tag, transition: n.transition }, common));
          break;
        case 'with':
          code.push(Object.assign({ op: 'with', transition: n.transition }, common));
          break;
        case 'assign':
          code.push(Object.assign({ op: 'assign', target: n.target, aop: n.op, ast: n.ast, src: n.src }, common));
          break;
        case 'jump':
          code.push(Object.assign({ op: 'jump', target: n.target }, common));
          break;
        case 'call':
          code.push(Object.assign({ op: 'call', target: n.target }, common));
          break;
        case 'return':
          code.push(Object.assign({ op: 'return' }, common));
          break;
        case 'pass':
          code.push(Object.assign({ op: 'pass' }, common));
          break;
        case 'if': compileIf(n, code, guards, labelName); break;
        case 'menu': compileMenu(n, code, guards, labelName); break;
        default: break;
      }
    });
  }

  function compileIf(n, code, guards, labelName) {
    var exits = [];
    n.branches.forEach(function (br) {
      var test = { op: 'branch', cond: br.cond, src: br.text, else: -1, line: br.line, guards: guards, label: labelName };
      code.push(test);
      compileBlock(br.body, code, guards.concat([{ kind: 'if', text: br.text }]), labelName);
      var exit = { op: 'goto', to: -1, line: br.line, guards: guards, label: labelName };
      code.push(exit);
      exits.push(exit);
      test.else = code.length;
    });
    if (n.elseBody) {
      compileBlock(n.elseBody, code, guards.concat([{ kind: 'else', text: 'else' }]), labelName);
    }
    exits.forEach(function (g) { g.to = code.length; });
  }

  function compileMenu(n, code, guards, labelName) {
    var menu = { op: 'menu', caption: n.caption, choices: [], line: n.line, guards: guards, label: labelName };
    code.push(menu);
    var exits = [];
    n.choices.forEach(function (c, index) {
      menu.choices.push({ index: index, text: c.text, cond: c.cond, guardText: c.guardText, target: code.length, line: c.line });
      compileBlock(c.body, code, guards.concat([{ kind: 'choice', text: c.text, guard: c.guardText }]), labelName);
      var exit = { op: 'goto', to: -1, line: c.line, guards: guards, label: labelName };
      code.push(exit);
      exits.push(exit);
    });
    exits.forEach(function (g) { g.to = code.length; });
  }

  /* ------------------------------------------------------------------ */
  /* Static validation                                                   */
  /* ------------------------------------------------------------------ */

  function resolveImage(program, name) {
    if (has(program.images, name)) return name;
    return null;
  }

  function validateProgram(program) {
    var diag = program.diagnostics;
    var known = {};
    Object.keys(program.constants).forEach(function (k) { known[k] = true; });
    program.defaults.forEach(function (d) { if (d.name.indexOf('.') === -1) known[d.name] = true; });
    program.labelOrder.forEach(function (name) {
      program.labels[name].code.forEach(function (ins) {
        if (ins.op === 'assign' && ins.target.indexOf('persistent.') !== 0) known[ins.target] = true;
      });
    });
    var tags = {};
    Object.keys(program.images).forEach(function (n) { tags[program.images[n].tag] = true; });

    function checkNames(ast, ins, what) {
      if (!ast) return;
      collectNames(ast, []).forEach(function (n) {
        if (n.indexOf('persistent.') === 0) return;
        if (n.indexOf('.') !== -1) {
          diag.push({ severity: 'error', line: ins.line, message: 'Unsupported attribute access "' + n + '" in ' + what });
        } else if (!known[n]) {
          diag.push({ severity: 'error', line: ins.line, message: 'name "' + n + '" is not defined (used in ' + what + ')' });
        }
      });
    }

    program.defaults.forEach(function (d) { checkNames(d.ast, d, 'default ' + d.name); });

    if (!has(program.labels, 'start')) {
      diag.push({ severity: 'error', line: 1, message: 'The script has no "label start:" entry point' });
    }

    program.labelOrder.forEach(function (name) {
      var code = program.labels[name].code;
      code.forEach(function (ins) {
        if (ins.op === 'say') {
          var local = [];
          ins.parts = parseInterpolation(ins.rawText, local, ins.line);
          local.forEach(function (d) { diag.push(d); });
          ins.parts.forEach(function (p) { if (p.ast) checkNames(p.ast, ins, 'dialogue text'); });
          if (ins.speaker !== null && !has(program.characters, ins.speaker)) {
            diag.push({ severity: 'error', line: ins.line, message: 'Speaker "' + ins.speaker + '" is not defined with define ... = Character(...)' });
          }
        } else if (ins.op === 'jump' || ins.op === 'call') {
          if (!has(program.labels, ins.target)) {
            diag.push({ severity: 'error', line: ins.line, message: ins.op + ' to undefined label "' + ins.target + '"' });
          }
        } else if (ins.op === 'scene' || ins.op === 'show') {
          if (ins.image !== null && resolveImage(program, ins.image) === null && !(ins.op === 'show' && tags[ins.image])) {
            diag.push({ severity: 'error', line: ins.line, message: ins.op + ' of undefined image "' + ins.image + '"' });
          }
        } else if (ins.op === 'assign') {
          checkNames(ins.ast, ins, 'assignment');
          if (ins.aop !== '=' && ins.target.indexOf('persistent.') !== 0 && !isDefined(program, ins.target)) {
            diag.push({ severity: 'error', line: ins.line, message: 'name "' + ins.target + '" is used with ' + ins.aop + ' but never given a default' });
          }
        } else if (ins.op === 'branch') {
          checkNames(ins.cond, ins, 'if condition');
        } else if (ins.op === 'menu') {
          ins.choices.forEach(function (c) { checkNames(c.cond, ins, 'menu guard'); });
        }
      });
    });
  }

  function isDefined(program, name) {
    if (has(program.constants, name)) return true;
    return program.defaults.some(function (d) { return d.name === name; });
  }

  /* ------------------------------------------------------------------ */
  /* Runtime                                                             */
  /* ------------------------------------------------------------------ */

  function newStage() {
    return { bg: null, order: [], sprites: {}, transition: null };
  }

  function newState(program, persistent) {
    var st = {
      pc: { label: 'start', ip: 0 },
      stack: [],
      vars: clone(program.constants),
      persistent: persistent ? clone(persistent) : {},
      stage: newStage(),
      ended: false,
      endLabel: null
    };
    program.defaults.forEach(function (d) {
      var env = { vars: st.vars, persistent: st.persistent };
      var value = evalAst(d.ast, env);
      if (d.name.indexOf('persistent.') === 0) {
        var key = d.name.slice('persistent.'.length);
        if (!has(st.persistent, key)) st.persistent[key] = value;
      } else {
        st.vars[d.name] = value;
      }
    });
    return st;
  }

  function envOf(st) {
    return { vars: st.vars, persistent: st.persistent };
  }

  function stageView(st) {
    return {
      bg: st.stage.bg,
      transition: st.stage.transition,
      sprites: st.stage.order.map(function (tag) { return st.stage.sprites[tag]; })
    };
  }

  function applyAssign(st, ins) {
    var env = envOf(st);
    var rhs = evalAst(ins.ast, env);
    var isPersistent = ins.target.indexOf('persistent.') === 0;
    var key = isPersistent ? ins.target.slice('persistent.'.length) : ins.target;
    var store = isPersistent ? st.persistent : st.vars;
    var value = rhs;
    if (ins.aop !== '=') {
      value = applyBinary(ins.aop.slice(0, -1), lookupName(ins.target, env), rhs);
    }
    store[key] = value;
  }

  function setPc(st, label, ip) {
    st.pc = { label: label, ip: ip };
  }

  function doReturn(st) {
    if (st.stack.length > 0) {
      var frame = st.stack.pop();
      setPc(st, frame.label, frame.ip);
      return null;
    }
    st.ended = true;
    st.endLabel = st.pc.label;
    return { type: 'end', label: st.pc.label, ending: isEndingLabel(st.pc.label) ? { label: st.pc.label, title: endingTitle(st.pc.label) } : null };
  }

  /* Executes one instruction. Returns null to keep going, or an interaction event. */
  function stepOnce(program, st) {
    var label = program.labels[st.pc.label];
    if (!label) throw new StoryError('Unknown label "' + st.pc.label + '"');
    if (st.pc.ip >= label.code.length) {
      if (label.next !== null) {
        setPc(st, label.next, 0);
        return null;
      }
      return doReturn(st);
    }
    var ip = st.pc.ip;
    var ins = label.code[ip];
    st.pc.ip = ip + 1;
    switch (ins.op) {
      case 'say': {
        var chr = ins.speaker === null ? null : program.characters[ins.speaker];
        return {
          type: 'say',
          speaker: ins.speaker,
          who: chr ? chr.name : null,
          color: chr ? chr.color : null,
          text: renderParts(ins.parts, envOf(st)),
          label: label.name,
          line: ins.line,
          key: label.name + ':' + ip
        };
      }
      case 'scene':
        st.stage.bg = ins.image;
        st.stage.order = [];
        st.stage.sprites = {};
        st.stage.transition = ins.transition;
        return null;
      case 'show': {
        var image = program.images[ins.image] || null;
        var tag = image ? image.tag : ins.image.split(' ')[0];
        var prev = has(st.stage.sprites, tag) ? st.stage.sprites[tag] : null;
        if (!image && prev) image = program.images[prev.name] || null;
        st.stage.sprites[tag] = {
          tag: tag,
          name: image ? image.name : ins.image,
          layers: image ? image.layers.slice() : [],
          at: ins.at || (prev ? prev.at : 'center')
        };
        if (st.stage.order.indexOf(tag) === -1) st.stage.order.push(tag);
        if (ins.transition) st.stage.transition = ins.transition;
        return null;
      }
      case 'hide':
        delete st.stage.sprites[ins.tag];
        st.stage.order = st.stage.order.filter(function (t) { return t !== ins.tag; });
        if (ins.transition) st.stage.transition = ins.transition;
        return null;
      case 'with':
        st.stage.transition = ins.transition;
        return null;
      case 'assign':
        applyAssign(st, ins);
        return null;
      case 'jump':
        if (!has(program.labels, ins.target)) throw new StoryError('jump to undefined label "' + ins.target + '"');
        setPc(st, ins.target, 0);
        return null;
      case 'call':
        if (!has(program.labels, ins.target)) throw new StoryError('call to undefined label "' + ins.target + '"');
        st.stack.push({ label: label.name, ip: ip + 1 });
        setPc(st, ins.target, 0);
        return null;
      case 'return':
        return doReturn(st);
      case 'goto':
        st.pc.ip = ins.to;
        return null;
      case 'branch':
        if (!truthy(evalAst(ins.cond, envOf(st)))) st.pc.ip = ins.else;
        return null;
      case 'menu': {
        var shown = [];
        var locked = [];
        ins.choices.forEach(function (c) {
          if (c.cond === null || truthy(evalAst(c.cond, envOf(st)))) shown.push({ index: c.index, text: c.text });
          else locked.push({ index: c.index, text: c.text, guard: c.guardText });
        });
        if (shown.length === 0) throw new StoryError('Menu at line ' + ins.line + ' has no available choices');
        return { type: 'menu', caption: ins.caption, choices: shown, locked: locked, label: label.name, line: ins.line, key: label.name + ':' + ip, ip: ip };
      }
      default:
        return null;
    }
  }

  function runToEvent(program, st, onStep) {
    for (var n = 0; n < MAX_STEPS; n++) {
      var ev = stepOnce(program, st);
      if (onStep) onStep(st);
      if (ev) return ev;
    }
    throw new StoryError('Runaway script: more than ' + MAX_STEPS + ' steps without a line of dialogue or a choice');
  }

  function createStoryRuntime(program, options) {
    var opts = options || {};
    if (!has(program.labels, 'start')) throw new StoryError('The script has no start label');
    var rt = {
      program: program,
      st: newState(program, opts.persistent),
      current: null,
      checkpoints: [],
      history: [],
      choicesMade: [],
      visited: opts.visited ? clone(opts.visited) : {},
      seen: opts.seen ? clone(opts.seen) : {},
      trail: ['start'],
      ended: false
    };
    rt.visited.start = true;
    return rt;
  }

  function captureState(rt) {
    return {
      pc: clone(rt.st.pc),
      stack: clone(rt.st.stack),
      vars: clone(rt.st.vars),
      stage: clone(rt.st.stage),
      historyLength: rt.history.length,
      choicesLength: rt.choicesMade.length,
      trailLength: rt.trail.length
    };
  }

  function restoreState(rt, snap) {
    rt.st.pc = clone(snap.pc);
    rt.st.stack = clone(snap.stack);
    rt.st.vars = clone(snap.vars);
    rt.st.stage = clone(snap.stage);
    rt.st.ended = false;
    rt.st.endLabel = null;
    rt.history.length = snap.historyLength;
    rt.choicesMade.length = snap.choicesLength;
    rt.trail.length = snap.trailLength;
    rt.ended = false;
    rt.current = null;
  }

  function markVisited(rt) {
    var label = rt.st.pc.label;
    rt.visited[label] = true;
    if (rt.trail[rt.trail.length - 1] !== label) rt.trail.push(label);
  }

  function advanceStory(rt) {
    if (rt.ended) return rt.current;
    if (rt.current && rt.current.type === 'menu') return rt.current;
    var snap = captureState(rt);
    var event;
    try {
      event = runToEvent(rt.program, rt.st, function () { markVisited(rt); });
    } catch (e) {
      if (!(e instanceof StoryError)) throw e;
      event = { type: 'error', message: e.message, label: rt.st.pc.label };
      rt.ended = true;
    }
    if (event.type === 'end') rt.ended = true;
    if (event.type === 'say' || event.type === 'menu') {
      event.seen = has(rt.seen, event.key);
      rt.seen[event.key] = true;
    }
    if (event.type === 'say') {
      rt.history.push({ kind: 'say', who: event.who, speaker: event.speaker, text: event.text, label: event.label });
    }
    event.stage = stageView(rt.st);
    rt.st.stage.transition = null;
    event.vars = clone(rt.st.vars);
    event.persistent = clone(rt.st.persistent);
    rt.checkpoints.push({ snap: snap, event: event.type });
    if (rt.checkpoints.length > MAX_CHECKPOINTS) rt.checkpoints.shift();
    rt.current = event;
    return event;
  }

  function chooseMenuOption(rt, index) {
    var cur = rt.current;
    if (!cur || cur.type !== 'menu') throw new StoryError('There is no menu to choose from');
    var picked = null;
    for (var i = 0; i < cur.choices.length; i++) {
      if (cur.choices[i].index === index) picked = cur.choices[i];
    }
    if (!picked) throw new StoryError('Choice ' + index + ' is not available');
    var label = rt.program.labels[cur.label];
    var menu = label.code[cur.ip];
    var entry = menu.choices[index];
    rt.history.push({ kind: 'choice', text: picked.text, label: cur.label });
    rt.choicesMade.push({ label: cur.label, index: index, text: picked.text });
    setPc(rt.st, cur.label, entry.target);
    rt.current = null;
    return advanceStory(rt);
  }

  function rollbackStory(rt) {
    if (rt.checkpoints.length < 2) return null;
    rt.checkpoints.pop();
    var prev = rt.checkpoints.pop();
    restoreState(rt, prev.snap);
    return advanceStory(rt);
  }

  function serializeSaveSlot(rt, meta) {
    if (rt.checkpoints.length === 0) throw new StoryError('Nothing to save yet');
    var cps = rt.checkpoints.slice(-50).map(function (c) { return clone(c.snap); });
    return {
      format: 'glass-meridian-save',
      version: VERSION,
      meta: meta || {},
      label: rt.current ? rt.current.label : rt.st.pc.label,
      checkpoints: cps,
      history: clone(rt.history),
      choicesMade: clone(rt.choicesMade),
      trail: clone(rt.trail),
      visited: clone(rt.visited),
      persistent: clone(rt.st.persistent)
    };
  }

  function restoreSaveSlot(program, save, options) {
    var opts = options || {};
    if (!save || save.format !== 'glass-meridian-save' || save.version !== VERSION || !Array.isArray(save.checkpoints) || save.checkpoints.length === 0) {
      throw new StoryError('This save slot is not valid for this version of the game');
    }
    var last = save.checkpoints[save.checkpoints.length - 1];
    if (!last.pc || !has(program.labels, last.pc.label)) {
      throw new StoryError('This save refers to a label that is not in the script');
    }
    var rt = createStoryRuntime(program, { persistent: save.persistent, visited: save.visited, seen: opts.seen });
    rt.history = clone(save.history || []);
    rt.choicesMade = clone(save.choicesMade || []);
    rt.trail = clone(save.trail || ['start']);
    restoreState(rt, last);
    rt.checkpoints = save.checkpoints.slice(0, -1).map(function (s) { return { snap: clone(s), event: 'restored' }; });
    advanceStory(rt);
    return rt;
  }

  /* ------------------------------------------------------------------ */
  /* Graph analysis                                                      */
  /* ------------------------------------------------------------------ */

  function flowOfLabel(program, name, mayReturn) {
    var code = program.labels[name].code;
    var f = { jumps: [], calls: [], hasReturn: false, fallsThrough: false, menus: [], reached: 0 };
    var seen = [];
    var stack = [0];
    while (stack.length > 0) {
      var ip = stack.pop();
      if (ip >= code.length) { f.fallsThrough = true; continue; }
      if (seen[ip]) continue;
      seen[ip] = true;
      f.reached++;
      var ins = code[ip];
      switch (ins.op) {
        case 'jump':
          f.jumps.push({ to: ins.target, guards: ins.guards, line: ins.line });
          break;
        case 'return':
          f.hasReturn = true;
          break;
        case 'call':
          f.calls.push({ to: ins.target, guards: ins.guards, line: ins.line });
          if (!has(program.labels, ins.target) || mayReturn[ins.target]) stack.push(ip + 1);
          break;
        case 'goto':
          stack.push(ins.to);
          break;
        case 'branch':
          stack.push(ip + 1);
          stack.push(ins.else);
          break;
        case 'menu':
          f.menus.push(ins);
          ins.choices.forEach(function (c) { stack.push(c.target); });
          break;
        default:
          stack.push(ip + 1);
      }
    }
    return f;
  }

  function computeFlows(program) {
    var names = program.labelOrder;
    var mayReturn = {};
    names.forEach(function (n) { mayReturn[n] = false; });
    var flows = {};
    for (var pass = 0; pass <= names.length + 1; pass++) {
      var changed = false;
      flows = {};
      for (var i = 0; i < names.length; i++) {
        var n = names[i];
        var f = flowOfLabel(program, n, mayReturn);
        flows[n] = f;
        var r = f.hasReturn;
        if (f.fallsThrough) {
          var nx = program.labels[n].next;
          r = r || nx === null || mayReturn[nx];
        }
        for (var j = 0; j < f.jumps.length; j++) {
          if (mayReturn[f.jumps[j].to]) r = true;
        }
        if (r && !mayReturn[n]) {
          mayReturn[n] = true;
          changed = true;
        }
      }
      if (!changed) break;
    }
    return { flows: flows, mayReturn: mayReturn };
  }

  function buildEdges(program, flows) {
    var edges = [];
    var seen = {};
    function add(from, to, type, extra) {
      if (!has(program.labels, to)) return;
      var key = from + '>' + to + '>' + type + '>' + (extra.choice || '') + '>' + (extra.when || '');
      if (has(seen, key)) return;
      seen[key] = true;
      edges.push(Object.assign({ from: from, to: to, type: type }, extra));
    }
    function describe(guards) {
      var choice = null;
      var when = [];
      var list = [];
      guards.forEach(function (g) {
        if (g.kind === 'choice') {
          choice = g.text;
          if (g.guard) { when.push(g.guard); list.push(g.guard); }
        } else if (g.kind === 'if') {
          when.push(g.text);
          list.push(g.text);
        } else {
          when.push('else');
        }
      });
      return { choice: choice, when: when.join(' and '), guardList: list };
    }
    program.labelOrder.forEach(function (name) {
      var f = flows[name];
      f.jumps.forEach(function (j) { add(name, j.to, 'jump', describe(j.guards)); });
      f.calls.forEach(function (c) { add(name, c.to, 'call', describe(c.guards)); });
      if (f.fallsThrough && program.labels[name].next !== null) add(name, program.labels[name].next, 'fallthrough', { choice: null, when: '', guardList: [] });
    });
    return edges;
  }

  function bfsDepths(entry, adjacency) {
    var depth = {};
    if (!has(adjacency, entry)) return depth;
    depth[entry] = 0;
    var queue = [entry];
    for (var head = 0; head < queue.length; head++) {
      var cur = queue[head];
      (adjacency[cur] || []).forEach(function (nxt) {
        if (!has(depth, nxt)) {
          depth[nxt] = depth[cur] + 1;
          queue.push(nxt);
        }
      });
    }
    return depth;
  }

  /* Iterative Tarjan strongly connected components. */
  function tarjan(nodes, adjacency) {
    var index = 0;
    var indices = {};
    var low = {};
    var onStack = {};
    var stack = [];
    var components = [];
    nodes.forEach(function (start) {
      if (has(indices, start)) return;
      var work = [{ v: start, i: 0 }];
      indices[start] = low[start] = index++;
      stack.push(start);
      onStack[start] = true;
      while (work.length > 0) {
        var top = work[work.length - 1];
        var nbrs = adjacency[top.v] || [];
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

  function cloneForExplore(st) {
    return {
      pc: { label: st.pc.label, ip: st.pc.ip },
      stack: st.stack.map(function (f) { return { label: f.label, ip: f.ip }; }),
      vars: Object.assign({}, st.vars),
      persistent: Object.assign({}, st.persistent),
      stage: st.stage,
      ended: false,
      endLabel: null
    };
  }

  function exploreKey(st) {
    return st.pc.label + '@' + st.pc.ip + '|' + st.stack.map(function (f) { return f.label + '@' + f.ip; }).join(',') + '|' + stableStringify(st.vars) + '|' + stableStringify(st.persistent);
  }

  /* Breadth first search over interaction states. Because every edge is one
   * menu choice, the first time an ending is reached is its shortest choice path. */
  function exploreStates(program, maxStates) {
    var result = {
      endings: {},
      offered: {},
      menuStates: 0,
      states: 0,
      truncated: false,
      stuck: [],
      runaway: []
    };
    var nodes = [];
    var index = {};

    function settle(st) {
      var stage = st.stage;
      st.stage = newStage();
      var outcome = { type: 'error', message: 'Runaway script: more than ' + MAX_STEPS + ' steps without a choice' };
      try {
        for (var n = 0; n < MAX_STEPS; n++) {
          var ev = stepOnce(program, st);
          if (ev && ev.type !== 'say') {
            outcome = ev;
            break;
          }
        }
      } catch (e) {
        if (!(e instanceof StoryError)) throw e;
        outcome = { type: 'error', message: e.message };
      }
      st.stage = stage;
      return outcome;
    }

    var start = newState(program, {});
    var ev0 = settle(start);
    nodes.push({ st: start, ev: ev0, path: [], succ: [], terminal: ev0.type === 'end' });
    index[exploreKey(start)] = 0;
    if (ev0.type === 'end') recordEnding(result, ev0, []);
    if (ev0.type === 'error') result.runaway.push({ message: ev0.message, path: [] });

    for (var head = 0; head < nodes.length; head++) {
      var node = nodes[head];
      if (node.ev.type !== 'menu') continue;
      result.menuStates++;
      var menu = node.ev;
      var code = program.labels[menu.label].code[menu.ip];
      for (var c = 0; c < menu.choices.length; c++) {
        var choice = menu.choices[c];
        result.offered[menu.label + ':' + choice.index] = true;
        var next = cloneForExplore(node.st);
        next.pc = { label: menu.label, ip: code.choices[choice.index].target };
        var path = node.path.concat([{ label: menu.label, index: choice.index, text: choice.text }]);
        var ev = settle(next);
        var key = exploreKey(next);
        if (has(index, key)) {
          node.succ.push(index[key]);
          continue;
        }
        if (nodes.length >= maxStates) {
          result.truncated = true;
          continue;
        }
        index[key] = nodes.length;
        node.succ.push(nodes.length);
        nodes.push({ st: next, ev: ev, path: path, succ: [], terminal: ev.type === 'end' });
        if (ev.type === 'end') recordEnding(result, ev, path);
        if (ev.type === 'error') result.runaway.push({ message: ev.message, path: path });
      }
    }
    result.states = nodes.length;

    if (!result.truncated) {
      var pred = nodes.map(function () { return []; });
      nodes.forEach(function (n, i) { n.succ.forEach(function (s) { pred[s].push(i); }); });
      var canEnd = nodes.map(function (n) { return n.terminal; });
      var queue = [];
      nodes.forEach(function (n, i) { if (n.terminal) queue.push(i); });
      for (var qh = 0; qh < queue.length; qh++) {
        pred[queue[qh]].forEach(function (p) {
          if (!canEnd[p]) { canEnd[p] = true; queue.push(p); }
        });
      }
      nodes.forEach(function (n, i) {
        if (!canEnd[i]) result.stuck.push({ label: n.ev.label || n.st.pc.label, path: n.path });
      });
    }
    return result;
  }

  function recordEnding(result, ev, path) {
    if (ev.ending && !has(result.endings, ev.ending.label)) {
      result.endings[ev.ending.label] = path;
    }
  }

  function analyzeNarrativeGraph(program, options) {
    var opts = options || {};
    var entry = opts.entry || 'start';
    var maxStates = opts.maxStates || DEFAULT_MAX_STATES;
    var names = program.labelOrder.slice();
    var issues = [];

    program.diagnostics.forEach(function (d) {
      issues.push({ severity: d.severity, code: d.severity === 'error' ? 'syntax' : 'note', message: d.message, line: d.line });
    });

    var computed = computeFlows(program);
    var flows = computed.flows;
    var edges = buildEdges(program, flows);

    var adjacency = {};
    names.forEach(function (n) { adjacency[n] = []; });
    edges.forEach(function (e) { adjacency[e.from].push(e.to); });

    var depth = bfsDepths(entry, adjacency);
    var unreachable = names.filter(function (n) { return !has(depth, n); });
    unreachable.forEach(function (n) {
      issues.push({ severity: 'error', code: 'unreachable', message: 'Label "' + n + '" cannot be reached from "' + entry + '"', label: n, line: program.labels[n].line });
    });

    var jumpedTo = {};
    var calledTo = {};
    edges.forEach(function (e) {
      if (e.type === 'call') calledTo[e.to] = true;
      else jumpedTo[e.to] = true;
    });
    var subroutines = names.filter(function (n) { return calledTo[n] && !jumpedTo[n]; });

    var terminals = names.filter(function (n) {
      if (subroutines.indexOf(n) !== -1) return false;
      var f = flows[n];
      return f.hasReturn || (f.fallsThrough && program.labels[n].next === null);
    });

    var reverse = {};
    names.forEach(function (n) { reverse[n] = []; });
    edges.forEach(function (e) { if (e.type !== 'call') reverse[e.to].push(e.from); });
    var canTerminate = {};
    var q = terminals.slice();
    q.forEach(function (n) { canTerminate[n] = true; });
    for (var qi = 0; qi < q.length; qi++) {
      reverse[q[qi]].forEach(function (p) {
        if (!canTerminate[p]) { canTerminate[p] = true; q.push(p); }
      });
    }
    var deadEnds = names.filter(function (n) {
      return has(depth, n) && !canTerminate[n] && subroutines.indexOf(n) === -1;
    });
    deadEnds.forEach(function (n) {
      issues.push({ severity: 'error', code: 'dead-end', message: 'Label "' + n + '" never reaches an ending or a return', label: n, line: program.labels[n].line });
    });

    var undefinedTargets = [];
    names.forEach(function (n) {
      flows[n].jumps.concat(flows[n].calls).forEach(function (j) {
        if (!has(program.labels, j.to)) {
          undefinedTargets.push({ from: n, to: j.to, line: j.line });
        }
      });
    });

    var cyclic = tarjan(names, adjacency).filter(function (comp) {
      return comp.length > 1 || adjacency[comp[0]].indexOf(comp[0]) !== -1;
    });
    var loopsWithoutChoices = cyclic.filter(function (comp) {
      return comp.every(function (n) { return flows[n].menus.length === 0; });
    });
    loopsWithoutChoices.forEach(function (comp) {
      issues.push({ severity: 'error', code: 'loop-without-choice', message: 'Infinite loop without a choice: ' + comp.slice().reverse().join(' to '), label: comp[0] });
    });

    var explored = exploreStates(program, maxStates);
    var endingLabels = names.filter(isEndingLabel);
    var endings = endingLabels.map(function (label) {
      var path = has(explored.endings, label) ? explored.endings[label] : null;
      return {
        label: label,
        title: endingTitle(label),
        staticallyReachable: has(depth, label),
        reachable: path !== null,
        shortestChoices: path,
        choiceCount: path === null ? null : path.length
      };
    });
    if (!explored.truncated) {
      endings.forEach(function (e) {
        if (!e.reachable) {
          issues.push({ severity: 'error', code: 'ending-locked', message: 'Ending "' + e.title + '" can never be reached with any sequence of choices', label: e.label });
        }
      });
    }

    var neverOffered = [];
    var menuCount = 0;
    var choiceCount = 0;
    names.forEach(function (n) {
      flows[n].menus.forEach(function (m) {
        menuCount++;
        m.choices.forEach(function (c) {
          choiceCount++;
          if (has(depth, n) && !explored.truncated && !has(explored.offered, n + ':' + c.index)) {
            neverOffered.push({ label: n, index: c.index, text: c.text, guard: c.guardText });
          }
        });
      });
    });
    neverOffered.forEach(function (c) {
      issues.push({ severity: 'warning', code: 'choice-never-offered', message: 'The choice "' + c.text + '" in "' + c.label + '" is never offered in any playthrough', label: c.label });
    });

    if (explored.truncated) {
      issues.push({ severity: 'error', code: 'truncated', message: 'The state search stopped at ' + maxStates + ' states, so ending reachability is not proven' });
    }
    explored.runaway.forEach(function (r) {
      issues.push({ severity: 'error', code: 'runtime-error', message: 'A playthrough raised an error: ' + r.message });
    });
    explored.stuck.forEach(function (s) {
      issues.push({ severity: 'error', code: 'stuck-state', message: 'A playthrough reaches "' + s.label + '" and can never finish', label: s.label });
    });

    var nodeList = names.map(function (n) {
      var kind = isEndingLabel(n) ? 'ending' : subroutines.indexOf(n) !== -1 ? 'subroutine' : sceneOfLabel(n) !== null ? 'scene' : 'branch';
      return {
        name: n,
        line: program.labels[n].line,
        kind: kind,
        scene: sceneOfLabel(n),
        reachable: has(depth, n),
        depth: has(depth, n) ? depth[n] : null,
        hasMenu: flows[n].menus.length > 0,
        title: isEndingLabel(n) ? endingTitle(n) : n
      };
    });

    var hardIssues = issues.filter(function (i) { return i.severity === 'error'; });
    return {
      entry: entry,
      ok: hardIssues.length === 0,
      nodes: nodeList,
      edges: edges,
      unreachableLabels: unreachable,
      deadEnds: deadEnds,
      undefinedTargets: undefinedTargets,
      loopsWithoutChoices: loopsWithoutChoices,
      choiceLoops: cyclic.filter(function (c) { return loopsWithoutChoices.indexOf(c) === -1; }),
      subroutines: subroutines,
      endings: endings,
      neverOffered: neverOffered,
      issues: issues,
      stats: {
        labelCount: names.length,
        edgeCount: edges.length,
        reachableCount: Object.keys(depth).length,
        menuCount: menuCount,
        choiceCount: choiceCount,
        statesExplored: explored.states,
        truncated: explored.truncated
      }
    };
  }

  /* Evaluates the guard expressions of an edge against live variables. Returns
   * true when every guard passes, false when one fails, and null on an error. */
  function evaluateGuards(guardList, vars, persistent) {
    try {
      for (var i = 0; i < guardList.length; i++) {
        if (!truthy(evaluateExpression(guardList[i], vars, persistent))) return false;
      }
      return true;
    } catch (e) {
      if (e instanceof StoryError) return null;
      throw e;
    }
  }

  /* The set of "from>to" edges the player has actually walked, from rt.trail. */
  function trailEdges(trail) {
    var taken = {};
    for (var i = 1; i < trail.length; i++) taken[trail[i - 1] + '>' + trail[i]] = true;
    return taken;
  }

  /* Layered top-to-bottom layout of the label graph. Pure geometry, no DOM. */
  function layoutNarrativeGraph(analysis, options) {
    var o = options || {};
    var nodeW = o.nodeW || 176;
    var nodeH = o.nodeH || 34;
    var gapX = o.gapX || 26;
    var gapY = o.gapY || 52;
    var pad = o.pad || 24;

    var maxDepth = 0;
    analysis.nodes.forEach(function (nd) { if (nd.depth !== null && nd.depth > maxDepth) maxDepth = nd.depth; });
    var rows = [];
    analysis.nodes.forEach(function (nd) {
      var d = nd.depth === null ? maxDepth + 1 : nd.depth;
      if (!rows[d]) rows[d] = [];
      rows[d].push({ name: nd.name, depth: d, kind: nd.kind, scene: nd.scene, title: nd.title, reachable: nd.reachable, hasMenu: nd.hasMenu, x: 0, y: 0, w: nodeW, h: nodeH });
    });
    rows = rows.filter(function (r) { return r && r.length > 0; });

    var maxCount = 0;
    rows.forEach(function (r) { if (r.length > maxCount) maxCount = r.length; });
    var width = pad * 2 + maxCount * nodeW + (maxCount - 1) * gapX;
    var parents = {};
    analysis.edges.forEach(function (e) {
      if (!parents[e.to]) parents[e.to] = [];
      parents[e.to].push(e.from);
    });
    var xOf = {};
    var nodes = [];
    rows.forEach(function (row, ri) {
      if (ri > 0) {
        row.forEach(function (nd, i) {
          var ps = (parents[nd.name] || []).filter(function (p) { return has(xOf, p); });
          nd.key = ps.length === 0 ? i : ps.reduce(function (sum, p) { return sum + xOf[p]; }, 0) / ps.length;
        });
        row.sort(function (a, b) { return a.key - b.key; });
      }
      var rowWidth = row.length * nodeW + (row.length - 1) * gapX;
      var startX = (width - rowWidth) / 2;
      row.forEach(function (nd, i) {
        nd.x = startX + i * (nodeW + gapX);
        nd.y = pad + ri * (nodeH + gapY);
        xOf[nd.name] = nd.x + nodeW / 2;
        nodes.push(nd);
      });
    });
    var height = pad * 2 + rows.length * nodeH + (rows.length - 1) * gapY;
    var byName = {};
    nodes.forEach(function (nd) { byName[nd.name] = nd; });

    var edges = [];
    analysis.edges.forEach(function (e) {
      var a = byName[e.from];
      var b = byName[e.to];
      if (!a || !b) return;
      var back = b.y <= a.y;
      var sx = a.x + a.w / 2;
      var sy = a.y + a.h;
      var tx = b.x + b.w / 2;
      var ty = b.y;
      var d;
      var lx;
      var ly;
      if (!back) {
        var mid = (sy + ty) / 2;
        d = 'M ' + sx + ' ' + sy + ' C ' + sx + ' ' + mid + ' ' + tx + ' ' + mid + ' ' + tx + ' ' + ty;
        lx = (sx + tx) / 2;
        ly = mid;
      } else {
        var out = Math.max(a.x + a.w, b.x + b.w) + 40;
        d = 'M ' + (a.x + a.w) + ' ' + (a.y + a.h / 2) + ' C ' + out + ' ' + (a.y + a.h / 2) + ' ' + out + ' ' + (b.y + b.h / 2) + ' ' + (b.x + b.w) + ' ' + (b.y + b.h / 2);
        lx = out;
        ly = (a.y + b.y + a.h) / 2;
      }
      edges.push(Object.assign({}, e, { d: d, labelX: lx, labelY: ly, back: back }));
    });
    return { width: width, height: height, nodes: nodes, edges: edges, nodeW: nodeW, nodeH: nodeH };
  }

  function auditScript(source, options) {
    var program = parseRenpyScript(source);
    var analysis = analyzeNarrativeGraph(program, options);
    return { program: program, analysis: analysis, ok: analysis.ok };
  }

  return {
    VERSION: VERSION,
    StoryError: StoryError,
    parseExpression: parseExpression,
    evaluateExpression: evaluateExpression,
    parseRenpyScript: parseRenpyScript,
    createStoryRuntime: createStoryRuntime,
    advanceStory: advanceStory,
    chooseMenuOption: chooseMenuOption,
    rollbackStory: rollbackStory,
    serializeSaveSlot: serializeSaveSlot,
    restoreSaveSlot: restoreSaveSlot,
    analyzeNarrativeGraph: analyzeNarrativeGraph,
    layoutNarrativeGraph: layoutNarrativeGraph,
    evaluateGuards: evaluateGuards,
    trailEdges: trailEdges,
    auditScript: auditScript,
    endingTitle: endingTitle,
    isEndingLabel: isEndingLabel,
    sceneOfLabel: sceneOfLabel
  };
});
