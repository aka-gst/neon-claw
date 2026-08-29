import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { LEVELS } from '../src/levels.js';
import { STEP, TILE, LIGHT, ENFORCER, BOW } from '../src/tuning.js';
import { intent } from './helpers.mjs';

/**
 * Свет — третья ось стелса после зрения и слуха, и единственная, которую
 * можно менять самому: фонарь гасится стрелой. Тесты держат три обещания.
 *
 * Тьма реально прячет: в ней стража подпускают заметно ближе.
 * Стены свет держат — в отличие от шума, и на этом стоит вся разница
 * между укрытием от взгляда и укрытием от слуха.
 * Погашенный фонарь возвращается: тьма занимается, а не выдаётся.
 */

const LAMPS = [
    '..............',
    '..............',
    '..............',
    'p....l.......e',
    '##############',
    '##############',
];

const WALL = [
    '..............',
    '..............',
    '.....#........',
    'p....#l......e',
    '##############',
    '##############',
];

const play = (w, keys, seconds) => {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
        stepWorld(w, intent(keys), STEP);
        w.events.length = 0;
    }
};

test('под фонарём светло, в стороне темно', () => {
    const w = createWorld(LAMPS);
    const lamp = w.lights[0];

    w.player.body.x = lamp.x;
    play(w, {}, 0.05);
    assert.ok(w.player.lit > 0.8, `под фонарём освещённость ${w.player.lit.toFixed(2)}`);

    w.player.body.x = lamp.x + LIGHT.radius + TILE;
    play(w, {}, 0.05);
    assert.equal(w.player.lit, 0, 'за краем пятна всё ещё светло');
});

test('стены держат свет — в отличие от шума', () => {
    const w = createWorld(WALL);
    const lamp = w.lights[0];
    // Герой в двух тайлах от фонаря, но за стеной.
    w.player.body.x = lamp.x - TILE * 2;
    play(w, {}, 0.05);
    assert.equal(w.player.lit, 0, 'свет прошёл сквозь стену');
});

test('в темноте стража подпускают заметно ближе', () => {
    const lit = createWorld(LAMPS);
    const foe = lit.enemies[0];
    foe.facing = -1;
    lit.player.body.x = lit.lights[0].x;
    // Ставим стража на дальности, которая работает только при свете.
    foe.body.x = lit.player.body.x + ENFORCER.sight * 0.75;
    play(lit, {}, 0.2);
    assert.notEqual(foe.state, 'patrol', 'под фонарём страж не заметил героя');

    const dark = createWorld(LAMPS);
    const hidden = dark.enemies[0];
    hidden.facing = -1;
    // Гасить надо вместе с отсчётом: фонарь без таймера зажигается сам,
    // и это правильно — тьма занимается, а не выдаётся навсегда.
    dark.lights[0].on = false;
    dark.lights[0].out = LIGHT.relight;
    dark.player.body.x = dark.lights[0].x;
    hidden.body.x = dark.player.body.x + ENFORCER.sight * 0.75;
    play(dark, {}, 0.2);
    assert.equal(hidden.state, 'patrol', 'в темноте страж заметил с той же дальности');
});

test('стрела гасит фонарь, и он возвращается сам', () => {
    const w = createWorld(LAMPS);
    w.enemies.length = 0;
    const lamp = w.lights[0];
    w.player.body.x = lamp.x - TILE * 4;

    play(w, { bowHeld: true, aimX: 1, aimY: -0.08 }, BOW.drawTime);
    play(w, { aimX: 1, aimY: -0.08 }, 0.6);

    assert.equal(lamp.on, false, `фонарь не погас (стрел ${w.player.bow.arrows}, воткнулось ${w.stuck.length})`);
    assert.ok(lamp.out > 0, 'нет отсчёта до возвращения');

    play(w, {}, LIGHT.relight + 0.2);
    assert.equal(lamp.on, true, 'фонарь не вернулся — тьма стала бесплатной навсегда');
});

test('откат к чекпоинту зажигает всё обратно', () => {
    const w = createWorld();
    w.lights.forEach((l) => { l.on = false; l.out = LIGHT.relight; });
    w.player.hp = 0;
    play(w, {}, 1);
    assert.ok(w.lights.every((l) => l.on), 'после отката фонари остались потушенными');
});

test('в уровнях есть свет и есть тьма', () => {
    for (const [id, level] of Object.entries(LEVELS)) {
        const w = createWorld(level.rows);
        assert.ok(w.lights.length >= 2, `${id}: фонарей ${w.lights.length} — света слишком мало`);
        // И тьма: пятна не должны покрывать всю землю.
        const span = w.lights.length * LIGHT.radius * 2;
        assert.ok(span < w.level.width * TILE * 0.75,
            `${id}: свет покрывает почти весь уровень, прятаться негде`);
    }
});
