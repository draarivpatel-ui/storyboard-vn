'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../engine.js');
const App = require('../app.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'game', 'script.rpy'), 'utf8');
const APP_JS = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const ENGINE_JS = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');

/* ------------------------------------------------------------------ */
/* Minimal DOM harness for exercising app.js without external deps     */
/* ------------------------------------------------------------------ */

function createElement(tag, owner) {
  const attrs = {};
  const listeners = {};
  const classSet = new Set();
  const styleProps = {};
  const el = {
    tagName: String(tag).toUpperCase(),
    ownerDocument: owner,
    children: [],
    parentNode: null,
    hidden: false,
    disabled: false,
    checked: false,
    open: false,
    tabIndex: 0,
    scrollTop: 0,
    scrollHeight: 0,
    value: '',
    _text: '',
    style: {
      setProperty: function (k, v) { styleProps[k] = String(v); },
      getPropertyValue: function (k) { return styleProps[k] || ''; }
    },
    classList: {
      add: function (c) { classSet.add(c); },
      remove: function (c) { classSet.delete(c); },
      contains: function (c) { return classSet.has(c); }
    },
    setAttribute: function (k, v) {
      attrs[k] = String(v);
      if (k === 'id') owner._byId[String(v)] = el;
      if (k === 'class') {
        classSet.clear();
        String(v).split(/\s+/).filter(Boolean).forEach(function (c) { classSet.add(c); });
      }
      if (k === 'open') el.open = true;
    },
    getAttribute: function (k) {
      return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
    },
    removeAttribute: function (k) {
      delete attrs[k];
      if (k === 'open') el.open = false;
    },
    appendChild: function (child) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    addEventListener: function (evName, fn) {
      if (!listeners[evName]) listeners[evName] = [];
      listeners[evName].push(fn);
    },
    click: function () {
      if (el.disabled) return;
      (listeners.click || []).forEach(function (fn) {
        fn({ preventDefault: function () {}, stopPropagation: function () {}, target: el });
      });
    },
    dispatchInput: function () {
      (listeners.input || []).forEach(function (fn) { fn({ target: el }); });
    },
    dispatchChange: function () {
      (listeners.change || []).forEach(function (fn) { fn({ target: el }); });
    },
    focus: function () { owner.activeElement = el; },
    setSelectionRange: function (a, b) { el._selection = [a, b]; },
    showModal: function () { el.open = true; attrs.open = ''; },
    close: function () { el.open = false; delete attrs.open; },
    closest: function (sel) {
      let cur = el;
      while (cur) {
        if (sel === 'dialog' && cur.tagName === 'DIALOG') return cur;
        cur = cur.parentNode;
      }
      return null;
    }
  };
  Object.defineProperty(el, 'className', {
    get: function () { return Array.from(classSet).join(' '); },
    set: function (v) {
      classSet.clear();
      String(v).split(/\s+/).filter(Boolean).forEach(function (c) { classSet.add(c); });
      attrs.class = el.className;
    }
  });
  Object.defineProperty(el, 'textContent', {
    get: function () {
      if (el.children.length === 0) return el._text;
      return el._text + el.children.map(function (c) { return c.textContent || ''; }).join('');
    },
    set: function (v) {
      el.children = [];
      el._text = String(v);
    }
  });
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return el._text; },
    set: function (v) {
      el.children = [];
      el._text = String(v);
    }
  });
  return el;
}

