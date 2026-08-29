import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { moodOf } from '../src/enemy.js';
import { STEP, TILE, BOW, PLAYER, ENFORCER } from '../src/tuning.js';

const ENFORCER_SIGHT = ENFORCER.sight;
import { intent } from './helpers.mjs';

/**
 * Лук обязан обслуживать стелс, а не отменять его. Тесты стерегут три
 * ограничения, каждое из которых отнимает ровно то, чем он опасен:
 * стрел мало, натяжение укореняет, и убивает он только того, кто не ждёт.
 *
 * И отдельно — то, ради чего он вообще интереснее катаны: промах шумит
 * там, куда воткнулся, и уводит патруль в сторону.
 */

const RANGE = [
    '..........................',
    '..........................',
    '..........................',
    'p........................e',
    '##########################',
    '##########################',
];

/**
 * Высокая площадка: стреле нужен воздух. Страж стоит дальше, чем видит
 * (170 пикселей), и спиной — значит, узнать о герое он может только на слух.
 */
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

/** Натянуть и отпустить: `bowHeld` держится, потом снимается. */
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

test('стрела втыкается в камень и шумит там, куда попала', () => {
    const w = createWorld(RANGE);
    w.enemies.length = 0;
    shoot(w, BOW.drawTime, { aimX: 1, aimY: 1 });
    play(w, {}, 1.2);

    assert.equal(w.arrows.length, 0, 'стрела всё ещё летит');
    assert.equal(w.stuck.length, 1, 'стрела не воткнулась');

    const spot = w.stuck[0];
    assert.ok(spot.x > w.player.body.x, 'стрела воткнулась позади героя');
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

test('промах уводит стража к месту попадания, а не к герою', () => {
    const w = createWorld(OPEN);
    const foe = w.enemies[0];
    foe.facing = 1;
    assert.equal(moodOf(foe), 'calm');
    assert.ok(foe.body.x - w.player.body.x > ENFORCER_SIGHT,
        'страж стоит в пределах видимости — тест проверял бы не то');

    shoot(w, BOW.drawTime, { aimX: 1, aimY: -0.7 });
    play(w, {}, 1.5);
    assert.equal(w.stuck.length, 1, 'стрела не воткнулась');

    assert.equal(foe.state, 'suspect', `страж не пошёл на звук (${foe.state})`);
    assert.ok(Math.abs(foe.suspect.x - w.stuck[0].x) < 1, 'страж пошёл не к стреле');
    assert.ok(foe.suspect.x - w.player.body.x > TILE * 10,
        'страж пошёл к герою, а не к стреле');
});

test('стрела снимает того, кто не ждёт', () => {
    const w = createWorld(RANGE);
    const foe = w.enemies[0];
    // Ставим спиной и вплотную: он занят своим и герой ему не виден.
    foe.body.x = w.player.body.x + TILE * 3;
    foe.facing = 1;

    shoot(w);
    play(w, {}, 0.5);
    assert.equal(foe.state, 'dead', `стрела в спину не сняла стража (${foe.state})`);
    assert.equal(w.takedowns, 1);
});

test('увидевший стрелу страж успевает уйти с линии — ему лишь урон', () => {
    const w = createWorld(RANGE);
    const foe = w.enemies[0];
    foe.body.x = w.player.body.x + TILE * 3;
    foe.facing = 1;

    // Тревога поднимается ровно между выстрелом и попаданием.
    play(w, { bowHeld: true, aimX: 1 }, BOW.drawTime);
    play(w, { aimX: 1 }, STEP * 2);
    foe.alert = 2;
    foe.state = 'chase';
    const hp = foe.hp;

    play(w, {}, 0.5);
    assert.equal(w.takedowns, 0, 'готовый страж снят как неготовый');
    assert.ok(foe.hp < hp, 'готовому стражу не досталось вовсе');
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
