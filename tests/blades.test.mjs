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
