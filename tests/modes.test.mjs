import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { createEnforcer, hurtEnforcer } from '../src/enemy.js';
import { RULES, strikeKind, isOpen } from '../src/combat.js';
import { STEP, TILE } from '../src/tuning.js';
import { intent } from './helpers.mjs';

/**
 * Правила боя должны быть однозначны: что считается заходом со спины, что
 * делает парирование, чем смерть отличается от конца забега. Набор один —
 * тот, что выиграл сравнение четырёх; остальные остались в истории.
 */

const ARENA = [
    '..........',
    '..........',
    '..........',
    'p....e....',
    '##########',
    '##########',
];

const swing = (world, seconds = 0.3) => {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
        stepWorld(world, intent({ attackDown: i === 0 }), STEP);
        world.events.length = 0;
    }
};

test('заход со спины и сверху различаются, лобовой — нет', () => {
    const foe = createEnforcer({ x: 200, y: 100 });
    foe.facing = -1;
    const behind = { facing: -1, body: { x: 230, y: 100, onGround: true } };
    const ahead = { facing: 1, body: { x: 170, y: 100, onGround: true } };
    const over = { facing: 1, body: { x: 195, y: 100 - 30 * 0.8, onGround: false } };

    assert.equal(strikeKind(behind, foe), 'back');
    assert.equal(strikeKind(ahead, foe), 'front');
    assert.equal(strikeKind(over, foe), 'above');
});

test('снятие не спрашивает ни здоровья, ни гарды', () => {
    const foe = createEnforcer({ x: 200, y: 100 }, 0, { hp: 3 });
    foe.state = 'guard';
    assert.equal(hurtEnforcer(foe, 180, { takedown: true }), 'takedown');
    assert.equal(foe.state, 'dead');
});

test('парирование пропускает удар только в раскрытого стража', () => {
    const closed = createEnforcer({ x: 200, y: 100 }, 0, { hp: 1 });
    assert.equal(hurtEnforcer(closed, 180, { parry: true }), 'blocked');
    assert.equal(closed.hp, 1, 'парирование пропустило урон');

    const open = createEnforcer({ x: 200, y: 100 }, 0, { hp: 1 });
    open.state = 'windup';
    assert.ok(isOpen(open));
    assert.equal(hurtEnforcer(open, 180, { parry: true }), 'dead');
});

test('спиной страж не видит — иначе зайти сзади невозможно в принципе', () => {
    const world = createWorld(ARENA);
    const foe = world.enemies[0];
    foe.facing = -1;
    const p = world.player;
    p.body.x = foe.body.x + 30;
    p.body.y = foe.body.y;
    p.facing = -1;

    swing(world, 0.3);
    assert.equal(foe.state, 'dead', `страж пережил заход со спины (${foe.state})`);
    assert.equal(world.takedowns, 1);
});

test('смерть откатывает к чекпоинту, а не заканчивает игру', () => {
    const world = createWorld();
    const p = world.player;
    const start = { ...world.checkpoint };

    p.hp = 0;
    stepWorld(world, intent(), STEP);
    assert.equal(world.phase, 'play', 'смерть объявила конец игры');
    assert.ok(world.freeze > 0, 'нет паузы перед откатом');

    for (let i = 0; i < Math.round(0.6 / STEP); i += 1) stepWorld(world, intent(), STEP);
    assert.equal(world.attempts, 2);
    assert.equal(p.hp, RULES.player.hp);
    assert.equal(p.body.x, start.x);
    assert.ok(world.enemies.every((e) => e.state !== 'dead'), 'стражи не поднялись');
});

test('чекпоинты берутся по пути и только вперёд', () => {
    const world = createWorld();
    const first = world.level.checkpoints[1];
    world.player.body.x = first.x;
    world.player.body.y = first.y;
    stepWorld(world, intent(), STEP);
    assert.equal(world.checkpoint.x, first.x, 'чекпоинт не взялся');
    assert.equal(world.reached.size, 1);

    stepWorld(world, intent(), STEP);
    assert.equal(world.reached.size, 1, 'чекпоинт взялся повторно');
});
