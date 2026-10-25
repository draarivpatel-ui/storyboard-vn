'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../engine.js');

const SCRIPT_PATH = path.join(__dirname, '..', 'game', 'script.rpy');
const CANONICAL_SOURCE = fs.readFileSync(SCRIPT_PATH, 'utf8');

/* ------------------------------------------------------------------ */
/* 1. Expression Parser & Evaluator                                    */
/* ------------------------------------------------------------------ */

test('evaluateExpression: numeric addition, subtraction, and multiplication', function () {
  assert.equal(Engine.evaluateExpression('2 + 3 * 4', {}, {}), 14);
  assert.equal(Engine.evaluateExpression('(2 + 3) * 4', {}, {}), 20);
  assert.equal(Engine.evaluateExpression('10 - 3 - 2', {}, {}), 5);
});

test('evaluateExpression: division, floor division, and modulo', function () {
  assert.equal(Engine.evaluateExpression('7 // 2', {}, {}), 3);
  assert.equal(Engine.evaluateExpression('-7 // 2', {}, {}), -4);
  assert.equal(Engine.evaluateExpression('10 % 3', {}, {}), 1);
  assert.equal(Engine.evaluateExpression('8 / 2', {}, {}), 4);
  assert.equal(Engine.evaluateExpression('1.5 + 2.25', {}, {}), 3.75);
});

test('evaluateExpression: unary operators and boolean/null constants', function () {
  assert.equal(Engine.evaluateExpression('-5', {}, {}), -5);
  assert.equal(Engine.evaluateExpression('+5', {}, {}), 5);
  assert.equal(Engine.evaluateExpression('-True', {}, {}), -1);
  assert.equal(Engine.evaluateExpression('True', {}, {}), true);
  assert.equal(Engine.evaluateExpression('False', {}, {}), false);
  assert.equal(Engine.evaluateExpression('None', {}, {}), null);
});

test('evaluateExpression: boolean logic and short-circuiting', function () {
  assert.equal(Engine.evaluateExpression('not False', {}, {}), true);
  assert.equal(Engine.evaluateExpression('not True', {}, {}), false);
  assert.equal(Engine.evaluateExpression('not 0', {}, {}), true);
  assert.equal(Engine.evaluateExpression('True and False', {}, {}), false);
  assert.equal(Engine.evaluateExpression('False or True', {}, {}), true);
  assert.equal(Engine.evaluateExpression('0 or 42', {}, {}), 42);
  assert.equal(Engine.evaluateExpression('1 and 99', {}, {}), 99);
});

test('evaluateExpression: chained comparisons as in Python', function () {
  assert.equal(Engine.evaluateExpression('1 < 2 < 3', {}, {}), true);
  assert.equal(Engine.evaluateExpression('1 < 3 < 2', {}, {}), false);
  assert.equal(Engine.evaluateExpression('3 <= 3 == 3', {}, {}), true);
  assert.equal(Engine.evaluateExpression('5 >= 4 > 1', {}, {}), true);
  assert.equal(Engine.evaluateExpression('"a" != "b"', {}, {}), true);
  assert.equal(Engine.evaluateExpression('"apple" < "banana"', {}, {}), true);
});

test('evaluateExpression: string concatenation and variable lookup', function () {
  const vars = { greeting: 'Good ', time: 'morning', score: 3 };
  const persistent = { unlocked: true };
  assert.equal(Engine.evaluateExpression('greeting + time', vars, persistent), 'Good morning');
  assert.equal(Engine.evaluateExpression('score >= 2 and persistent.unlocked', vars, persistent), true);
  assert.equal(Engine.evaluateExpression('persistent.missing_flag', vars, persistent), null);
});

test('evaluateExpression: raises StoryError on division by zero', function () {
  assert.throws(function () {
    Engine.evaluateExpression('1 / 0', {}, {});
  }, Engine.StoryError);
  assert.throws(function () {
    Engine.evaluateExpression('1 // 0', {}, {});
  }, Engine.StoryError);
  assert.throws(function () {
    Engine.evaluateExpression('1 % 0', {}, {});
  }, Engine.StoryError);
});

