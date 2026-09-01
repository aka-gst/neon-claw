/**
 * Два клинка, страж со своей стихией и одна реакция — раскол.
 *
 * Главное, что здесь проверяется: множитель стихии бьёт НЕ ТОЛЬКО по
 * урону, но и по гарде. Если бы он менял одни цифры, выбор клинка был бы
 * арифметикой; меняя ещё и гарду, он меняет ритм боя — а ритм и есть то,
 * что чувствуется без подсказок.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../src/world.js';
import { createEnforcer, hurtEnforcer, updateEnforcer } from '../src/enemy.js';
import { STEP, ENFORCER, BLADES } from '../src/tuning.js';
import { RULES, elementFactor } from '../src/combat.js';
import { intent } from './helpers.mjs';

const ARENA = [
    '..........',
    '..........',
    '..........',
    'p....i....',
    '##########',
    '##########',
];

/**
 * Одинокий страж нужной стихии. `hp` завышают там, где проверяется само
 * ПРАВИЛО: с обычным запасом правильная связка убивает за два удара, и
 * страж просто не доживает до третьей проверки. Экономику меряет
 * отдельный тест ниже — здесь она только мешала бы.
 */
const foeOf = (element, hp = null) => {
    const foe = createEnforcer({ x: 100, y: 100, element }, 0, RULES.enemy);
    if (hp !== null) { foe.hp = hp; foe.maxHp = hp; }
    return foe;
};

/** Удар клинком `blade` — ровно так, как его наносит мир. */
const strike = (foe, blade) => {
    const factor = elementFactor(blade, foe.element);
    return hurtEnforcer(foe, foe.body.x - 30, {
        parry: RULES.enemy.parry,
        guard: RULES.enemy.guard,
        element: blade,
        damage: BLADES.damage * factor,
        factor,
    });
};

const wait = (foe, seconds) => {
    const world = createWorld(ARENA);
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
        updateEnforcer(foe, world.level, world.player, STEP);
    }
};

test('его же стихией клинок вязнет: половина урона и гарда сразу, надолго', () => {
    const foe = foeOf('heat');
    assert.equal(strike(foe, 'heat'), 'hit');
    assert.equal(foe.hp, RULES.enemy.hp - BLADES.damage * BLADES.weak);
    assert.equal(foe.state, 'guard', 'гарда не встала');
    assert.ok(foe.guardMax > ENFORCER.guard, 'гарда держится не дольше обычного');
});

test('его противоположностью — вдвое, и гарда не поднимается вовсе', () => {
    const foe = foeOf('heat');
    assert.equal(strike(foe, 'frost'), 'hit');
    assert.equal(foe.hp, RULES.enemy.hp - BLADES.damage * BLADES.counter);
    assert.notEqual(foe.state, 'guard', 'гарда встала, хотя клинок её противоположность');
});

test('раскол: два удара РАЗНЫМИ стихиями, и страж не закроется', () => {
    const foe = foeOf('heat', 30);
    strike(foe, 'frost');
    assert.equal(foe.mark, 'frost', 'след не лёг');

    assert.equal(strike(foe, 'heat'), 'rift', 'две разные стихии не дали раскола');
    assert.ok(foe.lastRift, 'раскол не отметился на страже');
    assert.ok(foe.guardReady >= BLADES.riftOpen - 1e-9, 'раскол не запер гарду');
    assert.equal(foe.mark, null, 'след не сгорел в расколе');
});

test('дважды одной стихией раскола не даёт — иначе правило было бы «бей»', () => {
    const foe = foeOf('frost', 30);
    strike(foe, 'heat');
    foe.state = 'chase';
    foe.guardReady = 0;
    assert.equal(strike(foe, 'heat'), 'hit', 'одна и та же стихия дважды дала раскол');
    assert.equal(foe.lastRift, false, 'та же стихия зря сочлась расколом');
});

test('след гаснет: промедлил дольше markTime — раскола нет', () => {
    const foe = foeOf('frost', 30);
    strike(foe, 'heat');
    wait(foe, BLADES.markTime + 0.2);
    assert.equal(foe.mark, null, 'след не погас сам');

    foe.state = 'chase';
    foe.guardReady = 0;
    assert.equal(strike(foe, 'frost'), 'hit', 'погасший след всё равно дал раскол');
});

test('правильная связка кладёт стража вдвое быстрее неправильной', () => {
    const swings = (first, second) => {
        const foe = foeOf('heat');
        let n = 0;
        while (foe.state !== 'dead' && n < 40) {
            strike(foe, n % 2 === 0 ? first : second);
            n += 1;
            // Гарда сама опадает со временем — иначе счёт мерил бы её,
            // а не выбор клинка.
            foe.state = foe.state === 'dead' ? 'dead' : 'chase';
            foe.guardReady = 0;
        }
        return n;
    };
    const right = swings('frost', 'heat');   // противоположность, потом раскол
    const wrong = swings('heat', 'heat');    // его же стихией, раз за разом
    assert.ok(right <= 2, `правильная связка заняла ${right} ударов вместо двух`);
    assert.ok(wrong >= right * 2, `неправильная (${wrong}) не дороже правильной (${right})`);
});