function buildMockEnv() {
  const doc = {
    _byId: {},
    _all: [],
    readyState: 'complete',
    activeElement: null,
    documentElement: null,
    body: null,
    createElement: function (tag) {
      const e = createElement(tag, doc);
      doc._all.push(e);
      return e;
    },
    createElementNS: function (_ns, tag) {
      return doc.createElement(tag);
    },
    createTextNode: function (txt) {
      const t = createElement('#text', doc);
      t._text = String(txt);
      return t;
    },
    getElementById: function (id) {
      return doc._byId[id] || null;
    },
    querySelectorAll: function (sel) {
      if (sel === '[data-action]') {
        return doc._all.filter(function (e) { return e.getAttribute('data-action') !== null; });
      }
      if (sel === '[data-act]') {
        return doc._all.filter(function (e) { return e.getAttribute('data-act') !== null; });
      }
      if (sel === 'dialog [data-close]') {
        return doc._all.filter(function (e) { return e.getAttribute('data-close') !== null; });
      }
      if (sel === '.tabs [data-tab]') {
        return doc._all.filter(function (e) { return e.getAttribute('data-tab') !== null; });
      }
      return [];
    },
    querySelector: function (sel) {
      const mAct = /^\.dock-btn\[data-act="([^"]+)"\]$/.exec(sel);
      if (mAct) {
        return doc._all.find(function (e) { return e.getAttribute('data-act') === mAct[1]; }) || null;
      }
      const mHot = /^\.choice\[data-hotkey="([^"]+)"\]$/.exec(sel);
      if (mHot) {
        return doc._all.find(function (e) { return e.getAttribute('data-hotkey') === mHot[1]; }) || null;
      }
      if (sel === 'dialog[open]') {
        return doc._all.find(function (e) { return e.tagName === 'DIALOG' && e.open; }) || null;
      }
      return null;
    }
  };

  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');

  const ids = [
    'screen-menu', 'screen-play', 'screen-gallery', 'screen-inspector',
    'continue-hint', 'gallery-hint', 'gallery-count', 'ending-list',
    'stage-wrap', 'stage', 'stage-bg', 'stage-sprites', 'stage-fade',
    'choices', 'dialogue', 'speaker', 'dialogue-text', 'dialogue-live', 'advance-cue',
    'endcard', 'endcard-count', 'endcard-title', 'endcard-state',
    'skip-label', 'map-drawer', 'gauges', 'map-scroll', 'legend',
    'src-editor', 'verdict', 'tab-audit', 'tab-graph', 'tab-endings',
    'panel-audit', 'panel-graph', 'panel-endings', 'stats', 'issues', 'graph-scroll', 'route-list',
    'btn-reset', 'btn-copy', 'btn-play-script',
    'dlg-history', 'backlog', 'dlg-slots', 'dlg-slots-title', 'slots', 'slots-note',
    'dlg-settings', 'set-speed', 'set-speed-out', 'set-locked', 'set-parallax', 'btn-wipe'
  ];
  ids.forEach(function (id) {
    const tag = id.indexOf('dlg-') === 0 ? 'dialog' : id === 'src-editor' ? 'textarea' : 'div';
    const el = doc.createElement(tag);
    el.setAttribute('id', id);
  });

  ['new', 'continue', 'gallery', 'inspector', 'menu'].forEach(function (action) {
    const b = doc.createElement('button');
    b.setAttribute('data-action', action);
    b.setAttribute('id', 'action-' + action);
  });

  ['back', 'history', 'auto', 'skip', 'save', 'load', 'map', 'settings', 'menu', 'again', 'gallery'].forEach(function (act) {
    const b = doc.createElement('button');
    b.className = 'dock-btn';
    b.setAttribute('data-act', act);
    b.setAttribute('id', 'act-' + act);
  });

  ['audit', 'graph', 'endings'].forEach(function (t) {
    const b = doc.getElementById('tab-' + t);
    b.setAttribute('data-tab', t);
  });

  const store = {};
  const winListeners = {};
  const win = {
    GLASS_MERIDIAN_SCRIPT: SCRIPT,
    StoryEngine: Engine,
    innerWidth: 1440,
    innerHeight: 900,
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }
    },
    navigator: {
      clipboard: {
        _copied: '',
        writeText: function (txt) {
          win.navigator.clipboard._copied = txt;
          return Promise.resolve();
        }
      }
    },
    addEventListener: function (evName, fn) {
      if (!winListeners[evName]) winListeners[evName] = [];
      winListeners[evName].push(fn);
    },
    dispatchKey: function (key) {
      (winListeners.keydown || []).forEach(function (fn) {
        fn({ key: key, preventDefault: function () {} });
      });
    },
    dispatchKeyUp: function (key) {
      (winListeners.keyup || []).forEach(function (fn) {
        fn({ key: key, preventDefault: function () {} });
      });
    },
    dispatchPointer: function (x, y) {
      (winListeners.pointermove || []).forEach(function (fn) {
        fn({ clientX: x, clientY: y });
      });
    }
  };

  /* Instant text speed by default in unit tests */
  doc.getElementById('set-speed').value = '0';
  store['glass-meridian:settings'] = JSON.stringify({ cps: 0, showLocked: true, parallax: true });

  const app = App.createApp(doc, win);
  return { doc: doc, win: win, app: app, store: store };
}