test('evaluateExpression: raises StoryError on undefined variable or invalid types', function () {
  assert.throws(function () {
    Engine.evaluateExpression('unknown_var + 1', {}, {});
  }, Engine.StoryError);
  assert.throws(function () {
    Engine.evaluateExpression('"text" - 1', {}, {});
  }, Engine.StoryError);
  assert.throws(function () {
    Engine.evaluateExpression('-"text"', {}, {});
  }, Engine.StoryError);
  assert.throws(function () {
    Engine.evaluateExpression('"text" < 5', {}, {});
  }, Engine.StoryError);
});

test('evaluateExpression: rejects unsupported deep attribute access', function () {
  assert.throws(function () {
    Engine.evaluateExpression('persistent.a.b', {}, {});
  }, Engine.StoryError);
  assert.throws(function () {
    Engine.evaluateExpression('other.prop', {}, {});
  }, Engine.StoryError);
});

test('parseExpression: rejects malformed syntax', function () {
  assert.throws(function () { Engine.parseExpression(''); }, Engine.StoryError);
  assert.throws(function () { Engine.parseExpression('1.2.3'); }, Engine.StoryError);
  assert.throws(function () { Engine.parseExpression('"unterminated'); }, Engine.StoryError);
  assert.throws(function () { Engine.parseExpression('(1 + 2'); }, Engine.StoryError);
  assert.throws(function () { Engine.parseExpression('1 + * 2'); }, Engine.StoryError);
  assert.throws(function () { Engine.parseExpression('a @ b'); }, Engine.StoryError);
  assert.throws(function () { Engine.parseExpression('1 2'); }, Engine.StoryError);
});

/* ------------------------------------------------------------------ */
/* 2. Ren'Py Script Parser & Static Validator                          */
/* ------------------------------------------------------------------ */

test('parseRenpyScript: parses canonical game/script.rpy with zero diagnostics', function () {
  const program = Engine.parseRenpyScript(CANONICAL_SOURCE);
  assert.equal(program.diagnostics.length, 0);
  assert.ok(program.labels.start);
  assert.ok(program.characters.mira);
  assert.equal(program.characters.mira.name, 'Mira');
  assert.equal(program.characters.mira.color, '#1E5E63');
  assert.ok(program.images['bg harbor']);
  assert.deepEqual(program.images['mira calm'].layers, ['images/mira_body.svg', 'images/mira_face_calm.svg']);
});