test('клинок меняется мгновенно: в прыжке, на рывке и без потери скорости', () => {
    const world = createWorld(ARENA);
    const p = world.player;
    assert.equal(p.blade, BLADES.order[0]);

    for (let i = 0; i < 12; i += 1) stepWorld(world, intent({ right: true }), STEP);
    stepWorld(world, intent({ right: true, jumpDown: true, jumpHeld: true }), STEP);
    const speed = p.body.vx;
    assert.ok(!p.body.onGround, 'герой не в воздухе — проверять нечего');

    stepWorld(world, intent({ right: true, jumpHeld: true, swapDown: true }), STEP);
    assert.equal(p.blade, BLADES.order[1], 'клинок не сменился в прыжке');
    assert.ok(Math.abs(p.body.vx - speed) < 20, 'смена клинка украла скорость');
});

test('в кадрах замирания от удара клинок всё ещё меняется — там и место расколу', () => {
    const world = createWorld(ARENA);
    const p = world.player;
    p.hitstop = 0.08;
    stepWorld(world, intent({ bladeIndex: 1 }), STEP);
    assert.equal(p.blade, BLADES.order[1], 'хитстоп проглотил смену клинка');
});

/**
 * Всё выше проверяет ПРАВИЛО: `hurtEnforcer` слушается, когда ему подали
 * верные аргументы. Но множитель и стихию считает мир, а помощник `strike`
 * повторяет этот расчёт у себя — то есть проверяет собственную заготовку.
 *
 * Отрицательный контроль это подтвердил: если убрать из `playerAttacks`
 * передачу стихии, все 83 теста остаются зелёными, а стихий в игре нет.
 * Находка пришла от сессии ПЕРЕЛОМА: «если в проверке есть аргумент,
 * который вы придумали, — спросите, откуда его берёт игра».
 *
 * Ниже — та же механика через настоящий ход мира. Здесь не подаётся ни
 * урон, ни множитель: только нажатия.
 */

const LIVE = [
    '..........',
    '..........',
    '..........',
    'p...i.....',
    '##########',
    '##########',
];

/** Держит героя вплотную к стражу и не даёт стражу бить в ответ. */
const glue = (world, foe) => {
    const p = world.player;
    p.body.x = foe.body.x - 22;
    p.body.y = foe.body.y;
    p.facing = 1;
    p.invuln = 99;
    foe.cooldown = 99;
};

/**
 * Один взмах настоящим ходом мира. Ввод — только нажатия.
 *
 * Ждём ВОЗВРАТА КЛИНКА В ПОКОЙ, а не сорок шагов: цикл удара 0,34 с, ровно
 * столько же, сколько сорок один шаг, — и следующее нажатие приходило, пока
 * меч ещё в возврате, где его молча отбрасывают. Второй взмах не случался
 * вовсе, а выглядело это как «раскол не работает».
 */
const liveSwing = (world, foe, keys = {}) => {
    glue(world, foe);
    stepWorld(world, intent({ attackDown: true, ...keys }), STEP);
    for (let i = 0; i < 200; i += 1) {
        glue(world, foe);
        stepWorld(world, intent(), STEP);
        if (world.player.attack.phase === 'none' && i > 4) return;
    }
    throw new Error('клинок так и не вернулся в покой');
};

test('живой удар: игра сама несёт стихию клинка и кладёт след на стража', () => {
    const world = createWorld(LIVE);
    const foe = world.enemies[0];
    foe.hp = 40;
    foe.maxHp = 40;

    assert.equal(foe.element, 'frost', 'страж из разметки `i` оказался не льдом');
    assert.equal(world.player.blade, 'heat', 'герой начинает не с жара');

    const before = foe.hp;
    liveSwing(world, foe);

    // Жар по льду — противоположность: урон вдвое. Число берём из данных,
    // а не из теста, но САМ удар нанесла игра.
    assert.equal(before - foe.hp, BLADES.damage * BLADES.counter,
        'игра не применила множитель стихии');
    assert.equal(foe.mark, 'heat', 'игра не оставила след клинка');
    assert.notEqual(foe.state, 'guard', 'гарда встала на удар противоположностью');
});

test('живой раскол: сменить клинок кнопкой и ударить — трещит', () => {
    const world = createWorld(LIVE);
    const foe = world.enemies[0];
    foe.hp = 40;
    foe.maxHp = 40;

    liveSwing(world, foe);
    world.events.length = 0;

    // Клинок меняем ровно тем же нажатием, что и игрок.
    liveSwing(world, foe, { swapDown: true });
    assert.equal(world.player.blade, 'frost', 'нажатие не сменило клинок');
    assert.ok(world.events.includes('rift'), 'две разные стихии не дали раскола');
    assert.ok(foe.guardReady > 0, 'раскол не запер гарду');
});
