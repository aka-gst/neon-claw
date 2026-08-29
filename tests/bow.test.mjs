import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { STEP, TILE, BOW, PLAYER } from '../src/tuning.js';
import { intent } from './helpers.mjs';

/**
 * Лук — второе оружие, а не замена мечу. Меч быстрый, но упирается в
 * гарду; лук медленный, зато гарду не замечает. Из этого и складывается
 * выбор, и тесты стерегут обе половины.
 *
 * Плюс три ограничения, каждое отнимает ровно то, чем лук опасен: стрел
 * четыре, натяжение почти укореняет, стрела тяжёлая и падает.
 */

const RANGE = [
    '..........................',
    '..........................',
    '..........................',
    'p........................e',
    '##########################',
    '##########################',
];

const OPEN = [
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    'p................e........',
    '##########################',
    '##########################',
];

const play = (w, keys, seconds) => {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
        stepWorld(w, intent(keys), STEP);
        w.events.length = 0;
    }
};

const shoot = (w, hold = BOW.drawTime, aim = { aimX: 1, aimY: 0 }) => {
    play(w, { bowHeld: true, ...aim }, hold);
    play(w, { ...aim }, STEP * 2);
};

test('натяжение почти укореняет — лук не для бега', () => {
    const running = createWorld(RANGE);
    play(running, { right: true }, 1);

    const drawing = createWorld(RANGE);
    play(drawing, { right: true, bowHeld: true, aimX: 1 }, 1);

    assert.ok(drawing.player.body.x < running.player.body.x - TILE * 3,
        'с натянутым луком герой бежит как обычно');
});

test('короткое касание не тратит стрелу', () => {
    const w = createWorld(RANGE);
    play(w, { bowHeld: true, aimX: 1 }, 0.06);
    play(w, { aimX: 1 }, STEP * 2);
    assert.equal(w.player.bow.arrows, BOW.arrows, 'стрела ушла на случайном касании');
    assert.equal(w.arrows.length, 0);
});

test('колчан кончается, и стрелять становится нечем', () => {
    const w = createWorld(RANGE);
    w.enemies.length = 0;
    for (let i = 0; i < BOW.arrows; i += 1) shoot(w);
    assert.equal(w.player.bow.arrows, 0, `в колчане осталось ${w.player.bow.arrows}`);

    shoot(w);
    assert.equal(w.player.bow.arrows, 0, 'выстрел без стрел прошёл');
});

test('дальность лука — около шестнадцати тайлов навесом', () => {
    const w = createWorld(OPEN);
    w.enemies.length = 0;
    const from = w.player.body.x;
    shoot(w, BOW.drawTime, { aimX: 1, aimY: -0.7 });
    play(w, {}, 1.5);

    const reach = (w.stuck[0].x - from) / TILE;
    assert.ok(reach > 12, `лук добивает всего на ${reach.toFixed(1)} тайла`);
    assert.ok(reach < 22, `лук добивает на ${reach.toFixed(1)} тайла — это уже снайперка`);
});

test('стрела проходит сквозь гарду, а меч — нет', () => {
    const bySword = createWorld(RANGE);
    const guarded = bySword.enemies[0];
    guarded.body.x = bySword.player.body.x + TILE * 1.2;
    bySword.player.facing = 1;
    // Первый удар поднимает гарду, второй должен от неё отскочить.
    play(bySword, { attackDown: true }, 0.35);
    const afterFirst = guarded.hp;
    play(bySword, { attackDown: true }, 0.35);
    assert.equal(guarded.state, 'guard', 'страж не закрылся');
    assert.equal(guarded.hp, afterFirst, 'меч прошёл сквозь гарду');

    const byArrow = createWorld(RANGE);
    const closed = byArrow.enemies[0];
    closed.body.x = byArrow.player.body.x + TILE * 4;
    closed.state = 'guard';
    closed.t = 5;
    const hp = closed.hp;
    shoot(byArrow);
    play(byArrow, {}, 0.6);
    assert.ok(closed.hp < hp, 'стрела не пробила гарду — тогда лук незачем');
});

test('воткнувшуюся стрелу можно забрать обратно', () => {
    const w = createWorld(RANGE);
    w.enemies.length = 0;
    shoot(w, 0.2, { aimX: 1, aimY: 1 });
    play(w, {}, 0.8);
    assert.equal(w.player.bow.arrows, BOW.arrows - 1);
    assert.equal(w.stuck.length, 1);

    const spot = w.stuck[0];
    w.player.body.x = spot.x;
    w.player.body.y = spot.y + PLAYER.h / 2;
    play(w, {}, 0.1);
    assert.equal(w.player.bow.arrows, BOW.arrows, 'стрела не подобралась');
    assert.equal(w.stuck.length, 0);
});

test('откат к чекпоинту возвращает и стрелы', () => {
    const w = createWorld();
    w.enemies.length = 0;
    shoot(w, BOW.drawTime);
    assert.equal(w.player.bow.arrows, BOW.arrows - 1);

    w.player.hp = 0;
    play(w, {}, 1);
    assert.equal(w.player.bow.arrows, BOW.arrows,
        'после отката стрел меньше — десятая попытка безнадёжнее первой');
});
