/**
 * Модель игрока для замеров — одна на всех и замороженная.
 *
 * Заведена по просьбе приёмки и по важной причине: если каждый пишет
 * своего водителя, разница версий игры смешивается с разницей водителей, и
 * число перестаёт быть про игру. Правится только вместе с перезамером
 * всего, что на ней стоит.
 *
 * Игру не трогает: ничем отсюда не пользуется ни один игровой модуль,
 * файл грузится по требованию (`await import('/claw/src/driver.js')`).
 *
 * Умеет то, без чего до первого боя не дойти: прыгать над обрывом, брать
 * уступ зацепом и подтягиваться, отталкиваться от стены. Без зацепа
 * водитель встаёт у стены на 760 и меряет стену, а не игру.
 */

import { footingAt, solidAtPoint } from './level.js';
import { PLAYER, SWORD } from './tuning.js';

const NO_INPUT = {
    left: false, right: false, up: false, down: false,
    jumpHeld: false, jumpDown: false, attackDown: false, dashDown: false,
    bowHeld: false, aimX: 0, aimY: 0, swapDown: false, bladeIndex: null,
};

/** Стена прямо по курсу — во всю высоту тела, а не по одной точке. */
function wallAhead(level, body, dir) {
    const x = body.x + dir * (PLAYER.w / 2 + 4);
    for (let dy = -PLAYER.h + 4; dy < -2; dy += 6) {
        if (solidAtPoint(level, x, body.y + dy)) return true;
    }
    return false;
}

/** Обрыв прямо по курсу. */
const gapAhead = (level, body, dir) => !footingAt(level, body.x + dir * 18, body.y + 2);

/**
 * Одно решение водителя. `dir` — куда он держит путь (+1 вправо).
 * Возвращает намерение, готовое для `stepWorld`.
 */
export function drive(world, dir = 1) {
    const p = world.player;
    const b = p.body;
    const вперёд = dir > 0 ? { right: true } : { left: true };

    // Висит на уступе — подтянуться.
    if (p.state === 'hang') return { ...NO_INPUT, up: true };

    // На стене — оттолкнуться вверх и вперёд.
    if (p.state === 'wall') return { ...NO_INPUT, ...вперёд, jumpDown: true, jumpHeld: true };

    // Враг в досягаемости: верный клинок, удар вне гарды.
    const цель = world.enemies.find((e) => e.state !== 'dead'
        && Math.abs(e.body.x - b.x) < SWORD.reach - 4
        && Math.abs(e.body.y - b.y) < 20);
    if (цель) {
        return {
            ...NO_INPUT,
            bladeIndex: цель.element === 'heat' ? 1 : 0,   // 0 — жар, 1 — лёд
            attackDown: p.attack.phase === 'none' && цель.state !== 'guard',
            jumpHeld: false,
        };
    }

    // Стена по курсу — прыжок к ней: дальше сработает зацеп.
    if (b.onGround && wallAhead(world.level, b, dir)) {
        return { ...NO_INPUT, ...вперёд, jumpDown: true, jumpHeld: true };
    }

    // Обрыв по курсу — прыжок через него.
    if (b.onGround && gapAhead(world.level, b, dir)) {
        return { ...NO_INPUT, ...вперёд, jumpDown: true, jumpHeld: true };
    }

    return { ...NO_INPUT, ...вперёд, jumpHeld: !b.onGround };
}