test('parseRenpyScript: parses characters, constants, defaults, and images', function () {
  const src = [
    'define hero = Character("Hero", color="#112233")',
    'define narrator_null = Character(None)',
    'define MAX_TRUST = 5',
    'default score = 1',
    'default persistent.clear = False',
    'image bg room = "images/bg_harbor.svg"',
    'label start:',
    '    scene bg room',
    '    hero "Score is [score] of [MAX_TRUST]."',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  assert.equal(prog.diagnostics.length, 0);
  assert.equal(prog.constants.MAX_TRUST, 5);
  assert.equal(prog.defaults.length, 2);
  assert.equal(prog.characters.hero.name, 'Hero');
  assert.equal(prog.characters.narrator_null.name, null);
});

test('parseRenpyScript: strips comments and text tags and handles escaped brackets', function () {
  const src = [
    'define m = Character("Mira")',
    'default n = 4',
    'label start:',
    '    # Full line comment',
    '    m "{b}Bold{/b} [[literal] and [n]" # trailing comment outside string',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  assert.equal(prog.diagnostics.length, 0);
  const rt = Engine.createStoryRuntime(prog);
  const ev = Engine.advanceStory(rt);
  assert.equal(ev.text, 'Bold [literal] and 4');
});

test('parseRenpyScript: flags unclosed interpolation and bad interpolation expression', function () {
  const src = [
    'label start:',
    '    "Unclosed [foo"',
    '    "Bad expr [1 + * 2]"',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  assert.ok(prog.diagnostics.some(function (d) { return /Unclosed \[/.test(d.message); }));
  assert.ok(prog.diagnostics.some(function (d) { return /Bad interpolation/.test(d.message); }));
});

test('parseRenpyScript: flags missing start label', function () {
  const prog = Engine.parseRenpyScript('label other:\n    "Hi"\n    return\n');
  assert.ok(prog.diagnostics.some(function (d) {
    return d.severity === 'error' && /no "label start:"/.test(d.message);
  }));
});

test('parseRenpyScript: flags undefined speaker, jump target, image, and variable', function () {
  const src = [
    'label start:',
    '    ghost "Boo"',
    '    scene bg nonexistent',
    '    "Value is [missing_var]"',
    '    jump nowhere',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  const msgs = prog.diagnostics.map(function (d) { return d.message; }).join(' | ');
  assert.match(msgs, /Speaker "ghost" is not defined/);
  assert.match(msgs, /scene of undefined image "bg nonexistent"/);
  assert.match(msgs, /name "missing_var" is not defined/);
  assert.match(msgs, /jump to undefined label "nowhere"/);
});

test('parseRenpyScript: flags duplicate labels and nested labels', function () {
  const src = [
    'label start:',
    '    label nested:',
    '        "bad"',
    '    return',
    'label start:',
    '    "dup"',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  assert.ok(prog.diagnostics.some(function (d) { return /Labels cannot be nested/.test(d.message); }));
  assert.ok(prog.diagnostics.some(function (d) { return /Duplicate label "start"/.test(d.message); }));
});

test('parseRenpyScript: flags compound assignment on variable without default', function () {
  const src = [
    'label start:',
    '    $ count += 1',
    '    "Count [count]"',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  assert.ok(prog.diagnostics.some(function (d) {
    return /used with \+= but never given a default/.test(d.message);
  }));
});

test('parseRenpyScript: flags triple-quoted strings and top-level stray statements', function () {
  const src = [
    '"""triple"""',
    '    "indented at top level"',
    'jump stray_top',
    'label start:',
    '    "ok"',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  assert.ok(prog.diagnostics.some(function (d) { return /Triple-quoted strings/.test(d.message); }));
  assert.ok(prog.diagnostics.some(function (d) { return /Unexpected indentation at top level/.test(d.message); }));
  assert.ok(prog.diagnostics.some(function (d) { return /Statement outside a label/.test(d.message); }));
});

test('parseRenpyScript: warns on unsupported RenPy statements without crashing', function () {
  const src = [
    'init python:',
    '    x = 1',
    'label start:',
    '    play music "song.ogg"',
    '    show screen hud',
    '    "Still playable."',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  const warnings = prog.diagnostics.filter(function (d) { return d.severity === 'warning'; });
  assert.ok(warnings.length >= 3);
  const rt = Engine.createStoryRuntime(prog);
  const ev = Engine.advanceStory(rt);
  assert.equal(ev.text, 'Still playable.');
});

/* ------------------------------------------------------------------ */
/* 3. Story Runtime State Machine                                      */
/* ------------------------------------------------------------------ */

test('Runtime: steps through scene, show, hide, with, and dialogue events', function () {
  const src = [
    'define m = Character("Mira", color="#1E5E63")',
    'image bg harbor = "images/bg_harbor.svg"',
    'image m calm = Composite((520, 900), (0, 0), "images/mira_body.svg", (0, 0), "images/mira_face_calm.svg")',
    'image m smile = Composite((520, 900), (0, 0), "images/mira_body.svg", (0, 0), "images/mira_face_smile.svg")',
    'label start:',
    '    scene bg harbor with fade',
    '    show m calm at left with dissolve',
    '    m "First line."',
    '    show m smile',
    '    with dissolve',
    '    m "Second line."',
    '    hide m with dissolve',
    '    "Third line."',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  const rt = Engine.createStoryRuntime(prog);

  const ev1 = Engine.advanceStory(rt);
  assert.equal(ev1.type, 'say');
  assert.equal(ev1.who, 'Mira');
  assert.equal(ev1.stage.bg, 'bg harbor');
  assert.equal(ev1.stage.sprites.length, 1);
  assert.equal(ev1.stage.sprites[0].name, 'm calm');
  assert.equal(ev1.stage.sprites[0].at, 'left');

  const ev2 = Engine.advanceStory(rt);
  assert.equal(ev2.stage.sprites[0].name, 'm smile');
  assert.equal(ev2.stage.sprites[0].at, 'left');
  assert.equal(ev2.stage.transition, 'dissolve');

  const ev3 = Engine.advanceStory(rt);
  assert.equal(ev3.stage.sprites.length, 0);
  assert.equal(ev3.who, null);

  const ev4 = Engine.advanceStory(rt);
  assert.equal(ev4.type, 'end');
});

test('Runtime: evaluates if / elif / else and all assignment operators', function () {
  const src = [
    'default x = 10',
    'label start:',
    '    $ x += 5',
    '    $ x -= 3',
    '    $ x *= 2',
    '    $ x //= 5',
    '    if x == 4:',
    '        "Branch four"',
    '    elif x == 5:',
    '        "Branch five"',
    '    else:',
    '        "Branch else"',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  const rt = Engine.createStoryRuntime(prog);
  const ev = Engine.advanceStory(rt);
  assert.equal(ev.text, 'Branch four');
  assert.equal(ev.vars.x, 4);
});

test('Runtime: supports call and return subroutine stack', function () {
  const src = [
    'default calls = 0',
    'label start:',
    '    call helper',
    '    call helper',
    '    "Done [calls]"',
    '    return',
    'label helper:',
    '    $ calls += 1',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  const rt = Engine.createStoryRuntime(prog);
  const ev = Engine.advanceStory(rt);
  assert.equal(ev.text, 'Done 2');
  const endEv = Engine.advanceStory(rt);
  assert.equal(endEv.type, 'end');
});

test('Runtime: label fallthrough matches RenPy semantics', function () {
  const src = [
    'label start:',
    '    "In start"',
    'label second:',
    '    pass',
    '    "Fell into second"',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  const rt = Engine.createStoryRuntime(prog);
  assert.equal(Engine.advanceStory(rt).text, 'In start');
  assert.equal(Engine.advanceStory(rt).text, 'Fell into second');
  assert.equal(Engine.advanceStory(rt).type, 'end');
});

test('Runtime: menu filtering separates available and locked choices', function () {
  const src = [
    'default keys = 0',
    'label start:',
    '    menu:',
    '        "Pick a door"',
    '        "Open wooden door":',
    '            "Wood opened"',
    '        "Open brass door" if keys >= 1:',
    '            "Brass opened"',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  const rt = Engine.createStoryRuntime(prog);
  const menuEv = Engine.advanceStory(rt);
  assert.equal(menuEv.type, 'menu');
  assert.equal(menuEv.caption, 'Pick a door');
  assert.equal(menuEv.choices.length, 1);
  assert.equal(menuEv.locked.length, 1);
  assert.equal(menuEv.locked[0].guard, 'keys >= 1');

  assert.throws(function () {
    Engine.chooseMenuOption(rt, 1);
  }, Engine.StoryError);

  const nextEv = Engine.chooseMenuOption(rt, 0);
  assert.equal(nextEv.text, 'Wood opened');
});

test('Runtime: marks seen dialogue keys on repeat visits', function () {
  const src = [
    'label start:',
    '    "First line"',
    '    return'
  ].join('\n');
  const prog = Engine.parseRenpyScript(src);
  const rt1 = Engine.createStoryRuntime(prog);
  const ev1 = Engine.advanceStory(rt1);
  assert.equal(ev1.seen, false);

  const rt2 = Engine.createStoryRuntime(prog, { seen: rt1.seen });
  const ev2 = Engine.advanceStory(rt2);
  assert.equal(ev2.seen, true);
});

test('Runtime: rollbackStory restores variables, history, and stage accurately', function () {
  const prog = Engine.parseRenpyScript(CANONICAL_SOURCE);
  const rt = Engine.createStoryRuntime(prog);

  const line1 = Engine.advanceStory(rt);
  assert.equal(Engine.rollbackStory(rt), null); /* cannot rollback before line 1 */
  const line2 = Engine.advanceStory(rt);
  assert.notEqual(line1.text, line2.text);

  const rolled = Engine.rollbackStory(rt);
  assert.equal(rolled.text, line1.text);
  assert.equal(rt.history.length, 1);

  /* Advance to first menu and pick an option, then rollback across the choice */
  let ev = rolled;
  while (ev.type !== 'menu') {
    ev = Engine.advanceStory(rt);
  }
  assert.equal(rt.st.vars.trust_score, 0);
  const afterChoice = Engine.chooseMenuOption(rt, 0);
  assert.equal(afterChoice.vars.trust_score, 1);

  const backToMenu = Engine.rollbackStory(rt);
  assert.equal(backToMenu.type, 'menu');
  assert.equal(backToMenu.vars.trust_score, 0);
  assert.equal(rt.choicesMade.length, 0);
});

test('Runtime: serializeSaveSlot and restoreSaveSlot round-trip state', function () {
  const prog = Engine.parseRenpyScript(CANONICAL_SOURCE);
  const rt = Engine.createStoryRuntime(prog);
  let ev = Engine.advanceStory(rt);
  while (ev.type !== 'menu') {
    ev = Engine.advanceStory(rt);
  }
  ev = Engine.chooseMenuOption(rt, 0);
  const saved = Engine.serializeSaveSlot(rt, { slot: 1 });
  assert.equal(saved.format, 'glass-meridian-save');

  const restored = Engine.restoreSaveSlot(prog, saved);
  assert.equal(restored.current.text, ev.text);
  assert.equal(restored.st.vars.trust_score, rt.st.vars.trust_score);
  assert.deepEqual(restored.choicesMade, rt.choicesMade);
});

test('Runtime: restoreSaveSlot rejects tampered or incompatible save objects', function () {
  const prog = Engine.parseRenpyScript(CANONICAL_SOURCE);
  assert.throws(function () {
    Engine.restoreSaveSlot(prog, { format: 'wrong', version: 1, checkpoints: [] });
  }, Engine.StoryError);
  assert.throws(function () {
    Engine.restoreSaveSlot(prog, {
      format: 'glass-meridian-save',
      version: 1,
      checkpoints: [{ pc: { label: 'nonexistent_label', ip: 0 } }]
    });
  }, Engine.StoryError);
});

/* ------------------------------------------------------------------ */
/* 4. Narrative Graph & Reachability Verifier                          */
/* ------------------------------------------------------------------ */

test('analyzeNarrativeGraph: canonical script passes with 0 errors and all 4 endings reachable', function () {
  const audit = Engine.auditScript(CANONICAL_SOURCE);
  assert.equal(audit.ok, true);
  assert.equal(audit.analysis.issues.length, 0);
  assert.equal(audit.analysis.unreachableLabels.length, 0);
  assert.equal(audit.analysis.deadEnds.length, 0);
  assert.equal(audit.analysis.loopsWithoutChoices.length, 0);
  assert.equal(audit.analysis.endings.length, 4);
  audit.analysis.endings.forEach(function (ending) {
    assert.equal(ending.reachable, true, 'Expected ending ' + ending.label + ' to be reachable');
    assert.ok(ending.choiceCount >= 4);
  });
});

test('analyzeNarrativeGraph: shortest choice paths replay deterministically to each ending', function () {
  const audit = Engine.auditScript(CANONICAL_SOURCE);
  audit.analysis.endings.forEach(function (ending) {
    const rt = Engine.createStoryRuntime(audit.program);
    let ev = Engine.advanceStory(rt);
    let stepIdx = 0;
    while (ev.type !== 'end') {
      if (ev.type === 'menu') {
        const step = ending.shortestChoices[stepIdx++];
        assert.ok(step, 'Missing choice step for ' + ending.label);
        ev = Engine.chooseMenuOption(rt, step.index);
      } else {
        ev = Engine.advanceStory(rt);
      }
    }
    assert.equal(ev.ending.label, ending.label);
    assert.equal(rt.st.persistent[ending.label], true);
  });
});

test('analyzeNarrativeGraph: detects unreachable labels', function () {
  const src = [
    'label start:',
    '    "Hello"',
    '    return',
    'label orphan_island:',
    '    "Nobody jumps here"',
    '    return'
  ].join('\n');
  const audit = Engine.auditScript(src);
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.analysis.unreachableLabels, ['orphan_island']);
  assert.ok(audit.analysis.issues.some(function (i) { return i.code === 'unreachable'; }));
});

test('analyzeNarrativeGraph: detects infinite loop without a choice', function () {
  const src = [
    'label start:',
    '    jump ping',
    'label ping:',
    '    "Ping"',
    '    jump pong',
    'label pong:',
    '    "Pong"',
    '    jump ping',
    'label ending_good:',
    '    "End"',
    '    return'
  ].join('\n');
  const audit = Engine.auditScript(src);
  assert.equal(audit.ok, false);
  assert.ok(audit.analysis.loopsWithoutChoices.length > 0);
  assert.ok(audit.analysis.issues.some(function (i) { return i.code === 'loop-without-choice'; }));
});

test('analyzeNarrativeGraph: detects locked ending and never-offered choice', function () {
  const src = [
    'default score = 0',
    'label start:',
    '    menu:',
    '        "Normal path":',
    '            jump ending_normal',
    '        "Impossible path" if score > 99:',
    '            jump ending_secret',
    'label ending_normal:',
    '    "Normal"',
    '    return',
    'label ending_secret:',
    '    "Secret"',
    '    return'
  ].join('\n');
  const audit = Engine.auditScript(src);
  assert.equal(audit.ok, false);
  assert.ok(audit.analysis.issues.some(function (i) { return i.code === 'ending-locked'; }));
  assert.ok(audit.analysis.issues.some(function (i) { return i.code === 'choice-never-offered'; }));
});

test('evaluateGuards: evaluates edge guard lists against live state', function () {
  assert.equal(Engine.evaluateGuards(['trust_score >= 2', 'lens_unlocked'], { trust_score: 3, lens_unlocked: true }, {}), true);
  assert.equal(Engine.evaluateGuards(['trust_score >= 2', 'lens_unlocked'], { trust_score: 1, lens_unlocked: true }, {}), false);
  assert.equal(Engine.evaluateGuards(['undefined_var > 0'], {}, {}), null);
});

test('layoutNarrativeGraph & helpers: computes positive geometry and trail edges', function () {
  const audit = Engine.auditScript(CANONICAL_SOURCE);
  const layout = Engine.layoutNarrativeGraph(audit.analysis);
  assert.ok(layout.width > 200);
  assert.ok(layout.height > 200);
  assert.equal(layout.nodes.length, audit.analysis.nodes.length);
  assert.equal(layout.edges.length, audit.analysis.edges.length);

  const taken = Engine.trailEdges(['start', 'scene1_arrival', 'scene1_tidelog']);
  assert.equal(taken['start>scene1_arrival'], true);
  assert.equal(taken['scene1_arrival>scene1_tidelog'], true);

  assert.equal(Engine.endingTitle('ending_meridian_restored'), 'Meridian Restored');
  assert.equal(Engine.isEndingLabel('ending_meridian_restored'), true);
  assert.equal(Engine.isEndingLabel('scene1_arrival'), false);
  assert.equal(Engine.sceneOfLabel('scene4_storm'), 4);
});