/* ------------------------------------------------------------------ */
/* 1. Static HTML, CSS, SVG, and Ren'Py File Integrity Tests           */
/* ------------------------------------------------------------------ */

test('DOM structure: index.html has doctype, lang, viewport, title, and main landmark', function () {
  assert.match(HTML, /^<!doctype html>/i);
  assert.match(HTML, /<html lang="en">/);
  assert.match(HTML, /<meta name="viewport"/);
  assert.match(HTML, /<title>The Glass Meridian/);
  assert.match(HTML, /<main id="main">/);
});

test('DOM structure: all four screens exist in index.html', function () {
  assert.match(HTML, /id="screen-menu"/);
  assert.match(HTML, /id="screen-play"/);
  assert.match(HTML, /id="screen-gallery"/);
  assert.match(HTML, /id="screen-inspector"/);
});

test('DOM structure: stage, dialogue, dock, and dialogs have required IDs', function () {
  const requiredIds = [
    'stage', 'stage-bg', 'stage-sprites', 'choices', 'dialogue', 'speaker',
    'dialogue-text', 'dialogue-live', 'advance-cue', 'endcard', 'map-drawer',
    'gauges', 'map-scroll', 'legend', 'ending-list', 'src-editor', 'verdict',
    'stats', 'issues', 'graph-scroll', 'route-list', 'dlg-history', 'dlg-slots', 'dlg-settings'
  ];
  requiredIds.forEach(function (id) {
    assert.ok(HTML.includes('id="' + id + '"'), 'Missing id="' + id + '" in index.html');
  });
});

test('DOM structure: scripts load in dependency order', function () {
  const iEngine = HTML.indexOf('src="engine.js"');
  const iBundle = HTML.indexOf('src="assets/script-bundle.js"');
  const iApp = HTML.indexOf('src="app.js"');
  assert.ok(iEngine > 0 && iBundle > iEngine && iApp > iBundle);
});

test('DOM structure: skip link and noscript fallback are present', function () {
  assert.match(HTML, /class="skip-link" href="#main"/);
  assert.match(HTML, /<noscript>/);
});

test('Assets: all 18 SVG scene and sprite layers exist and are valid SVG', function () {
  const expected = [
    'bg_harbor.svg', 'bg_archive.svg', 'bg_workshop.svg', 'bg_storm.svg', 'bg_lens.svg', 'bg_dawn.svg',
    'mira_body.svg', 'mira_face_calm.svg', 'mira_face_worried.svg', 'mira_face_smile.svg',
    'soren_body.svg', 'soren_face_guarded.svg', 'soren_face_smirk.svg', 'soren_face_open.svg',
    'voss_body.svg', 'voss_face_stern.svg', 'voss_face_soft.svg', 'voss_face_grave.svg'
  ];
  expected.forEach(function (file) {
    const full = path.join(ROOT, 'game', 'images', file);
    assert.ok(fs.existsSync(full), 'Missing SVG asset: ' + file);
    const content = fs.readFileSync(full, 'utf8');
    assert.match(content, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(content, /<\/svg>\s*$/);
  });
});

test('Assets: favicon.svg and script-bundle.js exist in assets/', function () {
  assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'favicon.svg')));
  const bundlePath = path.join(ROOT, 'assets', 'script-bundle.js');
  assert.ok(fs.existsSync(bundlePath));
  const bundleContent = fs.readFileSync(bundlePath, 'utf8');
  assert.ok(bundleContent.includes('window.GLASS_MERIDIAN_SCRIPT ='));
});

test('RenPy project: game/ contains script.rpy, screens.rpy, options.rpy, gui.rpy, tests.rpy', function () {
  ['script.rpy', 'screens.rpy', 'options.rpy', 'gui.rpy', 'tests.rpy'].forEach(function (f) {
    assert.ok(fs.existsSync(path.join(ROOT, 'game', f)), 'Missing game/' + f);
  });
});

