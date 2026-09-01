/**
 * Различимость удара. Сергей на соседнем проекте сказал прямо: «слабо
 * понятно, что удар был». Здесь мы это чиним не числом урона, а формой
 * отклика — и запираем тестом, чтобы правка не отъехала молча.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { STEP, TILE, SWORD } from '../src/tuning.js';
import { intent } from './helpers.mjs';

const ARENA = [
    '..........',
    '..........',
    '..........',
    'p....e....',
    '##########',
    '##########',
];

const OUTCOMES = ['hit', 'clang', 'whiff', 'kill'];

/**
 * Ставит врага на расстоянии `gap`, машет клинком и снимает кадр РОВНО в
 * тот миг, когда исход прозвучал. Мерить в конце взмаха бессмысленно:
 * искры живут треть секунды, вспышка — пятую, к концу уже всё погасло.
 */
const swing = (world, gap) => {
    const foe = world.enemies[0];
    foe.body.x = world.player.body.x + gap;
    world.events.length = 0;
    world.sparks.length = 0;
    world.rings.length = 0;
    world.shake = 0;

    stepWorld(world, intent({ attackDown: true }), STEP);
    for (let i = 0; i < 90; i += 1) {
        if (world.events.some((e) => OUTCOMES.includes(e))) break;
        stepWorld(world, intent(), STEP);
    }
    return {
        events: [...world.events],
        sparks: [...world.sparks],
        rings: [...world.rings],
        shake: world.shake,
        hitstop: world.player.hitstop,
        flash: foe.flash,
        guardAnim: foe.anim.guard,
    };
};

/** Держащий гарду страж — вторая из трёх ситуаций. */
const guarding = () => {
    const world = createWorld(ARENA);
    world.enemies[0].state = 'guard';
    world.enemies[0].t = 0.6;
    return world;
};

/** Средний ход искр по горизонтали: куда полетела крошка. */
const drift = (shot) =>
    shot.sparks.reduce((sum, s) => sum + s.vx, 0) / Math.max(1, shot.sparks.length);

test('попал, заблокировали и промазал — три разных события, а не одно с числом', () => {
    assert.ok(swing(createWorld(ARENA), 14).events.includes('hit'), 'попадание не назвалось');
    assert.ok(swing(guarding(), 14).events.includes('clang'), 'звон не назвался');

    const miss = swing(createWorld(ARENA), 6 * TILE);
    assert.ok(miss.events.includes('whiff'), 'промах прошёл молча');
    assert.ok(!miss.events.includes('hit') && !miss.events.includes('clang'));
});

test('искры попадания уходят сквозь врага, искры звона — назад в игрока', () => {
    const hit = swing(createWorld(ARENA), 14);
    assert.ok(drift(hit) > 40, `попадание не выбросило крошку вперёд: ${drift(hit).toFixed(0)}`);

    const blocked = swing(guarding(), 14);
    assert.ok(drift(blocked) < -40, `звон не отбросил крошку назад: ${drift(blocked).toFixed(0)}`);
});

test('промах не трясёт экран и не стопорит время — тишина и есть ответ', () => {
    const miss = swing(createWorld(ARENA), 6 * TILE);
    assert.equal(miss.shake, 0, 'промах тряхнул экран');
    assert.equal(miss.hitstop, 0, 'промах затормозил время');
    assert.ok(miss.rings.length > 0, 'промах не оставил росчерка по воздуху');
});

test('звон подсвечивает гарду, попадание — тело: вспышки разные', () => {
    const hit = swing(createWorld(ARENA), 14);
    assert.ok(hit.flash > 0, 'тело не вспыхнуло на попадании');

    const blocked = swing(guarding(), 14);
    assert.equal(blocked.flash, 0, 'звон зря подсветил тело');
    assert.ok(blocked.guardAnim > 0, 'гарда не вспыхнула на звоне');
});

/**
 * Два теста ниже пришли от сессии ПЕРЕЛОМА — они забрали наш приём с
 * направлением искр, а взамен показали, чего у нас не хватало.
 */

test('исходы расходятся не одним признаком, а двумя независимыми', () => {
    // Один признак — это удача, а не читаемость: цвет пропадёт у дальтоника,
    // искры потеряются на пёстром фоне, вспышка сольётся со вспышкой соседа.
    // Требуем два канала, которые ломаются по разным причинам.
    const hit = swing(createWorld(ARENA), 14);
    const blocked = swing(guarding(), 14);

    const признаки = [
        ['ход искр', Math.sign(drift(hit)) !== Math.sign(drift(blocked))],
        ['что вспыхнуло', (hit.flash > 0) !== (blocked.flash > 0)],
    ].filter(([, разошлось]) => разошлось);

    assert.ok(признаки.length >= 2,
        `попадание и звон различает лишь ${признаки.length} признак: ${признаки.map(([n]) => n)}`);
});

test('замирание на попадании держит порог — иначе промах нечем отличить', () => {
    // Промах у нас читается тем, что время НЕ замерло. Это работает ровно
    // до тех пор, пока замирание вообще заметно: уронят хитстоп ради темпа —
    // и промах станет неотличим от «игра не заметила нажатие».
    // Порог берём по нижней границе восприятия паузы, ~3 кадра при 60 к/с.
    const ЗАМЕТНО = 0.05;
    const hit = swing(createWorld(ARENA), 14);
    assert.ok(hit.hitstop >= ЗАМЕТНО,
        `замирание ${hit.hitstop.toFixed(3)} с — короче порога ${ЗАМЕТНО} с`);
    assert.ok(SWORD.hitstop >= ЗАМЕТНО,
        `SWORD.hitstop опустили до ${SWORD.hitstop} — контраст с промахом пропал`);

    const miss = swing(createWorld(ARENA), 6 * TILE);
    assert.equal(miss.hitstop, 0, 'промах тоже замирает — контраста нет');
});
