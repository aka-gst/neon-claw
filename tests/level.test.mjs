import test from 'node:test';
import assert from 'node:assert/strict';

import { parseLevel, tileAt, SOLID, AIR } from '../src/level.js';
import { TILE } from '../src/tuning.js';

test('карта прямоугольная и содержит всё, без чего уровень не запускается', () => {
    const level = parseLevel();
    assert.ok(level.rows.every((row) => row.length === level.width), 'строки разной длины');
    assert.ok(level.exit, 'нет точки эвакуации');
    assert.ok(level.enemies.length >= 2, 'корсаров меньше двух');
    assert.ok(level.loot.length >= 8, 'добра слишком мало для среза');
});

test('старт, корсары и выход стоят на камне, а не висят в воздухе', () => {
    const level = parseLevel();
    const standsOnFloor = (spot) => {
        const col = Math.floor(spot.x / TILE);
        const row = Math.floor(spot.y / TILE);
        return tileAt(level, col, row) === SOLID && tileAt(level, col, row - 1) === AIR;
    };
    assert.ok(standsOnFloor(level.spawn), 'старт висит');
    assert.ok(standsOnFloor(level.exit), 'выход висит');
    for (const foe of level.enemies) assert.ok(standsOnFloor(foe), `корсар висит: ${foe.x}`);
});

test('добро не замуровано в камне — его можно достать', () => {
    const level = parseLevel();
    for (const item of level.loot) {
        const col = Math.floor(item.x / TILE);
        const row = Math.floor(item.y / TILE);
        assert.equal(tileAt(level, col, row), AIR, `трофей внутри стены: ${col},${row}`);
    }
});

test('края мира — камень, низ — пропасть', () => {
    const level = parseLevel();
    assert.equal(tileAt(level, -1, 10), SOLID);
    assert.equal(tileAt(level, level.width, 10), SOLID);
    assert.equal(tileAt(level, 5, level.height + 3), AIR);
});