test('CSS: defines core design tokens and reduced-motion media query', function () {
  ['--paper', '--stage', '--ink', '--copper', '--teal', '--brass'].forEach(function (tok) {
    assert.ok(CSS.includes(tok + ':'), 'Missing CSS token ' + tok);
  });
  assert.match(CSS, /prefers-reduced-motion:\s*reduce/);
});

test('Anti-slop hygiene: no em-dashes or en-dashes in source files', function () {
  [
    ['index.html', HTML],
    ['styles.css', CSS],
    ['engine.js', ENGINE_JS],
    ['app.js', APP_JS],
    ['game/script.rpy', SCRIPT]
  ].forEach(function (pair) {
    assert.equal(/[\u2013\u2014]/.test(pair[1]), false, 'Found forbidden dash in ' + pair[0]);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Browser Controller (app.js) Interaction Tests                    */
/* ------------------------------------------------------------------ */

test('App controller: initializes on menu screen with 0 of 4 endings found', function () {
  const env = buildMockEnv();
  assert.equal(env.app.state.screen, 'menu');
  assert.equal(env.doc.getElementById('gallery-hint').textContent, '0 of 4 found');
  assert.equal(env.doc.getElementById('continue-hint').textContent, 'no saves yet');
});

test('App controller: ENDING_CATALOG defines all 4 canonical endings', function () {
  assert.equal(App.ENDING_CATALOG.length, 4);
  const labels = App.ENDING_CATALOG.map(function (e) { return e.label; });
  assert.deepEqual(labels, [
    'ending_meridian_restored',
    'ending_silent_observatory',
    'ending_tidal_accord',
    'ending_glass_fracture'
  ]);
});

test('App controller: New Expedition switches to play screen and renders first scene', function () {
  const env = buildMockEnv();
  env.doc.getElementById('action-new').click();
  assert.equal(env.app.state.screen, 'play');
  assert.equal(env.doc.getElementById('screen-play').hidden, false);
  assert.equal(env.doc.getElementById('screen-menu').hidden, true);
  assert.equal(env.doc.getElementById('stage').getAttribute('data-scene'), 'harbor');
  assert.match(env.doc.getElementById('dialogue-text').textContent, /The ferry leaves you on a stone stair/);
});

test('App controller: advancing dialogue shows Mira sprite and speaker badge', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  env.app.handleAdvance();
  env.app.handleAdvance();
  env.app.handleAdvance();
  env.app.handleAdvance();
  assert.equal(env.doc.getElementById('speaker').hidden, false);
  assert.equal(env.doc.getElementById('speaker').textContent, 'Mira');
  assert.equal(env.doc.getElementById('speaker').getAttribute('data-speaker'), 'mira');
  const sprites = env.doc.getElementById('stage-sprites').children;
  assert.equal(sprites.length, 1);
  assert.equal(sprites[0].getAttribute('data-tag'), 'mira');
  assert.equal(sprites[0].children.length, 2);
});

test('App controller: renders branching choices and picks an option', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  while (env.app.state.runtime.current.type !== 'menu') {
    env.app.handleAdvance();
  }
  const choicesEl = env.doc.getElementById('choices');
  assert.equal(choicesEl.hidden, false);
  assert.equal(choicesEl.children.length, 3);

  choicesEl.children[0].click();
  assert.equal(env.app.state.runtime.st.vars.trust_score, 1);
  assert.equal(choicesEl.hidden, true);
});

test('App controller: numeric hotkey 1 selects first available choice', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  while (env.app.state.runtime.current.type !== 'menu') {
    env.app.handleAdvance();
  }
  env.win.dispatchKey('1');
  assert.equal(env.app.state.runtime.st.vars.trust_score, 1);
});

test('App controller: displays locked choices with guard condition when showLocked is enabled', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  while (env.app.state.runtime.current.type !== 'menu') env.app.handleAdvance();
  env.app.pickChoice(1);
  while (env.app.state.runtime.current.type !== 'menu') env.app.handleAdvance();

  const choicesEl = env.doc.getElementById('choices');
  const lockedBtns = choicesEl.children.filter(function (b) { return b.getAttribute('data-locked') === 'yes'; });
  assert.equal(lockedBtns.length, 1);
  assert.match(lockedBtns[0].textContent, /Requires: trust_score >= 1 and not lens_unlocked/);
});

