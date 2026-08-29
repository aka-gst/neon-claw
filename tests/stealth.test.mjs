import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { createEnforcer, hearNoise, moodOf } from '../src/enemy.js';
import { STEP, TILE, NOISE, PLAYER } from '../src/tuning.js';
import { intent, FLAT } from './helpers.mjs';

/**
 * Стелс держится на двух обещаниях: крадущийся шаг беззвучен всегда, а шум
 * обходит углы всегда. Механика, которая иногда подводит, перестаёт быть
 * решением и становится лотереей — эти тесты и стерегут «всегда».
 */

// Стена между героем и стражем: видеть нельзя, слышать можно. Страж стоит
// достаточно близко, чтобы бег до стены оказался в пределах слышимости.
const CORNER = [
    '..........',
    '..........',
    '....#.....',
    '....#.....',
    'p...#.e...',
    '##########',
    '##########',
];

const play = (world, keys, seconds) => {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
        stepWorld(world, intent(keys), STEP);
        world.events.length = 0;
    }
};

test('крадущийся шаг беззвучен, а бег слышно', () => {
    const sneaking = createWorld(CORNER, 'mix');
    play(sneaking, { right: true, walk: true }, 1.2);
    assert.equal(moodOf(sneaking.enemies[0]), 'calm', 'страж услышал крадущегося');

    const running = createWorld(CORNER, 'mix');
    play(running, { right: true }, 1.2);
    assert.notEqual(moodOf(running.enemies[0]), 'calm', 'бег остался неуслышанным');
});

test('крадучись герой действительно медленнее — тишина имеет цену', () => {
    const fast = createWorld(FLAT, 'mix');
    play(fast, { right: true }, 1.2);
    const slow = createWorld(FLAT, 'mix');
    play(slow, { right: true, walk: true }, 1.2);

    const ran = fast.player.body.x;
    const crept = slow.player.body.x;
    assert.ok(crept < ran - TILE * 2, `шаг не медленнее бега: ${crept} против ${ran}`);
    assert.ok(crept > FLAT[5].indexOf('p') * TILE, 'крадущийся вовсе не двигается');
});

test('шум обходит угол: слышат из-за стены, но не видят', () => {
    const world = createWorld(CORNER, 'mix');
    const foe = world.enemies[0];
    foe.facing = -1;
    play(world, { right: true }, 1.0);

    assert.equal(foe.state, 'suspect', `страж должен идти на звук, а не гнаться (${foe.state})`);
    assert.ok(foe.suspect, 'нет цели проверки');
});

test('проверив шум, страж возвращается на маршрут', () => {
    const foe = createEnforcer({ x: 400, y: 200 });
    assert.equal(hearNoise(foe, 400, 200, 120), true, 'не услышал');
    assert.equal(foe.state, 'suspect');
    assert.equal(hearNoise(foe, 400, 200, 120), false, 'повторный шум считается новым переполохом');

    const world = createWorld(CORNER, 'mix');
    const guard = world.enemies[0];
    hearNoise(guard, guard.body.x + 20, guard.body.y, 200);
    play(world, { walk: true }, NOISE.investigate + 1);
    assert.equal(guard.state, 'patrol', 'страж застрял в проверке');
    assert.equal(guard.suspect, null);
});

test('звон о гарду слышно дальше любого шага', () => {
    assert.ok(NOISE.clang > NOISE.run * 2, 'провал в бою обязан стоить дороже бега');
    assert.ok(NOISE.takedown < NOISE.run, 'тихое снятие громче бега — значит не тихое');
    assert.equal(NOISE.walk, 0, 'крадущийся шаг обязан быть ровно беззвучным');
});

test('на бегу шум отмечается кругами, и они видны игроку', () => {
    const world = createWorld(CORNER, 'mix');
    play(world, { right: true }, 0.6);
    assert.ok(world.noises.length > 0, 'шум не показан вовсе');
    assert.ok(world.noises.every((n) => n.r > 0 && n.life > 0));
});
