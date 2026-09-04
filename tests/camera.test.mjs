/**
 * Постановка кадра. Оператор ставит героя на место присваиванием, а камера
 * обычно догоняет плавно — и, снятая сразу, отдаёт кадр, где фигуры срезаны
 * по головам. Картинка при этом выглядит правдоподобной, просто не там,
 * и догадаться, что виновата камера, а не сцена, трудно.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { createCamera, snapCamera, updateCamera } from '../src/camera.js';
import { MAP as DOCKS } from '../src/level.js';
import { VIEW, STEP } from '../src/tuning.js';
import { intent } from './helpers.mjs';

test('снимок камеры ставит героя в середину кадра сразу, без доводки', () => {
    const world = createWorld(DOCKS);
    const camera = createCamera(world);
    const foe = world.enemies[0];
    // так ставит сцену оператор: герой оказывается на месте одним присваиванием
    world.player.body.x = foe.body.x - 24;
    world.player.body.y = foe.body.y;

    snapCamera(camera, world);
    const x = world.player.body.x - camera.x;
    const y = world.player.body.y - camera.y;

    assert.ok(x > VIEW.w * 0.2 && x < VIEW.w * 0.8, `герой по горизонтали на ${Math.round(x)} из ${VIEW.w}`);
    assert.ok(y > 40 && y < VIEW.h, `герой по вертикали на ${Math.round(y)} — голова за кромкой`);
});

test('снимок не отыгрывается назад на следующем шаге', () => {
    // Двигать надо обе пары полей: `cx`/`cy` — куда камера едет, `x`/`y` —
    // откуда рисуют. Поправишь одну — следующий шаг вернёт сглаженную.
    const world = createWorld(DOCKS);
    const camera = createCamera(world);
    world.player.body.x = world.enemies[0].body.x - 24;
    world.player.body.y = world.enemies[0].body.y;

    const снято = snapCamera(camera, world);
    updateCamera(camera, world, STEP);

    assert.ok(Math.abs(camera.x - снято.x) < 12, `камера уехала на ${Math.round(camera.x - снято.x)} за один шаг`);
    assert.ok(Math.abs(camera.y - снято.y) < 12, `камера уехала по вертикали на ${Math.round(camera.y - снято.y)}`);
});

test('снимок держится всю петлю, а не один кадр', () => {
    // Оператор снял единичный кадр, решил, что задача решена, и получил
    // петлю, в финале которой не было ни героя, ни стража — только фон и
    // подпись: камера всю дорогу ехала к своей цели и увезла бой за окно.
    // Поэтому проверяем не первый шаг, а всю длину съёмки.
    const world = createWorld(DOCKS);
    const camera = createCamera(world);
    const p = world.player;
    const foe = world.enemies[0];
    const держать = () => { p.body.x = foe.body.x - 24; p.body.y = foe.body.y; p.invuln = 99; };

    держать();
    snapCamera(camera, world);

    let ушло = 0;
    for (let i = 0; i < 240; i += 1) {
        держать();
        stepWorld(world, intent({}), STEP);
        updateCamera(camera, world, STEP);
        const x = p.body.x - camera.x;
        const y = p.body.y - camera.y;
        if (x < 20 || x > VIEW.w - 20 || y < 40 || y > VIEW.h) ушло += 1;
    }
    assert.equal(ушло, 0, `герой уходил за края кадра ${ушло} шагов из 240`);
});
