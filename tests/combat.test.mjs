import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { hurtCorsair, updateCorsair } from '../src/enemy.js';
import { STEP, CORSAIR, TILE } from '../src/tuning.js';
import { intent } from './helpers.mjs';

const ARENA = [
    '..........',
    '..........',
    '..........',
    'p....e....',
    '##########',
    '##########',
];

const arena = () => createWorld(ARENA);

const tick = (world, seconds) => {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
        for (const e of world.enemies) updateCorsair(e, world.level, world.player, STEP);
    }
};

test('первый удар проходит и поднимает гарду', () => {
    const world = arena();
    const foe = world.enemies[0];
    assert.equal(hurtCorsair(foe, foe.body.x - 30), 'hit');
    assert.equal(foe.hp, CORSAIR.hp - 1);
    assert.equal(foe.state, 'guard');
});

test('удар в гарду не ранит и продлевает её — долбить кнопку строго хуже', () => {
    const world = arena();
    const foe = world.enemies[0];
    hurtCorsair(foe, foe.body.x - 30);

    tick(world, 0.4);
    const left = foe.t;
    assert.ok(left < CORSAIR.guard, 'гарда не тикает');

    assert.equal(hurtCorsair(foe, foe.body.x - 30), 'blocked');
    assert.equal(foe.hp, CORSAIR.hp - 1, 'блок пропустил урон');
    assert.ok(foe.t > left, 'блок не продлился от удара');
});

test('после гарды открывается окно: выждавший успевает ударить дважды', () => {
    const world = arena();
    const foe = world.enemies[0];
    hurtCorsair(foe, foe.body.x - 30);

    // Плюс кадры замирания от самого попадания — они тоже идут в счёт.
    tick(world, CORSAIR.guard + 0.2);
    assert.notEqual(foe.state, 'guard', 'гарда не опустилась сама');
    assert.ok(foe.guardReady > 0, 'корсар готов закрыться снова сразу же');

    assert.equal(hurtCorsair(foe, foe.body.x - 30), 'hit');
    assert.equal(foe.state, 'chase', 'в открытом окне он всё равно закрылся');
    assert.equal(hurtCorsair(foe, foe.body.x - 30), 'dead');
    assert.equal(foe.hp, 0);
});

test('корсар не уходит патрулировать в пропасть', () => {
    const world = createWorld([
        '..........',
        '..........',
        '...e......',
        '#####.....',
        '#####.....',
    ]);
    const foe = world.enemies[0];
    const startX = foe.body.x;
    tick(world, 4);
    assert.ok(foe.body.y < 5 * TILE, 'корсар свалился с площадки');
    assert.ok(Math.abs(foe.body.x - startX) < TILE * 6, 'корсар убежал с уровня');
});

test('полный уровень выдерживает две минуты беспорядочного ввода', () => {
    const world = createWorld();
    let seed = 7;
    const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };

    for (let i = 0; i < Math.round(120 / STEP); i += 1) {
        stepWorld(world, intent({
            right: random() > 0.35,
            left: random() > 0.85,
            down: random() > 0.93,
            jumpHeld: random() > 0.6,
            jumpDown: random() > 0.94,
            attackDown: random() > 0.9,
        }), STEP);
        world.events.length = 0;
        if (world.phase !== 'play') break;
    }

    const p = world.player.body;
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'герой улетел в NaN');
    assert.ok(p.x >= 0 && p.x <= world.level.width * TILE, 'герой вышел за карту');
    assert.ok(['play', 'won', 'lost'].includes(world.phase));
});
