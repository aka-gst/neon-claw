/**
 * Спина стража. До 6 сентября `sees()` не учитывала направление взгляда
 * вовсе: замечали с любой стороны в радиусе двухсот пикселей, снятия со
 * спины не существовало как механики, а счётчик «тихих снятий» на экране
 * победы всегда показывал ноль.
 *
 * Проверяется исход, а не намерение: не «есть ли в коде проверка стороны»,
 * а замечает ли страж и засчитывается ли снятие.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { isAware } from '../src/enemy.js';
import { MAP as DOCKS } from '../src/level.js';
import { STEP, ENFORCER, SWORD } from '../src/tuning.js';
import { intent } from './helpers.mjs';

/** Ставит игрока в `d` пикселей от стража и ждёт, заметит ли тот. */
const постоять = (d, кудаСмотрит, idx = 2) => {
    const world = createWorld(DOCKS);
    const foe = world.enemies[idx];
    foe.state = 'patrol';
    foe.alert = 0;
    foe.facing = кудаСмотрит;
    foe.body.vx = 0;
    world.player.body.x = foe.body.x + d;
    world.player.body.y = foe.body.y;
    world.player.body.onGround = true;
    for (let i = 0; i < 30; i += 1) stepWorld(world, intent(), STEP);
    return isAware(foe);
};

test('спереди страж видит далеко — иначе бой перестанет начинаться', () => {
    for (const d of [-190, -120, -60, -30]) {
        assert.ok(постоять(d, -1), `не заметил в лицо с ${Math.abs(d)} пикселей`);
    }
});

test('со спины не видит дальше вытянутой руки', () => {
    for (const d of [-60, -30, -16]) {
        assert.ok(!постоять(d, 1), `заметил со спины с ${Math.abs(d)} пикселей`);
    }
    assert.ok(постоять(-10, 1), 'вплотную сзади всё-таки должен замечать — это касание');
});

test('между слепой зоной и клинком есть окно, иначе снятие невозможно', () => {
    // Ширина окна и есть механика: подойти ближе `blind` нельзя — заметит,
    // дальше `reach` нельзя — не достанешь.
    assert.ok(ENFORCER.blind < SWORD.reach - 8,
        `окно ${SWORD.reach - ENFORCER.blind} пикселей — в него не попасть`);
});

test('удар со спины засчитывается тихим снятием', () => {
    const world = createWorld(DOCKS);
    const p = world.player;
    const foe = world.enemies[2];
    foe.hp = 4;
    foe.state = 'patrol';
    foe.alert = 0;
    foe.facing = 1;          // смотрит прочь
    foe.body.vx = 0;
    p.blade = 'frost';
    p.body.x = foe.body.x - 150;
    p.body.y = foe.body.y;
    p.body.onGround = true;

    let шагов = 0;
    while (p.body.x < foe.body.x - 24 && шагов < 300) {
        stepWorld(world, intent({ right: true }), STEP);
        шагов += 1;
    }
    assert.ok(!isAware(foe), 'страж заметил подход со спины — снятия не будет');

    for (let i = 0; i < 90; i += 1) {
        stepWorld(world, intent({ attackDown: i === 0 }), STEP);
        if (foe.state === 'dead') break;
        world.events.length = 0;
    }
    assert.equal(foe.state, 'dead', 'страж не убит');
    assert.ok(world.takedowns > 0, 'снятие со спины не засчиталось');
});

test('удар в лицо снятием НЕ считается', () => {
    // Без этого проверка выше зеленела бы на счётчике, который растёт всегда.
    const world = createWorld(DOCKS);
    const p = world.player;
    const foe = world.enemies[2];
    foe.hp = 4;
    foe.facing = -1;         // смотрит на игрока
    foe.body.vx = 0;
    p.blade = 'frost';
    p.body.x = foe.body.x - 24;
    p.body.y = foe.body.y;
    p.body.onGround = true;
    p.facing = 1;

    for (let i = 0; i < 90; i += 1) {
        stepWorld(world, intent({ attackDown: i === 0 }), STEP);
        if (foe.state === 'dead') break;
        world.events.length = 0;
    }
    assert.equal(foe.state, 'dead', 'страж не убит');
    assert.equal(world.takedowns, 0, 'удар в лицо зря засчитан снятием');
});
