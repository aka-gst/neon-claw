import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { TILE, STEP } from '../src/tuning.js';
import { intent } from './helpers.mjs';
import { MAP as DOCKS, footingAt } from '../src/level.js';

/**
 * Уровень должен проходиться. Тесты ниже — не про красоту, а про то, что
 * каждый задуманный шаг вертикали физически выполним: ровно эти шесть
 * прыжков и составляют маршрут, и любой из них ломается от правки одной
 * константы в `tuning.js`.
 */

function hop(from, keys, seconds) {
    const world = createWorld();
    // Стражи здесь не при чём — проверяется геометрия.
    world.enemies.length = 0;
    const p = world.player;
    p.body.x = from.x;
    p.body.y = from.y;
    p.facing = keys.right ? 1 : -1;

    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i += 1) {
        stepWorld(world, intent({ ...keys, jumpDown: Boolean(keys.jumpDown) && i === 0 }), STEP);
        world.events.length = 0;
    }
    return p;
}

const at = (col, row) => ({ x: col * TILE + 12, y: row * TILE });
const JUMP = { jumpDown: true, jumpHeld: true };

test('пол → первый уступ берётся обычным прыжком', () => {
    const p = hop(at(45, 26), { right: true, ...JUMP }, 0.9);
    assert.equal(p.body.y, 24 * TILE, 'не встал на уступ');
    assert.equal(p.state, 'move');
});

test('шахта проходится зацепами: три тайла вверх на каждом шаге', () => {
    const climbs = [
        ['уступ 1 → 2', at(49, 24), { right: true, ...JUMP }, 21],
        ['уступ 2 → 3', { x: 50 * TILE + 6, y: 21 * TILE }, { left: true, ...JUMP }, 18],
        ['уступ 3 → 4', { x: 48 * TILE + 18, y: 18 * TILE }, { right: true, ...JUMP }, 15],
        ['уступ 4 → тайник', { x: 50 * TILE + 8, y: 15 * TILE }, { left: true, ...JUMP }, 12],
    ];
    for (const [name, from, keys, lipRow] of climbs) {
        const p = hop(from, keys, 0.9);
        assert.equal(p.state, 'hang', `${name}: не поймал кромку`);
        assert.equal(p.ledge.row, lipRow, `${name}: поймал не ту кромку`);
    }
});

test('с четвёртого уступа мостик выводит на арену', () => {
    const p = hop({ x: 52 * TILE, y: 15 * TILE }, { right: true }, 2.4);
    assert.ok(p.body.x > 56 * TILE, 'не дошёл до мостика');
    assert.equal(p.state, 'move');
});

test('стена перед шахтой не обходится по земле — только через верх', () => {
    const p = hop(at(50, 26), { right: true }, 3);
    assert.ok(p.body.x < 54 * TILE, 'барьер пропустил героя понизу');
});

/**
 * Дорога до первого стража. Соседняя сессия сообщила, что герой до него не
 * доходит: слепой прогон вправо терял три жизни из пяти и застревал. Замер
 * показал две разные вещи, и только одна из них была поломкой.
 */

/** Опора под точкой — общей функцией игры, а не самодельной проверкой. */
const твёрдо = (world, x, y) => footingAt(world.level, x, y);

test('точка возврата не встаёт на край ямы — иначе падение роняет обратно', () => {
    const world = createWorld(DOCKS);
    const p = world.player;
    // Гоним вправо, пока не свалимся, и смотрим, КУДА возвращает.
    for (let i = 0; i < 400 && p.hp > 3; i += 1) {
        stepWorld(world, intent({ right: true }), STEP);
    }
    assert.ok(p.hp < 5, 'слепой ход вправо почему-то не привёл к падению');

    const s = world.lastSafe;
    assert.ok(твёрдо(world, s.x - TILE * 0.6, s.y + 2) && твёрдо(world, s.x + TILE * 0.6, s.y + 2),
        `возврат на ${(s.x / TILE).toFixed(1)} тайла — там нет опоры с обеих сторон`);
});

test('умеющий прыгать доходит до первого стража целым', () => {
    const world = createWorld(DOCKS);
    const p = world.player;
    // Простейшая игровая грамотность: впереди нет земли — прыгай.
    let прыжков = 0;
    for (let i = 0; i < 3000; i += 1) {
        const дыра = p.body.onGround && !твёрдо(world, p.body.x + 18, p.body.y + 2);
        if (дыра) прыжков += 1;
        stepWorld(world, intent({ right: true, jumpDown: дыра, jumpHeld: true }), STEP);
        const рядом = world.enemies.find((e) => Math.abs(e.body.x - p.body.x) < 40);
        if (рядом) {
            assert.equal(p.hp, 5, `дошёл, но потерял ${5 - p.hp} жизни по дороге`);
            assert.ok(прыжков <= 6, `понадобилось ${прыжков} прыжков — путь не читается`);
            return;
        }
    }
    assert.fail(`не дошёл до стража: застрял на ${(p.body.x / TILE).toFixed(1)} тайла, hp ${p.hp}`);
});
