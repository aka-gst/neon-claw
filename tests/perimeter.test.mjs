import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { parseLevel, tileAt, SOLID, ONEWAY, AIR } from '../src/level.js';
import { LEVELS } from '../src/levels.js';
import { TILE, STEP, PLAYER } from '../src/tuning.js';
import { intent } from './helpers.mjs';

/**
 * «Периметр» построен под режим «Смесь» и держится на трёх развилках, у
 * каждой из которых обе ветки честные. Тесты стерегут именно это: если
 * щель перестанет быть щелью, а колодец — колодцем, развилка исчезнет и
 * уровень превратится в коридор.
 */

const rows = LEVELS.perimeter.rows;
const level = () => parseLevel(rows);
const world = () => createWorld(rows);

const play = (w, keys, seconds, once = {}) => {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
        stepWorld(w, intent({
            ...keys,
            jumpDown: Boolean(once.jump) && i === 0,
            dashDown: Boolean(once.dash) && i === 0,
        }), STEP);
        w.events.length = 0;
    }
};

test('всё живое и все метки стоят на камне', () => {
    const lvl = level();
    const onFloor = (spot) => {
        const col = Math.floor(spot.x / TILE);
        const row = Math.floor(spot.y / TILE);
        return tileAt(lvl, col, row) === SOLID && tileAt(lvl, col, row - 1) === AIR;
    };
    assert.ok(onFloor(lvl.spawn), 'старт висит');
    assert.ok(onFloor(lvl.exit), 'выход висит');
    for (const foe of lvl.enemies) assert.ok(onFloor(foe), `страж висит: ${foe.x / TILE}`);
    for (const c of lvl.checkpoints) assert.ok(onFloor(c), `чекпоинт висит: ${c.x / TILE}`);
    assert.equal(lvl.enemies.length, 7);
    assert.equal(lvl.checkpoints.length, 3);
});

test('колодец ровно три тайла в ширину — иначе зигзаг не собирается', () => {
    const lvl = level();
    // Считаем от левой стены вправо: пустые колонки между двумя стенами.
    const row = 20;
    let width = 0;
    for (let col = 31; col < 40; col += 1) {
        if (tileAt(lvl, col, row) === AIR) width += 1;
        else if (width > 0) break;
    }
    assert.equal(width, 3, `колодец шириной ${width}: зигзаг работает только на 2–4`);
});

test('щель под стеной проходится подкатом и не проходится шагом', () => {
    const walking = world();
    walking.enemies.length = 0;
    walking.player.body.x = 35 * TILE;
    walking.player.body.y = 28 * TILE;
    play(walking, { right: true }, 2.5);
    assert.ok(walking.player.body.x < 37 * TILE,
        `стоя пролез в щель: ${(walking.player.body.x / TILE).toFixed(1)}`);

    const sliding = world();
    sliding.enemies.length = 0;
    sliding.player.body.x = 35 * TILE;
    sliding.player.body.y = 28 * TILE;
    play(sliding, { right: true }, 0.4);
    play(sliding, { right: true, down: true }, 2.5, { dash: true });
    assert.ok(sliding.player.body.x > 40 * TILE,
        `подкатом не пролез: ${(sliding.player.body.x / TILE).toFixed(1)}`);
});

test('тайник под плитой закрыт для бегущего и открыт для подката', () => {
    const lvl = level();
    // Плита на 25–26, под ней ряд 27 пустой: ровно один тайл высоты.
    for (let col = 54; col <= 59; col += 1) {
        assert.equal(tileAt(lvl, col, 26), SOLID, `над тайником дыра в колонке ${col}`);
        assert.equal(tileAt(lvl, col, 27), AIR, `тайник замурован в колонке ${col}`);
    }
    const core = lvl.loot.find((l) => l.kind === 'core' && l.x / TILE < 60);
    assert.ok(core, 'в тайнике нет ядра');
    assert.ok(PLAYER.h > TILE, 'герой пролезает стоя — щель перестала быть щелью');
});

test('лестница к мостику хранилища набирается прыжками по два тайла', () => {
    const lvl = level();
    // Мостик — помост, а не камень: опорой считается и то и другое.
    const top = (col, from) => {
        for (let row = from; row < 32; row += 1) {
            const t = tileAt(lvl, col, row);
            if (t === SOLID || t === ONEWAY) return row;
        }
        return 32;
    };
    const floor = top(61, 20);
    const crate = top(62, 20);
    const ledge = top(64, 20);
    const walk = top(70, 18);

    assert.equal(floor - crate, 2, 'ящик не в двух тайлах от пола');
    assert.equal(crate - ledge, 2, 'уступ не в двух тайлах от ящика');
    assert.equal(ledge - walk, 2, 'мостик не в двух тайлах от уступа');
});
