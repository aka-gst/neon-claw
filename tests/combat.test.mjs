import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { hurtEnforcer, updateEnforcer } from '../src/enemy.js';
import { STEP, ENFORCER, TILE, BLADES } from '../src/tuning.js';
import { RULES } from '../src/combat.js';
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
        for (const e of world.enemies) updateEnforcer(e, world.level, world.player, STEP);
    }
};

test('первый удар проходит и поднимает гарду', () => {
    const world = arena();
    const foe = world.enemies[0];
    assert.equal(hurtEnforcer(foe, foe.body.x - 30), 'hit');
    assert.equal(foe.hp, RULES.enemy.hp - BLADES.damage);
    assert.equal(foe.state, 'guard');
});

test('удар в гарду не ранит и продлевает её — долбить кнопку строго хуже', () => {
    const world = arena();
    const foe = world.enemies[0];
    hurtEnforcer(foe, foe.body.x - 30);

    tick(world, 0.4);
    const left = foe.t;
    assert.ok(left < ENFORCER.guard, 'гарда не тикает');

    assert.equal(hurtEnforcer(foe, foe.body.x - 30), 'blocked');
    assert.equal(foe.hp, RULES.enemy.hp - BLADES.damage, 'блок пропустил урон');
    assert.ok(foe.t > left, 'блок не продлился от удара');
});

test('после гарды открывается окно: выждавший бьёт дважды', () => {
    const world = arena();
    const foe = world.enemies[0];
    hurtEnforcer(foe, foe.body.x - 30);
    assert.equal(foe.hp, RULES.enemy.hp - BLADES.damage);

    // Плюс кадры замирания от самого попадания — они тоже идут в счёт.
    tick(world, ENFORCER.guard + 0.2);
    assert.notEqual(foe.state, 'guard', 'гарда не опустилась сама');
    assert.ok(foe.guardReady > 0, 'страж готов закрыться снова сразу же');

    assert.equal(hurtEnforcer(foe, foe.body.x - 30), 'hit',
        'в открытом окне удар не прошёл');
    assert.equal(hurtEnforcer(foe, foe.body.x - 30), 'dead',
        'третий удар подряд не добил');
});

test('страж не уходит патрулировать в пропасть', () => {
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
    assert.ok(foe.body.y < 5 * TILE, 'страж свалился с площадки');
    assert.ok(Math.abs(foe.body.x - startX) < TILE * 6, 'страж убежал с уровня');
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
