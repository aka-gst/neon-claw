/**
 * Кибер-корсар — единственный противник среза, и он спроектирован как
 * собеседник, а не как мишень.
 *
 * Вся суть в гарде. Получив удар, корсар вскидывает блок: сабля с него
 * соскакивает со звоном, урона нет, игрока отбрасывает. И каждый удар в
 * поднятую гарду продлевает её. Долбить кнопку становится строго хуже,
 * чем выждать, — а выждав, игрок получает открытое окно и успевает
 * положить два удара подряд. Ритм «удар — пауза — два удара» рождается
 * из двух таймеров, без единой строчки про «сложность».
 */

import { CORSAIR } from './tuning.js';
import { makeBody, moveX, moveY } from './physics.js';
import { solidAtPoint } from './level.js';

export function createCorsair(spawn, index = 0) {
    return {
        id: `corsair-${index}`,
        body: makeBody(spawn.x, spawn.y, CORSAIR.w, CORSAIR.h),
        facing: -1,
        hp: CORSAIR.hp,
        maxHp: CORSAIR.hp,
        state: 'patrol',
        t: 0,
        /** Сколько ещё помнит игрока после потери из виду. */
        alert: 0,
        cooldown: 0,
        guardReady: 0,
        hitstop: 0,
        flash: 0,
        anim: { walk: 0, guard: 0 },
        home: { ...spawn },
    };
}

export const isSwinging = (e) => e.state === 'active';
export const isGuarding = (e) => e.state === 'guard';

export function corsairAttackRect(e) {
    const b = e.body;
    return {
        x: e.facing > 0 ? b.x + 1 : b.x - 1 - CORSAIR.attackRange,
        y: b.y - b.h * 0.9,
        w: CORSAIR.attackRange,
        h: 24,
    };
}

/**
 * Приход удара. Возвращает, что игрок услышал: звон о гарду или попадание.
 */
export function hurtCorsair(e, fromX) {
    if (e.state === 'dead') return 'none';

    if (e.state === 'guard') {
        e.t = Math.min(CORSAIR.guard, e.t + CORSAIR.guardExtend);
        e.anim.guard = 0.18;
        return 'blocked';
    }

    e.hp -= 1;
    e.flash = 0.18;
    e.hitstop = 0.06;
    e.facing = Math.sign(fromX - e.body.x) || e.facing;
    e.body.vx = -e.facing * CORSAIR.knockback;

    if (e.hp <= 0) {
        e.state = 'dead';
        e.t = 0;
        e.body.vy = -180;
        return 'dead';
    }

    if (e.guardReady <= 0) {
        e.state = 'guard';
        e.t = CORSAIR.guard;
        e.anim.guard = 0.2;
    } else {
        e.state = 'chase';
        e.alert = CORSAIR.memory;
    }
    return 'hit';
}

function sees(e, player) {
    if (player.state === 'dead') return false;
    const dx = player.body.x - e.body.x;
    const dy = player.body.y - e.body.y;
    return Math.abs(dx) < CORSAIR.sight && Math.abs(dy) < 70;
}

function walk(e, dir, speed, dt) {
    const b = e.body;
    b.vx += dir * CORSAIR.accel * dt;
    if (Math.abs(b.vx) > speed) b.vx = dir * speed;
    if (dir !== 0) e.facing = dir;
}

function brake(e, dt) {
    const b = e.body;
    const f = CORSAIR.friction * dt;
    b.vx = Math.abs(b.vx) <= f ? 0 : b.vx - Math.sign(b.vx) * f;
}

/** Впереди обрыв или стена — разворачиваемся. Корсары не прыгают в пропасть. */
function edgeAhead(e, level) {
    const b = e.body;
    const ahead = b.x + e.facing * (b.w / 2 + 5);
    return !solidAtPoint(level, ahead, b.y + 6) || b.hitWall === e.facing;
}

export function updateCorsair(e, level, player, dt) {
    const b = e.body;

    if (e.hitstop > 0) {
        e.hitstop -= dt;
        return null;
    }

    e.flash = Math.max(0, e.flash - dt);
    e.anim.guard = Math.max(0, e.anim.guard - dt);
    e.cooldown = Math.max(0, e.cooldown - dt);
    e.guardReady = Math.max(0, e.guardReady - dt);
    e.alert = Math.max(0, e.alert - dt);

    let event = null;

    switch (e.state) {
        case 'patrol': {
            if (b.onGround && edgeAhead(e, level)) e.facing = -e.facing;
            walk(e, e.facing, CORSAIR.patrolSpeed, dt);
            e.anim.walk += Math.abs(b.vx) * dt * 0.1;
            if (sees(e, player)) {
                e.state = 'chase';
                e.alert = CORSAIR.memory;
                event = 'spot';
            }
            break;
        }

        case 'chase': {
            const dx = player.body.x - b.x;
            if (sees(e, player)) e.alert = CORSAIR.memory;
            if (e.alert <= 0) { e.state = 'patrol'; break; }

            const near = Math.abs(dx) <= CORSAIR.attackRange - 4;
            const level0 = Math.abs(player.body.y - b.y) < 40;
            if (near && level0 && e.cooldown <= 0) {
                e.facing = Math.sign(dx) || e.facing;
                e.state = 'windup';
                e.t = CORSAIR.windup;
                event = 'windup';
                brake(e, dt);
                break;
            }
            if (near) brake(e, dt);
            else if (b.onGround && edgeAhead(e, level) && Math.sign(dx) === e.facing) brake(e, dt);
            else walk(e, Math.sign(dx) || e.facing, CORSAIR.chaseSpeed, dt);
            e.anim.walk += Math.abs(b.vx) * dt * 0.1;
            break;
        }

        case 'windup': {
            brake(e, dt);
            e.t -= dt;
            if (e.t <= 0) { e.state = 'active'; e.t = CORSAIR.active; }
            break;
        }

        case 'active': {
            brake(e, dt);
            e.t -= dt;
            if (e.t <= 0) { e.state = 'recover'; e.t = CORSAIR.recover; }
            break;
        }

        case 'recover': {
            brake(e, dt);
            e.t -= dt;
            if (e.t <= 0) {
                e.state = 'chase';
                e.cooldown = CORSAIR.cooldown;
                e.alert = CORSAIR.memory;
            }
            break;
        }

        case 'guard': {
            // Гарда держит корсара на месте: он закрылся, а не отступает.
            brake(e, dt);
            e.t -= dt;
            if (e.t <= 0) {
                e.state = 'chase';
                e.guardReady = CORSAIR.guardCooldown;
                e.cooldown = 0.25;
                e.alert = CORSAIR.memory;
            }
            break;
        }

        case 'dead': {
            e.t += dt;
            brake(e, dt * 0.5);
            break;
        }
    }

    b.vy = Math.min(CORSAIR.maxFall, b.vy + CORSAIR.gravity * dt);
    moveX(level, b, b.vx * dt);
    moveY(level, b, b.vy * dt);

    return event;
}