test('App controller: unchecking showLocked hides locked choices from menu', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  while (env.app.state.runtime.current.type !== 'menu') env.app.handleAdvance();
  env.app.pickChoice(1);
  while (env.app.state.runtime.current.type !== 'menu') env.app.handleAdvance();

  const lockedCheckbox = env.doc.getElementById('set-locked');
  lockedCheckbox.checked = false;
  lockedCheckbox.dispatchChange();

  const choicesEl = env.doc.getElementById('choices');
  const lockedBtns = choicesEl.children.filter(function (b) { return b.getAttribute('data-locked') === 'yes'; });
  assert.equal(lockedBtns.length, 0);
});

test('App controller: rollback steps backward and restores previous line', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  const firstText = env.doc.getElementById('dialogue-text').textContent;
  env.app.handleAdvance();
  const secondText = env.doc.getElementById('dialogue-text').textContent;
  assert.notEqual(firstText, secondText);

  env.app.handleRollback();
  assert.equal(env.doc.getElementById('dialogue-text').textContent, firstText);
});

test('App controller: backlog dialog lists spoken lines and chosen options', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  while (env.app.state.runtime.current.type !== 'menu') env.app.handleAdvance();
  env.app.pickChoice(0);
  env.app.openHistoryDialog();

  const backlog = env.doc.getElementById('backlog');
  assert.ok(backlog.children.length >= 7);
  const choiceEntries = backlog.children.filter(function (li) { return li.getAttribute('data-kind') === 'choice'; });
  assert.equal(choiceEntries.length, 1);
  assert.match(choiceEntries[0].textContent, /Offer to help her log the morning tide/);
});

test('App controller: save slot stores state and load slot restores it', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  while (env.app.state.runtime.current.type !== 'menu') env.app.handleAdvance();
  env.app.pickChoice(0);
  const savedLine = env.doc.getElementById('dialogue-text').textContent;

  env.app.openSlotsDialog('save');
  const slot1Btn = env.doc.getElementById('slots').children[0].children[0];
  slot1Btn.click();
  assert.equal(env.doc.getElementById('continue-hint').textContent, '1 slot saved');

  env.app.handleAdvance();
  env.app.handleAdvance();
  assert.notEqual(env.doc.getElementById('dialogue-text').textContent, savedLine);

  env.app.openSlotsDialog('load');
  const loadSlot1Btn = env.doc.getElementById('slots').children[0].children[0];
  loadSlot1Btn.click();
  assert.equal(env.doc.getElementById('dialogue-text').textContent, savedLine);
});

test('App controller: map drawer renders gauges and DAG SVG nodes', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  env.app.toggleMapDrawer(true);
  assert.equal(env.doc.getElementById('map-drawer').hidden, false);
  assert.equal(env.doc.getElementById('gauges').children.length, 3);
  const svg = env.doc.getElementById('map-scroll').children[0];
  assert.ok(svg);
  assert.equal(svg.getAttribute('class'), 'dag');
  assert.ok(svg.children.length > 20);
});

test('App controller: full playthrough unlocks ending in gallery and shows endcard', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  const targetEnding = env.app.state.analysis.endings[0];
  let stepIdx = 0;
  while (env.app.state.runtime.current.type !== 'end') {
    if (env.app.state.runtime.current.type === 'menu') {
      const step = targetEnding.shortestChoices[stepIdx++];
      env.app.pickChoice(step.index);
    } else {
      env.app.handleAdvance();
    }
  }
  assert.equal(env.doc.getElementById('endcard').hidden, false);
  assert.equal(env.doc.getElementById('endcard-title').textContent, 'Meridian Restored');
  assert.equal(env.doc.getElementById('gallery-hint').textContent, '1 of 4 found');

  env.app.showScreen('gallery');
  const cards = env.doc.getElementById('ending-list').children;
  assert.equal(cards.length, 4);
  assert.equal(cards[0].getAttribute('data-found'), 'yes');
});

test('App controller: all 4 endings can be unlocked sequentially in gallery', function () {
  const env = buildMockEnv();
  const endings = env.app.state.analysis.endings;
  assert.equal(endings.length, 4);

  endings.forEach(function (ending) {
    env.app.startNewGame();
    let stepIdx = 0;
    while (env.app.state.runtime.current.type !== 'end') {
      if (env.app.state.runtime.current.type === 'menu') {
        const step = ending.shortestChoices[stepIdx++];
        env.app.pickChoice(step.index);
      } else {
        env.app.handleAdvance();
      }
    }
  });

  assert.equal(env.doc.getElementById('gallery-hint').textContent, '4 of 4 found');
});

