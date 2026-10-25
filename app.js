/*
 * The Glass Meridian: app.js
 *
 * Browser controller connecting engine.js and game/script.rpy to index.html.
 * Handles the main menu, playable stage (SVG scene transitions, layered
 * character expressions, typewriter text, branching choices), save/load slots,
 * rollback, dialogue backlog, live narrative DAG drawer, ending gallery, and
 * the interactive Ren'Py script & DAG inspector.
 */
(function (root) {
  'use strict';

  var Engine = root.StoryEngine || (typeof require === 'function' ? require('./engine.js') : null);
  var STORAGE_PREFIX = 'glass-meridian:';
  var SLOT_COUNT = 6;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var ENDING_CATALOG = [
    {
      label: 'ending_meridian_restored',
      flag: 'ending_meridian_restored',
      title: 'Meridian Restored',
      summary: 'The lens is set true and every tide table agrees with the water.'
    },
    {
      label: 'ending_silent_observatory',
      flag: 'ending_silent_observatory',
      title: 'Silent Observatory',
      summary: 'The lens stays dark. The harbor learns to read the water instead.'
    },
    {
      label: 'ending_tidal_accord',
      flag: 'ending_tidal_accord',
      title: 'Tidal Accord',
      summary: 'The harbor and the guild calibrate the lens together, a little off true.'
    },
    {
      label: 'ending_glass_fracture',
      flag: 'ending_glass_fracture',
      title: 'Glass Fracture',
      summary: 'A rushed line, a high note, and a split in the century.'
    }
  ];

  var SCENE_TONES = {
    harbor: 'day',
    archive: 'night',
    workshop: 'dusk',
    storm: 'storm',
    lens: 'night',
    dawn: 'dawn'
  };

  function createApp(doc, win) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    win = win || (typeof window !== 'undefined' ? window : root);
    if (!doc || !Engine) return null;

    var state = {
      canonicalSource: typeof win.GLASS_MERIDIAN_SCRIPT === 'string' ? win.GLASS_MERIDIAN_SCRIPT : '',
      activeSource: '',
      program: null,
      analysis: null,
      inspectorAudit: null,
      runtime: null,
      screen: 'menu',
      slotMode: 'save',
      autoMode: false,
      skipMode: false,
      shiftHeld: false,
      mapOpen: false,
      typingTimer: null,
      autoTimer: null,
      skipTimer: null,
      typingFullText: '',
      typingIndex: 0,
      isTyping: false,
      currentBg: null,
      settings: {
        cps: 45,
        showLocked: true,
        parallax: true
      },
      persistent: {
        ending_meridian_restored: false,
        ending_silent_observatory: false,
        ending_tidal_accord: false,
        ending_glass_fracture: false
      },
      seen: {},
      slots: [null, null, null, null, null, null]
    };

    function byId(id) {
      return doc.getElementById(id);
    }

    function loadStorage() {
      try {
        var st = win.localStorage;
        if (!st) return;
        var pRaw = st.getItem(STORAGE_PREFIX + 'persistent');
        if (pRaw) {
          var pObj = JSON.parse(pRaw);
          if (pObj && typeof pObj === 'object') {
            Object.keys(pObj).forEach(function (k) {
              state.persistent[k] = pObj[k];
            });
          }
        }
        var seenRaw = st.getItem(STORAGE_PREFIX + 'seen');
        if (seenRaw) {
          var sObj = JSON.parse(seenRaw);
          if (sObj && typeof sObj === 'object') state.seen = sObj;
        }
        var setRaw = st.getItem(STORAGE_PREFIX + 'settings');
        if (setRaw) {
          var cfg = JSON.parse(setRaw);
          if (cfg && typeof cfg === 'object') {
            if (typeof cfg.cps === 'number') state.settings.cps = cfg.cps;
            if (typeof cfg.showLocked === 'boolean') state.settings.showLocked = cfg.showLocked;
            if (typeof cfg.parallax === 'boolean') state.settings.parallax = cfg.parallax;
          }
        }
        var slotsRaw = st.getItem(STORAGE_PREFIX + 'slots');
        if (slotsRaw) {
          var arr = JSON.parse(slotsRaw);
          if (Array.isArray(arr)) {
            for (var i = 0; i < SLOT_COUNT; i++) {
              state.slots[i] = arr[i] || null;
            }
          }
        }
      } catch (e) {
        /* localStorage may be unavailable in private browsing or tests */
      }
    }

    function saveStorage() {
      try {
        var st = win.localStorage;
        if (!st) return;
        st.setItem(STORAGE_PREFIX + 'persistent', JSON.stringify(state.persistent));
        st.setItem(STORAGE_PREFIX + 'seen', JSON.stringify(state.seen));
        st.setItem(STORAGE_PREFIX + 'settings', JSON.stringify(state.settings));
        st.setItem(STORAGE_PREFIX + 'slots', JSON.stringify(state.slots));
      } catch (e) {
        /* ignore quota errors */
      }
    }

    function wipeAllProgress() {
      state.persistent = {
        ending_meridian_restored: false,
        ending_silent_observatory: false,
        ending_tidal_accord: false,
        ending_glass_fracture: false
      };
      state.seen = {};
      state.slots = [null, null, null, null, null, null];
      if (state.runtime) {
        state.runtime.seen = {};
        state.runtime.st.persistent = Object.assign({}, state.persistent);
      }
      saveStorage();
      updateMenuHints();
      renderGallery();
      renderSlotsDialog();
    }

    function syncFromRuntimePersistent() {
      if (!state.runtime) return;
      var rp = state.runtime.st.persistent || {};
      Object.keys(rp).forEach(function (k) {
        if (rp[k]) state.persistent[k] = rp[k];
      });
      var rSeen = state.runtime.seen || {};
      Object.keys(rSeen).forEach(function (k) {
        if (rSeen[k]) state.seen[k] = true;
      });
      saveStorage();
    }

    function countEndingsFound() {
      var n = 0;
      ENDING_CATALOG.forEach(function (e) {
        if (state.persistent[e.flag]) n++;
      });
      return n;
    }

    function countSavedSlots() {
      var n = 0;
      for (var i = 0; i < state.slots.length; i++) {
        if (state.slots[i]) n++;
      }
      return n;
    }

    function updateMenuHints() {
      var found = countEndingsFound();
      var saved = countSavedSlots();
      var galHint = byId('gallery-hint');
      if (galHint) galHint.textContent = found + ' of 4 found';
      var galCount = byId('gallery-count');
      if (galCount) galCount.textContent = found + ' of 4 found';
      var contHint = byId('continue-hint');
      if (contHint) {
        contHint.textContent = saved === 0 ? 'no saves yet' : saved === 1 ? '1 slot saved' : saved + ' slots saved';
      }
    }

    function showScreen(name) {
      stopAutoAndSkip();
      stopTypewriter(true);
      state.screen = name;
      if (doc.body) doc.body.setAttribute('data-screen', name);
      var map = {
        menu: byId('screen-menu'),
        play: byId('screen-play'),
        gallery: byId('screen-gallery'),
        inspector: byId('screen-inspector')
      };
      Object.keys(map).forEach(function (k) {
        if (map[k]) map[k].hidden = k !== name;
      });
      if (name === 'menu') {
        updateMenuHints();
      } else if (name === 'gallery') {
        updateMenuHints();
        renderGallery();
      } else if (name === 'inspector') {
        var editor = byId('src-editor');
        if (editor && !editor.value) {
          editor.value = state.activeSource || state.canonicalSource;
        }
        runInspectorAudit();
      }
    }

    function compileSource(src) {
      state.activeSource = src;
      var res = Engine.auditScript(src);
      state.program = res.program;
      state.analysis = res.analysis;
      return res;
    }

    function startNewGame(customSource) {
      if (typeof customSource === 'string') {
        compileSource(customSource);
      } else if (!state.program) {
        compileSource(state.canonicalSource);
      }
      state.runtime = Engine.createStoryRuntime(state.program, {
        persistent: state.persistent,
        seen: state.seen
      });
      state.currentBg = null;
      var bgWrap = byId('stage-bg');
      var spWrap = byId('stage-sprites');
      if (bgWrap) bgWrap.innerHTML = '';
      if (spWrap) spWrap.innerHTML = '';
      showScreen('play');
      var ev = Engine.advanceStory(state.runtime);
      renderPlayEvent(ev);
    }

    function normalizeAssetPath(relPath) {
      if (!relPath) return '';
      if (relPath.indexOf('game/') === 0 || relPath.indexOf('/') === 0 || relPath.indexOf('http') === 0) {
        return relPath;
      }
      return 'game/' + relPath;
    }

    function sceneKeyFromBg(bgName) {
      if (!bgName) return '';
      return bgName.replace(/^bg\s+/, '').trim();
    }

    function renderStage(stageData) {
      if (!stageData) return;
      var stageEl = byId('stage');
      var bgEl = byId('stage-bg');
      var spEl = byId('stage-sprites');
      var fadeEl = byId('stage-fade');
      if (!stageEl || !bgEl || !spEl) return;

      var sceneKey = sceneKeyFromBg(stageData.bg);
      stageEl.setAttribute('data-scene', sceneKey);
      stageEl.setAttribute('data-tone', SCENE_TONES[sceneKey] || 'day');

      if (stageData.transition === 'fade' && fadeEl) {
        fadeEl.classList.add('is-on');
        setTimeout(function () {
          fadeEl.classList.remove('is-on');
        }, 320);
      }

      var bgImgDef = stageData.bg && state.program && state.program.images[stageData.bg];
      var bgLayer = bgImgDef && bgImgDef.layers && bgImgDef.layers[0]
        ? normalizeAssetPath(bgImgDef.layers[0])
        : (sceneKey ? 'game/images/bg_' + sceneKey + '.svg' : '');

      if (bgLayer && state.currentBg !== bgLayer) {
        state.currentBg = bgLayer;
        bgEl.innerHTML = '';
        var img = doc.createElement('img');
        img.src = bgLayer;
        img.alt = '';
        img.width = 1920;
        img.height = 1080;
        bgEl.appendChild(img);
      } else if (!bgLayer) {
        state.currentBg = null;
        bgEl.innerHTML = '';
      }

      spEl.innerHTML = '';
      (stageData.sprites || []).forEach(function (sp) {
        var actor = doc.createElement('div');
        actor.className = 'actor';
        actor.setAttribute('data-tag', sp.tag);
        actor.setAttribute('data-name', sp.name);
        actor.setAttribute('data-at', sp.at || 'center');
        var layers = sp.layers && sp.layers.length > 0 ? sp.layers : [];
        layers.forEach(function (layerPath) {
          var lImg = doc.createElement('img');
          lImg.src = normalizeAssetPath(layerPath);
          lImg.alt = '';
          lImg.width = 520;
          lImg.height = 900;
          actor.appendChild(lImg);
        });
        spEl.appendChild(actor);
      });
    }

    function stopTypewriter(finishImmediately) {
      if (state.typingTimer) {
        clearInterval(state.typingTimer);
        state.typingTimer = null;
      }
      if (finishImmediately && state.isTyping) {
        var textEl = byId('dialogue-text');
        if (textEl) textEl.textContent = state.typingFullText;
      }
      state.isTyping = false;
    }

    function startTypewriter(text, onDone) {
      stopTypewriter(false);
      var textEl = byId('dialogue-text');
      var liveEl = byId('dialogue-live');
      if (liveEl) liveEl.textContent = text;
      if (!textEl) return;

      state.typingFullText = text;
      var cps = Number(state.settings.cps) || 0;
      if (cps <= 0 || cps >= 120 || state.skipMode) {
        textEl.textContent = text;
        state.isTyping = false;
        if (onDone) onDone();
        return;
      }

      state.isTyping = true;
      state.typingIndex = 0;
      textEl.textContent = '';
      var intervalMs = Math.max(8, Math.round(1000 / cps));
      state.typingTimer = setInterval(function () {
        state.typingIndex += 1;
        if (state.typingIndex >= state.typingFullText.length) {
          textEl.textContent = state.typingFullText;
          stopTypewriter(false);
          if (onDone) onDone();
        } else {
          textEl.textContent = state.typingFullText.slice(0, state.typingIndex);
        }
      }, intervalMs);
    }

    function renderPlayEvent(ev) {
      if (!ev) return;
      syncFromRuntimePersistent();
      renderStage(ev.stage);

      var dlgBox = byId('dialogue');
      var speakerEl = byId('speaker');
      var textEl = byId('dialogue-text');
      var liveEl = byId('dialogue-live');
      var cueEl = byId('advance-cue');
      var choicesEl = byId('choices');
      var endcardEl = byId('endcard');

      if (ev.type === 'say') {
        if (endcardEl) endcardEl.hidden = true;
        if (choicesEl) {
          choicesEl.hidden = true;
          choicesEl.innerHTML = '';
        }
        if (dlgBox) dlgBox.removeAttribute('data-mode');
        if (speakerEl) {
          if (ev.who) {
            speakerEl.hidden = false;
            speakerEl.textContent = ev.who;
            speakerEl.setAttribute('data-speaker', ev.speaker || '');
          } else {
            speakerEl.hidden = true;
            speakerEl.textContent = '';
            speakerEl.removeAttribute('data-speaker');
          }
        }
        if (textEl) {
          if (ev.who) textEl.removeAttribute('data-narration');
          else textEl.setAttribute('data-narration', 'yes');
        }
        if (cueEl) cueEl.hidden = false;

        startTypewriter(ev.text, function () {
          scheduleAutoOrSkip();
        });
        if (!state.isTyping) {
          scheduleAutoOrSkip();
        }
      } else if (ev.type === 'menu') {
        stopAutoAndSkip();
        if (endcardEl) endcardEl.hidden = true;
        if (cueEl) cueEl.hidden = true;
        if (ev.caption) {
          if (dlgBox) dlgBox.removeAttribute('data-mode');
          if (speakerEl) {
            speakerEl.hidden = true;
            speakerEl.textContent = '';
          }
          if (textEl) {
            textEl.setAttribute('data-narration', 'yes');
            textEl.textContent = ev.caption;
          }
          if (liveEl) liveEl.textContent = ev.caption;
        } else if (dlgBox) {
          dlgBox.setAttribute('data-mode', 'idle');
        }
        renderChoices(ev);
      } else if (ev.type === 'end') {
        stopAutoAndSkip();
        if (choicesEl) {
          choicesEl.hidden = true;
          choicesEl.innerHTML = '';
        }
        if (cueEl) cueEl.hidden = true;
        renderEndcard(ev);
      } else if (ev.type === 'error') {
        stopAutoAndSkip();
        if (choicesEl) choicesEl.hidden = true;
        if (cueEl) cueEl.hidden = true;
        if (speakerEl) {
          speakerEl.hidden = false;
          speakerEl.textContent = 'Script error';
        }
        if (textEl) textEl.textContent = ev.message;
      }

      if (state.mapOpen) {
        renderMapDrawer();
      }
      updateMenuHints();
    }

    function renderChoices(ev) {
      var choicesEl = byId('choices');
      if (!choicesEl) return;
      choicesEl.innerHTML = '';
      choicesEl.hidden = false;

      var combined = [];
      (ev.choices || []).forEach(function (c) {
        combined.push({ index: c.index, text: c.text, locked: false, guard: null });
      });
      if (state.settings.showLocked && Array.isArray(ev.locked)) {
        ev.locked.forEach(function (l) {
          combined.push({ index: l.index, text: l.text, locked: true, guard: l.guard });
        });
      }
      combined.sort(function (a, b) { return a.index - b.index; });

      var unlockedNumber = 0;
      combined.forEach(function (item) {
        var btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'choice';
        var keySpan = doc.createElement('span');
        keySpan.className = 'choice-key';
        var bodySpan = doc.createElement('span');
        bodySpan.textContent = item.text;

        if (item.locked) {
          btn.setAttribute('data-locked', 'yes');
          btn.disabled = true;
          keySpan.textContent = '--';
          if (item.guard) {
            var lockNote = doc.createElement('span');
            lockNote.className = 'choice-lock';
            lockNote.textContent = 'Requires: ' + item.guard;
            bodySpan.appendChild(lockNote);
          }
        } else {
          unlockedNumber += 1;
          var num = unlockedNumber;
          keySpan.textContent = '0' + num;
          btn.setAttribute('data-choice-index', String(item.index));
          btn.setAttribute('data-hotkey', String(num));
          btn.addEventListener('click', function () {
            pickChoice(item.index);
          });
        }
        btn.appendChild(keySpan);
        btn.appendChild(bodySpan);
        choicesEl.appendChild(btn);
      });
    }

    function renderEndcard(ev) {
      var endcardEl = byId('endcard');
      var countEl = byId('endcard-count');
      var titleEl = byId('endcard-title');
      var stateEl = byId('endcard-state');
      if (!endcardEl) return;

      var found = countEndingsFound();
      var endingTitle = ev.ending ? ev.ending.title : 'Expedition Complete';
      if (countEl) countEl.textContent = 'Endings discovered: ' + found + ' of 4';
      if (titleEl) titleEl.textContent = endingTitle;
      if (stateEl && state.runtime) {
        var v = state.runtime.st.vars || {};
        var parts = [
          'trust_score: ' + (v.trust_score !== undefined ? v.trust_score : 0),
          'calibration_drift: ' + (v.calibration_drift !== undefined ? v.calibration_drift : 0),
          'lens_unlocked: ' + (v.lens_unlocked ? 'True' : 'False')
        ];
        stateEl.textContent = parts.join(' | ');
      }
      endcardEl.hidden = false;
    }

    function handleAdvance() {
      if (!state.runtime || state.screen !== 'play') return;
      if (state.isTyping) {
        stopTypewriter(true);
        scheduleAutoOrSkip();
        return;
      }
      var cur = state.runtime.current;
      if (!cur || cur.type === 'menu' || cur.type === 'end' || cur.type === 'error') return;
      var ev = Engine.advanceStory(state.runtime);
      renderPlayEvent(ev);
    }

    function pickChoice(choiceIndex) {
      if (!state.runtime || !state.runtime.current || state.runtime.current.type !== 'menu') return;
      var ev = Engine.chooseMenuOption(state.runtime, choiceIndex);
      renderPlayEvent(ev);
    }

    function handleRollback() {
      if (!state.runtime || state.screen !== 'play') return;
      stopAutoAndSkip();
      stopTypewriter(false);
      var ev = Engine.rollbackStory(state.runtime);
      if (ev) renderPlayEvent(ev);
    }

    function clearTimers() {
      if (state.autoTimer) {
        clearTimeout(state.autoTimer);
        state.autoTimer = null;
      }
      if (state.skipTimer) {
        clearTimeout(state.skipTimer);
        state.skipTimer = null;
      }
    }

    function updateDockToggleButtons() {
      var autoBtn = doc.querySelector('.dock-btn[data-act="auto"]');
      var skipBtn = doc.querySelector('.dock-btn[data-act="skip"]');
      var mapBtn = doc.querySelector('.dock-btn[data-act="map"]');
      var skipLabel = byId('skip-label');
      if (autoBtn) autoBtn.setAttribute('aria-pressed', state.autoMode ? 'true' : 'false');
      if (skipBtn) skipBtn.setAttribute('aria-pressed', state.skipMode ? 'true' : 'false');
      if (mapBtn) mapBtn.setAttribute('aria-pressed', state.mapOpen ? 'true' : 'false');
      if (skipLabel) skipLabel.textContent = state.shiftHeld ? 'Skip all' : 'Skip seen';
    }

    function stopAutoAndSkip() {
      state.autoMode = false;
      state.skipMode = false;
      clearTimers();
      updateDockToggleButtons();
    }

    function toggleAuto() {
      state.autoMode = !state.autoMode;
      if (state.autoMode) state.skipMode = false;
      clearTimers();
      updateDockToggleButtons();
      if (state.autoMode && !state.isTyping) scheduleAutoOrSkip();
    }

    function toggleSkip() {
      state.skipMode = !state.skipMode;
      if (state.skipMode) state.autoMode = false;
      clearTimers();
      updateDockToggleButtons();
      if (state.skipMode) {
        if (state.isTyping) stopTypewriter(true);
        scheduleAutoOrSkip();
      }
    }

    function scheduleAutoOrSkip() {
      clearTimers();
      if (!state.runtime || state.screen !== 'play') return;
      var cur = state.runtime.current;
      if (!cur || cur.type !== 'say') return;

      if (state.skipMode) {
        var canSkip = Boolean(cur.seen || state.shiftHeld);
        if (!canSkip) {
          state.skipMode = false;
          updateDockToggleButtons();
          return;
        }
        state.skipTimer = setTimeout(function () {
          handleAdvance();
        }, 70);
      } else if (state.autoMode) {
        var delay = Math.max(900, Math.min(3400, (cur.text ? cur.text.length : 20) * 38));
        state.autoTimer = setTimeout(function () {
          handleAdvance();
        }, delay);
      }
    }

    function toggleMapDrawer(force) {
      var drawer = byId('map-drawer');
      if (!drawer) return;
      state.mapOpen = typeof force === 'boolean' ? force : !state.mapOpen;
      drawer.hidden = !state.mapOpen;
      updateDockToggleButtons();
      if (state.mapOpen) renderMapDrawer();
    }

    function renderGauges() {
      var gaugesEl = byId('gauges');
      if (!gaugesEl) return;
      gaugesEl.innerHTML = '';
      var vars = (state.runtime && state.runtime.st && state.runtime.st.vars) || {};
      var trust = Number(vars.trust_score) || 0;
      var drift = Number(vars.calibration_drift) || 0;
      var unlocked = Boolean(vars.lens_unlocked);

      var items = [
        { label: 'trust_score', value: String(trust), pct: Math.min(100, Math.max(0, (trust / 4) * 100)), kind: 'trust' },
        { label: 'calibration_drift', value: String(drift), pct: Math.min(100, Math.max(0, (drift / 4) * 100)), kind: 'drift' },
        { label: 'lens_unlocked', value: unlocked ? 'True' : 'False', pct: unlocked ? 100 : 0, kind: 'lens' }
      ];

      items.forEach(function (g) {
        var wrap = doc.createElement('div');
        wrap.className = 'gauge';
        wrap.setAttribute('data-kind', g.kind);
        var dt = doc.createElement('dt');
        dt.textContent = g.label;
        var dd = doc.createElement('dd');
        dd.textContent = g.value;
        var bar = doc.createElement('div');
        bar.className = 'gauge-bar';
        var fill = doc.createElement('span');
        fill.className = 'gauge-fill';
        fill.style.setProperty('--fill', String(Math.round(g.pct)));
        bar.appendChild(fill);
        wrap.appendChild(dt);
        wrap.appendChild(dd);
        wrap.appendChild(bar);
        gaugesEl.appendChild(wrap);
      });
    }

    function renderLegend() {
      var legendEl = byId('legend');
      if (!legendEl || legendEl.children.length > 0) return;
      var entries = [
        { kind: 'current', text: 'Current label' },
        { kind: 'visited', text: 'Visited' },
        { kind: 'open', text: 'Unvisited' },
        { kind: 'ending', text: 'Ending' },
        { kind: 'locked', text: 'Guard false' }
      ];
      entries.forEach(function (item) {
        var li = doc.createElement('li');
        var sw = doc.createElement('span');
        sw.className = 'swatch';
        sw.setAttribute('data-kind', item.kind);
        var txt = doc.createElement('span');
        txt.textContent = item.text;
        li.appendChild(sw);
        li.appendChild(txt);
        legendEl.appendChild(li);
      });
    }

    function buildDagSvg(analysis, rt) {
      var layout = Engine.layoutNarrativeGraph(analysis);
      var svg = doc.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'dag');
      svg.setAttribute('viewBox', '0 0 ' + layout.width + ' ' + layout.height);
      svg.setAttribute('width', String(layout.width));
      svg.setAttribute('height', String(layout.height));

      var visited = (rt && rt.visited) || {};
      var currentLabel = (rt && rt.current && rt.current.label) || (rt && rt.st && rt.st.pc.label) || '';
      var taken = rt ? Engine.trailEdges(rt.trail || []) : {};
      var liveVars = (rt && rt.st && rt.st.vars) || {};
      var livePers = (rt && rt.st && rt.st.persistent) || state.persistent;
      var placedLabels = [];

      layout.edges.forEach(function (edge) {
        var path = doc.createElementNS(SVG_NS, 'path');
        path.setAttribute('class', 'edge');
        path.setAttribute('d', edge.d);
        path.setAttribute('data-from', edge.from);
        path.setAttribute('data-to', edge.to);
        path.setAttribute('data-type', edge.type);

        if (taken[edge.from + '>' + edge.to]) {
          path.setAttribute('data-taken', 'yes');
        }
        if (rt && edge.guardList && edge.guardList.length > 0) {
          var pass = Engine.evaluateGuards(edge.guardList, liveVars, livePers);
          if (pass === false) path.setAttribute('data-locked', 'yes');
        }
        svg.appendChild(path);

        if (edge.when) {
          var shown = edge.when.length > 26 ? edge.when.slice(0, 24) + '..' : edge.when;
          var lw = shown.length * 5.8 + 8;
          var lx = Math.round(edge.labelX);
          var ly = Math.round(edge.labelY - 4);
          /* Guard labels from neighbouring edges often land on the same spot, so
             push a label up in steps until it no longer overlaps one already placed. */
          for (var tries = 0; tries < 6; tries++) {
            var clash = placedLabels.some(function (o) {
              return Math.abs(o.x - lx) < (o.w + lw) / 2 && Math.abs(o.y - ly) < 16;
            });
            if (!clash) break;
            ly -= 16;
          }
          placedLabels.push({ x: lx, y: ly, w: lw });
          var lbl = doc.createElementNS(SVG_NS, 'text');
          lbl.setAttribute('class', 'edge-label');
          lbl.setAttribute('x', String(lx));
          lbl.setAttribute('y', String(ly));
          lbl.setAttribute('text-anchor', 'middle');
          lbl.textContent = shown;
          var tip = doc.createElementNS(SVG_NS, 'title');
          tip.textContent = 'Only when ' + edge.when + ' (' + edge.from + ' to ' + edge.to + ')';
          lbl.appendChild(tip);
          svg.appendChild(lbl);
        }
      });

      layout.nodes.forEach(function (nd) {
        var g = doc.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'node');
        g.setAttribute('data-name', nd.name);
        g.setAttribute('data-kind', nd.kind);
        g.setAttribute('data-reachable', nd.reachable ? 'yes' : 'no');
        var nodeState = nd.name === currentLabel ? 'current' : visited[nd.name] ? 'visited' : 'open';
        g.setAttribute('data-state', nodeState);

        var rect = doc.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(nd.x));
        rect.setAttribute('y', String(nd.y));
        rect.setAttribute('width', String(nd.w));
        rect.setAttribute('height', String(nd.h));
        g.appendChild(rect);

        var text = doc.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', String(nd.x + nd.w / 2));
        text.setAttribute('y', String(nd.y + nd.h / 2 + 4));
        text.setAttribute('text-anchor', 'middle');
        var labelText = nd.kind === 'ending' ? nd.title : nd.name;
        text.textContent = labelText.length > 22 ? labelText.slice(0, 20) + '..' : labelText;
        g.appendChild(text);

        svg.appendChild(g);
      });

      return svg;
    }

    function renderMapDrawer() {
      if (!state.analysis) return;
      renderGauges();
      renderLegend();
      var scrollEl = byId('map-scroll');
      if (!scrollEl) return;
      scrollEl.innerHTML = '';
      var mapSvg = buildDagSvg(state.analysis, state.runtime);
      scrollEl.appendChild(mapSvg);
      centerOnNode(scrollEl, mapSvg.querySelector ? mapSvg.querySelector('.node[data-state="current"] rect') : null);
    }

    /* Scroll a graph container so a node (or, with none, the middle of the graph) sits in view. */
    function centerOnNode(scrollEl, rect) {
      if (!scrollEl || scrollEl.clientWidth === undefined) return;
      var x = rect ? Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2 : scrollEl.scrollWidth / 2;
      var y = rect ? Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2 : 0;
      scrollEl.scrollLeft = Math.max(0, x - scrollEl.clientWidth / 2);
      if (rect) scrollEl.scrollTop = Math.max(0, y - scrollEl.clientHeight / 2);
    }

    function setGraphZoom(mode) {
      var scrollEl = byId('graph-scroll');
      if (!scrollEl) return;
      scrollEl.setAttribute('data-zoom', mode);
      doc.querySelectorAll('[data-zoom-set]').forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-zoom-set') === mode ? 'true' : 'false');
      });
      if (mode === 'actual') centerOnNode(scrollEl, null);
    }

    function openDialog(dlg) {
      if (!dlg) return;
      if (typeof dlg.showModal === 'function') {
        try {
          if (!dlg.open) dlg.showModal();
          return;
        } catch (e) {
          /* fallback below */
        }
      }
      dlg.setAttribute('open', '');
    }

    function closeDialog(dlg) {
      if (!dlg) return;
      if (typeof dlg.close === 'function' && dlg.open) {
        try {
          dlg.close();
          return;
        } catch (e) {
          /* fallback below */
        }
      }
      dlg.removeAttribute('open');
    }

    function openHistoryDialog() {
      var backlogEl = byId('backlog');
      var dlg = byId('dlg-history');
      if (!backlogEl || !dlg) return;
      backlogEl.innerHTML = '';
      var hist = (state.runtime && state.runtime.history) || [];
      if (hist.length === 0) {
        var emptyLi = doc.createElement('li');
        emptyLi.className = 'log-entry';
        emptyLi.textContent = 'No dialogue recorded yet.';
        backlogEl.appendChild(emptyLi);
      } else {
        hist.forEach(function (item) {
          var li = doc.createElement('li');
          li.className = 'log-entry';
          li.setAttribute('data-kind', item.kind);
          if (item.kind === 'choice') {
            li.textContent = 'Chose: ' + item.text;
          } else {
            if (item.who) {
              var whoSpan = doc.createElement('span');
              whoSpan.className = 'log-who';
              whoSpan.textContent = item.who;
              li.appendChild(whoSpan);
            }
            var txtNode = doc.createTextNode(item.text);
            li.appendChild(txtNode);
          }
          backlogEl.appendChild(li);
        });
      }
      openDialog(dlg);
      backlogEl.scrollTop = backlogEl.scrollHeight;
    }

    function renderSlotsDialog() {
      var slotsEl = byId('slots');
      var titleEl = byId('dlg-slots-title');
      var noteEl = byId('slots-note');
      if (!slotsEl) return;

      if (titleEl) {
        titleEl.textContent = state.slotMode === 'save' ? 'Save to a slot' : 'Load a slot';
      }
      if (noteEl) {
        noteEl.textContent = state.slotMode === 'save'
          ? 'Pick any slot to store your current checkpoint in this browser.'
          : 'Pick a saved slot to resume from that checkpoint.';
      }

      slotsEl.innerHTML = '';
      for (var i = 0; i < SLOT_COUNT; i++) {
        (function (slotIndex) {
          var saved = state.slots[slotIndex];
          var li = doc.createElement('li');
          var btn = doc.createElement('button');
          btn.type = 'button';
          btn.className = 'slot-btn';
          btn.setAttribute('data-slot', String(slotIndex));

          var nameSpan = doc.createElement('span');
          nameSpan.className = 'slot-name';
          nameSpan.textContent = 'Slot 0' + (slotIndex + 1);

          var metaSpan = doc.createElement('span');
          metaSpan.className = 'slot-meta';
          if (saved) {
            var labelText = saved.label || 'start';
            var stampText = (saved.meta && saved.meta.savedAt) || 'saved';
            metaSpan.textContent = labelText + ' | ' + stampText;
          } else {
            metaSpan.textContent = 'Empty slot';
          }

          if (state.slotMode === 'load' && !saved) {
            btn.disabled = true;
          }
          if (state.slotMode === 'save' && (!state.runtime || state.runtime.checkpoints.length === 0)) {
            btn.disabled = true;
          }

          btn.addEventListener('click', function () {
            if (state.slotMode === 'save') {
              if (!state.runtime) return;
              var now = new Date();
              var stamp = now.toISOString().slice(0, 16).replace('T', ' ');
              var data = Engine.serializeSaveSlot(state.runtime, {
                savedAt: stamp,
                slot: slotIndex + 1
              });
              state.slots[slotIndex] = data;
              saveStorage();
              updateMenuHints();
              renderSlotsDialog();
              closeDialog(byId('dlg-slots'));
            } else if (saved) {
              if (!state.program) compileSource(state.canonicalSource);
              state.runtime = Engine.restoreSaveSlot(state.program, saved, { seen: state.seen });
              state.currentBg = null;
              closeDialog(byId('dlg-slots'));
              showScreen('play');
              renderPlayEvent(state.runtime.current);
            }
          });

          btn.appendChild(nameSpan);
          btn.appendChild(metaSpan);
          li.appendChild(btn);
          slotsEl.appendChild(li);
        })(i);
      }
    }

    function openSlotsDialog(mode) {
      state.slotMode = mode === 'load' ? 'load' : 'save';
      renderSlotsDialog();
      openDialog(byId('dlg-slots'));
    }

    function openSettingsDialog() {
      var speedInput = byId('set-speed');
      var speedOut = byId('set-speed-out');
      var lockedCheck = byId('set-locked');
      var parallaxCheck = byId('set-parallax');
      if (speedInput) speedInput.value = String(state.settings.cps);
      if (speedOut) {
        speedOut.textContent = state.settings.cps >= 120 || state.settings.cps <= 0
          ? 'Instant'
          : state.settings.cps + ' characters per second';
      }
      if (lockedCheck) lockedCheck.checked = Boolean(state.settings.showLocked);
      if (parallaxCheck) parallaxCheck.checked = Boolean(state.settings.parallax);
      openDialog(byId('dlg-settings'));
    }

    function renderGallery() {
      var listEl = byId('ending-list');
      if (!listEl) return;
      if (!state.analysis) compileSource(state.canonicalSource);
      listEl.innerHTML = '';

      var analysisEndings = {};
      (state.analysis.endings || []).forEach(function (e) {
        analysisEndings[e.label] = e;
      });

      ENDING_CATALOG.forEach(function (entry) {
        var found = Boolean(state.persistent[entry.flag]);
        var info = analysisEndings[entry.label];
        var li = doc.createElement('li');
        li.className = 'ending-card';
        li.setAttribute('data-ending', entry.label);
        li.setAttribute('data-found', found ? 'yes' : 'no');

        var content = doc.createElement('div');
        var h3 = doc.createElement('h3');
        h3.className = 'ending-title';
        h3.textContent = found ? entry.title : 'Unfound Ending (' + entry.title + ')';

        var body = doc.createElement('p');
        body.className = 'ending-body';
        body.textContent = found
          ? entry.summary
          : 'Not discovered in a playthrough yet. Below is a verified shortest choice path from the parser.';

        var meta = doc.createElement('p');
        meta.className = 'ending-meta';
        if (info && info.reachable) {
          meta.textContent = 'Label: ' + entry.label + ' | Reachable in ' + info.choiceCount + ' choices';
        } else {
          meta.textContent = 'Label: ' + entry.label;
        }

        content.appendChild(h3);
        content.appendChild(body);
        content.appendChild(meta);

        if (info && Array.isArray(info.shortestChoices) && info.shortestChoices.length > 0) {
          var ol = doc.createElement('ol');
          ol.className = 'route';
          info.shortestChoices.forEach(function (step) {
            var stepLi = doc.createElement('li');
            stepLi.textContent = step.label + ': "' + step.text + '"';
            ol.appendChild(stepLi);
          });
          content.appendChild(ol);
        }

        li.appendChild(content);
        listEl.appendChild(li);
      });
    }

    function runInspectorAudit() {
      var editor = byId('src-editor');
      var src = editor ? editor.value : (state.activeSource || state.canonicalSource);
      var audit = Engine.auditScript(src);
      state.inspectorAudit = audit;
      renderInspectorReport(audit);
      return audit;
    }

    function renderInspectorReport(audit) {
      var verdictEl = byId('verdict');
      var statsEl = byId('stats');
      var issuesEl = byId('issues');
      var graphScroll = byId('graph-scroll');
      var routeList = byId('route-list');
      if (!audit) return;

      var a = audit.analysis;
      var reachableEndings = (a.endings || []).filter(function (e) { return e.reachable; }).length;
      var totalEndings = (a.endings || []).length;

      if (verdictEl) {
        if (audit.ok && reachableEndings === totalEndings) {
          verdictEl.setAttribute('data-state', 'ok');
          verdictEl.textContent = 'Verified: ' + a.stats.labelCount + ' labels, ' + reachableEndings + ' of ' + totalEndings + ' endings reachable, 0 hard errors.';
        } else {
          verdictEl.setAttribute('data-state', 'bad');
          var errCount = (a.issues || []).filter(function (i) { return i.severity === 'error'; }).length;
          verdictEl.textContent = 'Audit failed: ' + errCount + (errCount === 1 ? ' error' : ' errors') + ' detected (' + reachableEndings + ' of ' + totalEndings + ' endings reachable).';
        }
      }

      if (statsEl) {
        statsEl.innerHTML = '';
        var statPairs = [
          ['Labels', a.stats.labelCount],
          ['Reachable', a.stats.reachableCount],
          ['Edges', a.stats.edgeCount],
          ['Menus', a.stats.menuCount],
          ['Choices', a.stats.choiceCount],
          ['States explored', a.stats.statesExplored]
        ];
        statPairs.forEach(function (pair) {
          var div = doc.createElement('div');
          div.className = 'stat';
          var dt = doc.createElement('dt');
          dt.textContent = pair[0];
          var dd = doc.createElement('dd');
          dd.textContent = String(pair[1]);
          div.appendChild(dt);
          div.appendChild(dd);
          statsEl.appendChild(div);
        });
      }

      if (issuesEl) {
        issuesEl.innerHTML = '';
        if (!a.issues || a.issues.length === 0) {
          var clearLi = doc.createElement('li');
          clearLi.className = 'issues-clear';
          clearLi.textContent = 'No syntax errors, unreachable labels, dead ends, or locked endings found.';
          issuesEl.appendChild(clearLi);
        } else {
          a.issues.forEach(function (iss) {
            var li = doc.createElement('li');
            li.className = 'issue';
            li.setAttribute('data-severity', iss.severity);

            var sev = doc.createElement('span');
            sev.className = 'issue-sev';
            sev.textContent = iss.severity + (iss.line ? ' L' + iss.line : '');

            var msg = doc.createElement('p');
            msg.className = 'issue-msg';
            msg.textContent = iss.message;

            li.appendChild(sev);
            li.appendChild(msg);

            if (iss.line) {
              var jumpBtn = doc.createElement('button');
              jumpBtn.type = 'button';
              jumpBtn.className = 'issue-jump';
              jumpBtn.textContent = 'Line ' + iss.line;
              jumpBtn.addEventListener('click', function () {
                jumpEditorToLine(iss.line);
              });
              li.appendChild(jumpBtn);
            }
            issuesEl.appendChild(li);
          });
        }
      }

      if (graphScroll) {
        graphScroll.innerHTML = '';
        graphScroll.appendChild(buildDagSvg(a, null));
      }

      if (routeList) {
        routeList.innerHTML = '';
        (a.endings || []).forEach(function (ending) {
          var li = doc.createElement('li');
          li.className = 'route-item';
          var head = doc.createElement('div');
          head.className = 'route-head';
          var title = doc.createElement('h3');
          title.className = 'route-title';
          title.textContent = ending.title + ' (' + ending.label + ')';
          var count = doc.createElement('span');
          count.className = 'route-count';
          count.textContent = ending.reachable ? ending.choiceCount + ' choices' : 'Unreachable';
          head.appendChild(title);
          head.appendChild(count);
          li.appendChild(head);

          if (ending.reachable && Array.isArray(ending.shortestChoices)) {
            var ol = doc.createElement('ol');
            ol.className = 'route-steps';
            ending.shortestChoices.forEach(function (step) {
              var sLi = doc.createElement('li');
              sLi.textContent = step.label + ': "' + step.text + '"';
              ol.appendChild(sLi);
            });
            li.appendChild(ol);
          } else {
            var fail = doc.createElement('p');
            fail.className = 'route-fail';
            fail.textContent = 'No valid sequence of choices reaches this ending.';
            li.appendChild(fail);
          }
          routeList.appendChild(li);
        });
      }
    }

    function jumpEditorToLine(lineNumber) {
      var editor = byId('src-editor');
      if (!editor) return;
      var lines = editor.value.split('\n');
      var pos = 0;
      for (var i = 0; i < Math.min(lineNumber - 1, lines.length); i++) {
        pos += lines[i].length + 1;
      }
      var lineLen = (lines[lineNumber - 1] || '').length;
      editor.focus();
      if (typeof editor.setSelectionRange === 'function') {
        editor.setSelectionRange(pos, pos + lineLen);
      }
    }

    function switchInspectorTab(tabName) {
      var tabs = ['audit', 'graph', 'endings'];
      tabs.forEach(function (name) {
        var btn = byId('tab-' + name);
        var panel = byId('panel-' + name);
        var active = name === tabName;
        if (btn) {
          btn.setAttribute('aria-selected', active ? 'true' : 'false');
          btn.tabIndex = active ? 0 : -1;
        }
        if (panel) {
          panel.hidden = !active;
        }
      });
      if (tabName === 'graph') {
        var gs = byId('graph-scroll');
        setGraphZoom((gs && gs.getAttribute('data-zoom')) || 'actual');
      }
    }

    function formatAuditPlaintext(audit) {
      if (!audit) return '';
      var a = audit.analysis;
      var lines = [
        'The Glass Meridian: Script & DAG Audit Report',
        'Status: ' + (audit.ok ? 'PASS' : 'FAIL'),
        'Labels: ' + a.stats.labelCount + ' (' + a.stats.reachableCount + ' reachable)',
        'Edges: ' + a.stats.edgeCount + ', Menus: ' + a.stats.menuCount + ', Choices: ' + a.stats.choiceCount,
        'States explored: ' + a.stats.statesExplored
      ];
      (a.endings || []).forEach(function (e) {
        lines.push('Ending ' + e.label + ': ' + (e.reachable ? 'reachable in ' + e.choiceCount + ' choices' : 'UNREACHABLE'));
      });
      (a.issues || []).forEach(function (iss) {
        lines.push('[' + iss.severity.toUpperCase() + (iss.line ? ' L' + iss.line : '') + '] ' + iss.message);
      });
      return lines.join('\n');
    }

    function bindEvents() {
      doc.querySelectorAll('[data-action]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var action = btn.getAttribute('data-action');
          if (action === 'new') startNewGame(state.canonicalSource);
          else if (action === 'continue') openSlotsDialog('load');
          else if (action === 'gallery') showScreen('gallery');
          else if (action === 'inspector') showScreen('inspector');
          else if (action === 'menu') showScreen('menu');
        });
      });

      var dialogueEl = byId('dialogue');
      if (dialogueEl) {
        dialogueEl.addEventListener('click', function () {
          handleAdvance();
        });
      }

      var stageEl = byId('stage');
      if (stageEl) {
        stageEl.addEventListener('click', function () {
          handleAdvance();
        });
      }

      doc.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var act = btn.getAttribute('data-act');
          if (act === 'back') handleRollback();
          else if (act === 'history') openHistoryDialog();
          else if (act === 'auto') toggleAuto();
          else if (act === 'skip') toggleSkip();
          else if (act === 'save') openSlotsDialog('save');
          else if (act === 'load') openSlotsDialog('load');
          else if (act === 'map') toggleMapDrawer();
          else if (act === 'settings') openSettingsDialog();
          else if (act === 'menu') showScreen('menu');
          else if (act === 'again') startNewGame();
          else if (act === 'gallery') showScreen('gallery');
        });
      });

      doc.querySelectorAll('dialog [data-close]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var dlg = btn.closest('dialog');
          closeDialog(dlg);
        });
      });

      var speedInput = byId('set-speed');
      var speedOut = byId('set-speed-out');
      if (speedInput) {
        speedInput.addEventListener('input', function () {
          var val = Number(speedInput.value) || 0;
          state.settings.cps = val;
          doc.documentElement.style.setProperty('--type-cps', String(val));
          if (speedOut) {
            speedOut.textContent = val >= 120 || val <= 0 ? 'Instant' : val + ' characters per second';
          }
          saveStorage();
        });
      }

      var lockedCheck = byId('set-locked');
      if (lockedCheck) {
        lockedCheck.addEventListener('change', function () {
          state.settings.showLocked = Boolean(lockedCheck.checked);
          saveStorage();
          if (state.runtime && state.runtime.current && state.runtime.current.type === 'menu') {
            renderChoices(state.runtime.current);
          }
        });
      }

      var parallaxCheck = byId('set-parallax');
      if (parallaxCheck) {
        parallaxCheck.addEventListener('change', function () {
          state.settings.parallax = Boolean(parallaxCheck.checked);
          if (!state.settings.parallax) {
            doc.documentElement.style.setProperty('--px', '0');
            doc.documentElement.style.setProperty('--py', '0');
          }
          saveStorage();
        });
      }

      var wipeBtn = byId('btn-wipe');
      if (wipeBtn) {
        wipeBtn.addEventListener('click', function () {
          wipeAllProgress();
        });
      }

      var editor = byId('src-editor');
      if (editor) {
        editor.addEventListener('input', function () {
          runInspectorAudit();
        });
      }

      var resetBtn = byId('btn-reset');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          if (editor) editor.value = state.canonicalSource;
          runInspectorAudit();
        });
      }

      var copyBtn = byId('btn-copy');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          var reportText = formatAuditPlaintext(state.inspectorAudit || runInspectorAudit());
          if (win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === 'function') {
            win.navigator.clipboard.writeText(reportText).catch(function () {});
          }
        });
      }

      var playScriptBtn = byId('btn-play-script');
      if (playScriptBtn) {
        playScriptBtn.addEventListener('click', function () {
          var src = editor && editor.value ? editor.value : state.canonicalSource;
          var audit = Engine.auditScript(src);
          state.inspectorAudit = audit;
          renderInspectorReport(audit);
          if (audit.program.labels && audit.program.labels.start) {
            startNewGame(src);
          }
        });
      }

      doc.querySelectorAll('.tabs [data-tab]').forEach(function (tabBtn) {
        tabBtn.addEventListener('click', function () {
          switchInspectorTab(tabBtn.getAttribute('data-tab'));
        });
      });

      doc.querySelectorAll('[data-zoom-set]').forEach(function (zoomBtn) {
        zoomBtn.addEventListener('click', function () {
          setGraphZoom(zoomBtn.getAttribute('data-zoom-set'));
        });
      });

      /* On a phone the dialogue box grows with the line, and the choices sit just above it. */
      var stageWrapEl = byId('stage-wrap');
      var dialogueBox = byId('dialogue');
      if (stageWrapEl && dialogueBox && typeof win.ResizeObserver === 'function') {
        new win.ResizeObserver(function () {
          stageWrapEl.style.setProperty('--dialogue-h', dialogueBox.offsetHeight + 'px');
        }).observe(dialogueBox);
      }

      if (win.addEventListener) {
        win.addEventListener('pointermove', function (ev) {
          if (!state.settings.parallax) return;
          var w = win.innerWidth || 1280;
          var h = win.innerHeight || 720;
          var px = ((ev.clientX / w) - 0.5) * 2;
          var py = ((ev.clientY / h) - 0.5) * 2;
          doc.documentElement.style.setProperty('--px', px.toFixed(3));
          doc.documentElement.style.setProperty('--py', py.toFixed(3));
        });

        win.addEventListener('keydown', function (ev) {
          if (ev.key === 'Shift') {
            state.shiftHeld = true;
            updateDockToggleButtons();
          }
          var activeTag = doc.activeElement && doc.activeElement.tagName
            ? doc.activeElement.tagName.toLowerCase()
            : '';
          if (activeTag === 'textarea' || activeTag === 'input') return;

          var openDlg = doc.querySelector('dialog[open]');
          if (openDlg) {
            if (ev.key === 'Escape') {
              ev.preventDefault();
              closeDialog(openDlg);
            }
            return;
          }

          if (state.screen === 'play') {
            if (ev.key === ' ' || ev.key === 'Enter' || ev.key === 'ArrowRight') {
              if (state.runtime && state.runtime.current && state.runtime.current.type === 'say') {
                ev.preventDefault();
                handleAdvance();
              }
            } else if (ev.key === 'ArrowLeft' || ev.key === 'Backspace') {
              ev.preventDefault();
              handleRollback();
            } else if (/^[1-9]$/.test(ev.key)) {
              var btn = doc.querySelector('.choice[data-hotkey="' + ev.key + '"]');
              if (btn) {
                ev.preventDefault();
                btn.click();
              }
            } else if (ev.key === 'h' || ev.key === 'H') {
              ev.preventDefault();
              openHistoryDialog();
            } else if (ev.key === 'm' || ev.key === 'M') {
              ev.preventDefault();
              toggleMapDrawer();
            } else if (ev.key === 'a' || ev.key === 'A') {
              ev.preventDefault();
              toggleAuto();
            } else if (ev.key === 's' || ev.key === 'S') {
              ev.preventDefault();
              toggleSkip();
            } else if (ev.key === 'Escape') {
              ev.preventDefault();
              if (state.mapOpen) toggleMapDrawer(false);
              else showScreen('menu');
            }
          } else if (state.screen !== 'menu' && ev.key === 'Escape') {
            ev.preventDefault();
            showScreen('menu');
          }
        });

        win.addEventListener('keyup', function (ev) {
          if (ev.key === 'Shift') {
            state.shiftHeld = false;
            updateDockToggleButtons();
          }
        });
      }
    }

    function init() {
      loadStorage();
      if (state.canonicalSource) {
        compileSource(state.canonicalSource);
        var editor = byId('src-editor');
        if (editor) editor.value = state.canonicalSource;
      } else if (typeof win.fetch === 'function') {
        win.fetch('game/script.rpy')
          .then(function (r) { return r.text(); })
          .then(function (txt) {
            state.canonicalSource = txt;
            compileSource(txt);
            var editor = byId('src-editor');
            if (editor && !editor.value) editor.value = txt;
          })
          .catch(function () {});
      }
      bindEvents();
      updateMenuHints();
      return api;
    }

    var api = {
      state: state,
      init: init,
      showScreen: showScreen,
      startNewGame: startNewGame,
      handleAdvance: handleAdvance,
      pickChoice: pickChoice,
      handleRollback: handleRollback,
      openHistoryDialog: openHistoryDialog,
      openSlotsDialog: openSlotsDialog,
      openSettingsDialog: openSettingsDialog,
      toggleMapDrawer: toggleMapDrawer,
      runInspectorAudit: runInspectorAudit,
      switchInspectorTab: switchInspectorTab,
      wipeAllProgress: wipeAllProgress
    };

    return init();
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { createApp: createApp, ENDING_CATALOG: ENDING_CATALOG };
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.GlassMeridianApp = { createApp: createApp, ENDING_CATALOG: ENDING_CATALOG };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        window.glassMeridian = createApp(document, window);
      });
    } else {
      window.glassMeridian = createApp(document, window);
    }
  }
})(typeof self !== 'undefined' ? self : this);
