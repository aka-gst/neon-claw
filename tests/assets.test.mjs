import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { validateTileset, variantAt, TILE_KINDS } from '../src/assets.js';

/**
 * Ассеты приходят снаружи, значит их надо проверять, а не принимать на веру.
 * Эти тесты — приёмка поставки: они падают на кривом файле до того, как он
 * молча превратит район в кашу.
 */

const DISTRICTS = ['roofs', 'warehouse', 'market'];
const read = (d) => JSON.parse(readFileSync(new URL(`../assets/tiles/${d}.json`, import.meta.url), 'utf8'));

test('поставленные тайлсеты проходят собственную схему', () => {
    for (const d of DISTRICTS) {
        assert.ok(existsSync(new URL(`../assets/tiles/${d}.json`, import.meta.url)), `нет ${d}.json`);
        assert.ok(validateTileset(read(d), d), `${d}: не проходит схему`);
    }
});

test('у каждого района есть все виды клеток и хотя бы по два варианта', () => {
    for (const d of DISTRICTS) {
        const kinds = read(d).kinds;
        for (const kind of TILE_KINDS) {
            assert.ok(kinds[kind], `${d}: нет вида ${kind}`);
            assert.ok(kinds[kind].length >= 2, `${d}: ${kind} — один вариант, стена будет штампом`);
        }
    }
});

test('верхняя грань есть в каждом варианте поверхности — по ней читают, куда встать', () => {
    for (const d of DISTRICTS) {
        for (const [i, ops] of read(d).kinds['solid.top'].entries()) {
            const edge = ops.find((op) => op.role === 'edge');
            assert.ok(edge, `${d}: solid.top вариант ${i} без грани`);
            const xs = (edge.pts ?? []).map((pt) => pt[0]);
            assert.ok(Math.min(...xs) <= 1 && Math.max(...xs) >= 23,
                `${d}: грань варианта ${i} не во всю ширину клетки`);
        }
    }
});

test('битый набор отбрасывается целиком, а не рисуется наполовину', () => {
    assert.equal(validateTileset(null, 'пусто'), null);
    assert.equal(validateTileset({ kinds: {} }, 'без видов'), null);
    assert.equal(validateTileset({
        kinds: { 'solid.top': [[{ op: 'line', pts: [[0, 0], [24, 0]], role: 'выдумка' }]] },
    }, 'чужая роль'), null);
    assert.equal(validateTileset({
        kinds: { 'solid.top': [[{ op: 'squiggle', pts: [[0, 0], [1, 1]], role: 'edge' }]] },
    }, 'чужой op'), null);
});

test('вариант клетки не меняется от кадра к кадру', () => {
    for (let i = 0; i < 50; i += 1) {
        assert.equal(variantAt(i, i * 3, 4), variantAt(i, i * 3, 4));
    }
    const seen = new Set();
    for (let col = 0; col < 40; col += 1) seen.add(variantAt(col, 7, 4));
    assert.ok(seen.size >= 3, 'варианты не перемешиваются — стена будет штампом');
});