test('App controller: Script & DAG Inspector live-audits edited scripts and switches tabs', function () {
  const env = buildMockEnv();
  env.app.showScreen('inspector');
  const verdict = env.doc.getElementById('verdict');
  assert.equal(verdict.getAttribute('data-state'), 'ok');
  assert.match(verdict.textContent, /4 of 4 endings reachable/);

  const editor = env.doc.getElementById('src-editor');
  editor.value = SCRIPT + '\nlabel broken_orphan:\n    jump non_existent_target\n';
  editor.dispatchInput();
  assert.equal(verdict.getAttribute('data-state'), 'bad');
  assert.ok(env.doc.getElementById('issues').children.length >= 2);

  env.app.switchInspectorTab('graph');
  assert.equal(env.doc.getElementById('panel-graph').hidden, false);
  assert.equal(env.doc.getElementById('panel-audit').hidden, true);

  env.app.switchInspectorTab('endings');
  assert.equal(env.doc.getElementById('panel-endings').hidden, false);
  assert.equal(env.doc.getElementById('route-list').children.length, 4);

  env.doc.getElementById('btn-reset').click();
  assert.equal(verdict.getAttribute('data-state'), 'ok');
});

test('App controller: Copy report button writes formatted audit report to clipboard', function () {
  const env = buildMockEnv();
  env.app.showScreen('inspector');
  env.doc.getElementById('btn-copy').click();
  assert.match(env.win.navigator.clipboard._copied, /The Glass Meridian: Script & DAG Audit Report/);
  assert.match(env.win.navigator.clipboard._copied, /Status: PASS/);
});

test('App controller: Play this script button launches edited script in play screen', function () {
  const env = buildMockEnv();
  env.app.showScreen('inspector');
  const editor = env.doc.getElementById('src-editor');
  editor.value = 'label start:\n    "Custom inspector script line."\n    return\n';
  env.doc.getElementById('btn-play-script').click();
  assert.equal(env.app.state.screen, 'play');
  assert.equal(env.doc.getElementById('dialogue-text').textContent, 'Custom inspector script line.');
});

test('App controller: pointer parallax updates CSS custom properties when enabled', function () {
  const env = buildMockEnv();
  env.win.dispatchPointer(360, 225);
  assert.equal(env.doc.documentElement.style.getPropertyValue('--px'), '-0.500');
  assert.equal(env.doc.documentElement.style.getPropertyValue('--py'), '-0.500');

  const parallaxCheck = env.doc.getElementById('set-parallax');
  parallaxCheck.checked = false;
  parallaxCheck.dispatchChange();
  assert.equal(env.doc.documentElement.style.getPropertyValue('--px'), '0');
});

test('App controller: Shift key updates skip button label between Skip seen and Skip all', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  assert.equal(env.doc.getElementById('skip-label').textContent, 'Skip seen');
  env.win.dispatchKey('Shift');
  assert.equal(env.doc.getElementById('skip-label').textContent, 'Skip all');
  env.win.dispatchKeyUp('Shift');
  assert.equal(env.doc.getElementById('skip-label').textContent, 'Skip seen');
});

test('App controller: keyboard shortcuts advance, rollback, toggle map, and wipe progress', function () {
  const env = buildMockEnv();
  env.app.startNewGame();
  const line1 = env.doc.getElementById('dialogue-text').textContent;
  env.win.dispatchKey(' ');
  const line2 = env.doc.getElementById('dialogue-text').textContent;
  assert.notEqual(line1, line2);

  env.win.dispatchKey('ArrowLeft');
  assert.equal(env.doc.getElementById('dialogue-text').textContent, line1);

  env.win.dispatchKey('m');
  assert.equal(env.app.state.mapOpen, true);
  env.win.dispatchKey('Escape');
  assert.equal(env.app.state.mapOpen, false);

  env.app.wipeAllProgress();
  assert.equal(env.doc.getElementById('continue-hint').textContent, 'no saves yet');
});
