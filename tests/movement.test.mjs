import test from 'node:test';
import assert from 'node:assert/strict';

import { parseLevel } from '../src/level.js';
import { createPlayer, updatePlayer } from '../src/player.js';
import { findLedge } from '../src/physics.js';
import { TILE, STEP, PLAYER, LEDGE } from '../src/tuning.js';
import { intent, FLAT } from './helpers.mjs';

const flat = () => {
    const level = parseLevel(FLAT);
    return { level, player: createPlayer(level.spawn) };
};

const run = (level, player, keys, seconds) => {
    const steps = Math.round(seconds / STEP);
    let apex = player.body.y;
    for (let i = 0; i < steps; i += 1) {
        updatePlayer(player, level, typeof keys === 'function' ? keys(i * STEP) : keys, STEP);
        apex = Math.min(apex, player.body.y);
    }
    return apex;
};

test('прыжок берёт два тайла и не берёт три — на этом держится вертикаль уровня', () => {
    const { level, player } = flat();
    const start = player.body.y;
    const apex = run(level, player, intent({ jumpHeld: true, jumpDown: true }), 1.2);
    const height = start - apex;

    assert.ok(height > TILE * 2 + 12, `прыжок ниже двух тайлов с запасом: ${height.toFixed(1)}`);
    assert.ok(height < TILE * 3, `прыжок достаёт до трёх тайлов: ${height.toFixed(1)}`);
});

test('отпущенная кнопка обрезает прыжок — высота остаётся выбором', () => {
    const { level, player } = flat();
    const start = player.body.y;
    const short = run(level, player, (t) => intent({ jumpDown: t === 0, jumpHeld: t < 0.06 }), 1.2);

    const full = flat();
    const tall = run(full.level, full.player, intent({ jumpHeld: true, jumpDown: true }), 1.2);

    assert.ok(start - short < (start - tall) * 0.75, 'короткий прыжок почти равен длинному');
    assert.ok(start - short > TILE * 0.6, 'короткий прыжок вообще не отрывает от земли');
});

test('койот-тайм: шаг в пропасть ещё можно превратить в прыжок', () => {
    const level = parseLevel([
        '..........',
        '..........',
        '..........',
        '..........',
        'p.........',
        '#####.....',
        '#####.....',
    ]);
    const player = createPlayer(level.spawn);

    // Бежим до края и сходим с него, не нажимая прыжок.
    let left = 0;
    while (player.body.onGround || left === 0) {
        updatePlayer(player, level, intent({ right: true }), STEP);
        left += STEP;
        if (left > 2) break;
    }
    assert.equal(player.body.onGround, false, 'герой не дошёл до обрыва');

    // Ждём почти всё окно и только потом жмём — так и промахивается живой игрок.
    const wait = PLAYER.coyote * 0.6;
    for (let i = 0; i < Math.round(wait / STEP); i += 1) {
        updatePlayer(player, level, intent({ right: true }), STEP);
    }
    assert.ok(player.coyote > 0, 'окно койот-тайма закрылось раньше срока');

    updatePlayer(player, level, intent({ right: true, jumpDown: true, jumpHeld: true }), STEP);
    assert.ok(player.body.vy < -PLAYER.jump * 0.9, 'прыжок в койот-окне не сработал');
});

test('буфер прыжка: нажатие перед самой землёй не теряется', () => {
    const { level, player } = flat();
    player.body.y -= 40;
    player.body.vy = 300;
    // Жмём прыжок в воздухе — до земли ещё есть время, но меньше буфера.
    updatePlayer(player, level, intent({ jumpDown: true, jumpHeld: true }), STEP);
    assert.ok(player.buffer > 0, 'нажатие не запомнилось');

    let jumped = false;
    for (let i = 0; i < Math.round(0.2 / STEP); i += 1) {
        updatePlayer(player, level, intent({ jumpHeld: true }), STEP);
        if (player.body.vy < -100) jumped = true;
    }
    assert.ok(jumped, 'буфер не выстрелил при касании земли');
});

test('карниз ловится там, куда прыжок уже не достаёт', () => {
    // Стена высотой в три тайла над полом: запрыгнуть нельзя, зацепиться можно.
    const level = parseLevel([
        '..........',
        '..........',
        '..........',
        '.....#####',
        '.....#####',
        'p....#####',
        '##########',
    ]);
    const player = createPlayer(level.spawn);

    let grabbed = false;
    for (let i = 0; i < Math.round(3 / STEP); i += 1) {
        const t = i * STEP;
        updatePlayer(player, level, intent({
            right: true,
            jumpDown: t > 0.35 && t < 0.35 + STEP * 1.5,
            jumpHeld: t > 0.35 && t < 0.7,
        }), STEP);
        if (player.state === 'hang') { grabbed = true; break; }
    }
    assert.ok(grabbed, 'герой не поймал кромку');
    assert.ok(player.ledge, 'вис без карниза');
    assert.ok(Math.abs(player.body.y - player.ledge.hangY) < 1, 'висит не там, где кромка');
});

test('с виса подтягиваются наверх, а не взлетают', () => {
    const level = parseLevel([
        '..........',
        '..........',
        '.....#####',
        '.....#####',
        'p....#####',
        '##########',
    ]);
    const player = createPlayer(level.spawn);
    player.body.x = 5 * TILE - 9;
    player.body.y = 2 * TILE + LEDGE.handOffset + PLAYER.h;
    player.facing = 1;
    player.state = 'hang';
    player.ledge = findLedge(level, player.body, 1);
    assert.ok(player.ledge, 'кромка не нашлась');

    for (let i = 0; i < Math.round(0.6 / STEP); i += 1) {
        updatePlayer(player, level, intent({ jumpDown: i === 0, jumpHeld: i < 4 }), STEP);
    }
    assert.equal(player.state, 'move');
    assert.equal(player.body.y, 2 * TILE, 'подтянулся не на кромку');
    assert.equal(player.body.onGround, true);
});

test('вниз с карниза — падение, а не повторный захват', () => {
    const level = parseLevel([
        '..........',
        '..........',
        '.....#####',
        '.....#####',
        'p....#####',
        '##########',
    ]);
    const player = createPlayer(level.spawn);
    player.body.x = 5 * TILE - 9;
    player.body.y = 2 * TILE + LEDGE.handOffset + PLAYER.h;
    player.facing = 1;
    player.state = 'hang';
    player.ledge = findLedge(level, player.body, 1);

    updatePlayer(player, level, intent({ down: true }), STEP);
    assert.equal(player.state, 'move');
    for (let i = 0; i < 8; i += 1) updatePlayer(player, level, intent({ down: true }), STEP);
    assert.equal(player.state, 'move', 'карниз залип обратно');
    assert.ok(player.body.vy > 0, 'герой не падает');
});
