import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { MAP as DOCKS } from '../src/level.js';
import { STEP, SWORD } from '../src/tuning.js';
import { sceneFromSearch, stageImpact } from '../src/showcase.js';

test('адрес сцены включает только известный съёмочный режим', () => {
    assert.equal(sceneFromSearch('?scene=impact'), 'impact');
    assert.equal(sceneFromSearch('?scene=other'), null);
    assert.equal(sceneFromSearch(''), null);
});

test('сцена удара ставит настоящий момент попадания, а не рисует декорацию', () => {
    const world = createWorld(DOCKS);
    const scene = stageImpact(world, (intent) => stepWorld(world, intent, STEP));

    assert.equal(scene.name, 'impact');
    assert.ok(scene.events.includes('hit'), `сцена не попала: ${scene.events.join(', ')}`);
    assert.equal(world.player.hitstop, SWORD.hitstop, 'сцена поймала не сам стоп-кадр удара');
    assert.ok(world.sparks.length >= 16, `для кадра слишком мало искр: ${world.sparks.length}`);
    assert.ok(world.rings.length >= 1, 'в кадре нет кольца точки контакта');
});

test('сцена удара удерживает момент достаточно долго для съёмки', () => {
    const world = createWorld(DOCKS);
    stageImpact(world, (intent) => stepWorld(world, intent, STEP));
    const before = world.sparks.map(({ x, y, life }) => ({ x, y, life }));

    for (let i = 0; i < 10; i += 1) stepWorld(world, {}, STEP);

    assert.ok(world.player.hitstop > 0, 'момент исчез раньше 85 мс');
    assert.deepEqual(world.sparks.map(({ x, y, life }) => ({ x, y, life })), before,
        'искры уехали, пока сцена должна была держать удар');
});
