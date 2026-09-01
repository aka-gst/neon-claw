import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { parseLevel } from '../src/level.js';
import { createPlayer, updatePlayer } from '../src/player.js';
import { STEP, TILE, ENFORCER, WALL, PLAYER, LOOP } from '../src/tuning.js';
import { intent } from './helpers.mjs';

/**
 * Замечания, найденные живой игрой. Каждый тест здесь — чужой отзыв,
 * переведённый в правило, чтобы правка не отъехала обратно через месяц.
 */

const FLOOR = [
    '..............',
    '..............',
    '..............',
    'p...e.e.......',
    '##############',
    '##############',
];

// Мостик над полом: два этажа, между ними решётка.
const FLOORS = [
    '..............',
    '..............',
    'p.............',
    '==============',
    '..............',
    '....e.........',
    '##############',
];

const play = (w, keys, seconds) => {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
        stepWorld(w, intent(keys), STEP);
        w.events.length = 0;
    }
};

test('стражи расталкиваются, а не сливаются в одну кучу', () => {
    const w = createWorld(FLOOR);
    const [a, b] = w.enemies;
    b.body.x = a.body.x;
    b.body.y = a.body.y;

    play(w, {}, 0.6);
    const gap = Math.abs(a.body.x - b.body.x);
    assert.ok(gap > ENFORCER.w, `стражи стоят в ${gap.toFixed(0)} пикселях — это один силуэт`);
});

test('разворот занимает время: за спину можно успеть', () => {
    const w = createWorld(FLOOR);
    const foe = w.enemies[0];
    foe.facing = 1;
    foe.state = 'chase';
    foe.alert = 2;
    w.player.body.x = foe.body.x - 40;
    w.player.body.y = foe.body.y;

    play(w, {}, ENFORCER.turnTime * 0.5);
    assert.equal(foe.facing, 1, 'страж развернулся мгновенно — перекат за спину бесполезен');

    play(w, {}, ENFORCER.turnTime);
    assert.equal(foe.facing, -1, 'страж так и не развернулся');
});

test('этажи разделены: сверху не видят, снизу тоже', () => {
    const w = createWorld(FLOORS);
    const foe = w.enemies[0];
    // Герой наверху, страж внизу, между ними помост.
    play(w, {}, 0.5);
    assert.equal(foe.state, 'patrol',
        `страж увидел героя через этаж (${foe.state})`);
});

test('по одной стене вверх не залезть', () => {
    // Одна стена справа, пола под ней нет — только она.
    const level = parseLevel([
        '.....#....',
        '.....#....',
        '.....#....',
        '.....#....',
        '.....#....',
        '.....#....',
        'p....#....',
        '##########',
    ]);
    const player = createPlayer(level.spawn);
    const start = player.body.y;

    // Честно пытаемся лезть: жмём к стене и прыгаем при каждом касании.
    let best = start;
    for (let i = 0; i < Math.round(4 / STEP); i += 1) {
        const keys = { right: true, jumpHeld: true };
        if (player.state === 'wall') keys.jumpDown = true;
        else if (i === 0) keys.jumpDown = true;
        updatePlayer(player, level, intent(keys), STEP);
        best = Math.min(best, player.body.y);
    }
    const climbed = (start - best) / TILE;
    assert.ok(climbed < 4,
        `по одной стене поднялись на ${climbed.toFixed(1)} тайла — ширина шахты перестала значить что-либо`);
});

test('зигзаг между двух стен по-прежнему работает', () => {
    const rows = [];
    for (let r = 0; r < 20; r += 1) rows.push('#...#');
    rows[19] = '#p..#';
    rows.push('#####');
    const level = parseLevel(rows);
    const player = createPlayer(level.spawn);
    const start = player.body.y;

    let dir = 1;
    let best = start;
    for (let i = 0; i < Math.round(5 / STEP); i += 1) {
        const keys = { jumpHeld: true, right: dir > 0, left: dir < 0 };
        if (player.state === 'wall') { keys.jumpDown = true; dir = -player.wall; }
        else if (i === 0) keys.jumpDown = true;
        updatePlayer(player, level, intent(keys), STEP);
        best = Math.min(best, player.body.y);
    }
    assert.ok((start - best) / TILE > 8,
        `зигзаг поднял всего на ${((start - best) / TILE).toFixed(1)} тайла`);
});

test('игра не уходит в замедление на телефоне: порог догона выше 20 кадров', () => {
    // Ниже этого порога игровое время отстаёт от настоящего, и догона нет.
    // Это не косметика: враг не доходит, таймер не истекает, а автомат снимает
    // с этого числа и выдаёт их за свойства игры.
    const порог = 1 / (LOOP.maxSteps * STEP);
    assert.ok(порог <= 20,
        `замедление начинается с ${порог.toFixed(0)} к/с — телефон под нагрузкой туда попадает`);
    // Ограничитель нужен: без него свёрнутая вкладка отмотала бы весь простой.
    assert.ok(LOOP.maxSteps * STEP <= LOOP.maxElapsed,
        'ограничитель не ограничивает — после паузы мир отмотает всё разом');
});
