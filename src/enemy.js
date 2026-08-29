/**
 * Страж периметра — единственный противник среза, и он спроектирован как
 * собеседник, а не как мишень.
 *
 * Вся суть в гарде. Получив удар, страж вскидывает блок: сабля с него
 * соскакивает со звоном, урона нет, игрока отбрасывает. И каждый удар в
 * поднятую гарду продлевает её. Долбить кнопку становится строго хуже,
 * чем выждать, — а выждав, игрок получает открытое окно и успевает
 * положить два удара подряд. Ритм «удар — пауза — два удара» рождается
 * из двух таймеров, без единой строчки про «сложность».
 */

import { ENFORCER } from './tuning.js';
import { makeBody, moveX, moveY } from './physics.js';
import { solidAtPoint } from './level.js';

export function createEnforcer(spawn, index = 0) {
    return {
        id: `enforcer-${index}`,
        body: makeBody(spawn.x, spawn.y, ENFORCER.w, ENFORCER.h),
        facing: -1,
        hp: ENFORCER.hp,
        maxHp: ENFORCER.hp,
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

export function enforcerAttackRect(e) {
    const b = e.body;
    return {
        x: e.facing > 0 ? b.x + 1 : b.x - 1 - ENFORCER.attackRange,
        y: b.y - b.h * 0.9,
        w: ENFORCER.attackRange,
        h: 24,
    };
}

/**
 * Приход удара. Возвращает, что игрок услышал: звон о гарду или попадание.
 */
export function hurtEnforcer(e, fromX) {
    if (e.state === 'dead') return 'none';

    if (e.state === 'guard') {
        e.t = Math.min(ENFORCER.guard, e.t + ENFORCER.guardExtend);
        e.anim.guard = 0.18;
        return 'blocked';
    }

    e.hp -= 1;
    e.flash = 0.18;
    e.hitstop = 0.06;
    e.facing = Math.sign(fromX - e.body.x) || e.facing;
    e.body.vx = -e.facing * ENFORCER.knockback;

    if (e.hp <= 0) {
        e.state = 'dead';
        e.t = 0;
        e.body.vy = -180;
        return 'dead';
    }

    if (e.guardReady <= 0) {
        e.state = 'guard';
        e.t = ENFORCER.guard;
        e.anim.guard = 0.2;
    } else {
        e.state = 'chase';
        e.alert = ENFORCER.memory;
    }
    return 'hit';
}

function sees(e, player) {
    if (player.state === 'dead') return false;
    const dx = player.body.x - e.body.x;
    const dy = player.body.y - e.body.y;
    return Math.abs(dx) < ENFORCER.sight && Math.abs(dy) < 70;
}

function walk(e, dir, speed, dt) {
    const b = e.body;
    b.vx += dir * ENFORCER.accel * dt;
    if (Math.abs(b.vx) > speed) b.vx = dir * speed;
    if (dir !== 0) e.facing = dir;
}

function brake(e, dt) {
    const b = e.body;
    const f = ENFORCER.friction * dt;
    b.vx = Math.abs(b.vx) <= f ? 0 : b.vx - Math.sign(b.vx) * f;
}

/** Впереди обрыв или стена — разворачиваемся. Стражи не прыгают в пропасть. */
function edgeAhead(e, level) {
    const b = e.body;
    const ahead = b.x + e.facing * (b.w / 2 + 5);
    return !solidAtPoint(level, ahead, b.y + 6) || b.hitWall === e.facing;
}

export function updateEnforcer(e, level, player, dt) {
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
            walk(e, e.facing, ENFORCER.patrolSpeed, dt);
            e.anim.walk += Math.abs(b.vx) * dt * 0.1;
            if (sees(e, player)) {
                e.state = 'chase';
                e.alert = ENFORCER.memory;
                event = 'spot';
            }
            break;
        }

        case 'chase': {
            const dx = player.body.x - b.x;
            if (sees(e, player)) e.alert = ENFORCER.memory;
            if (e.alert <= 0) { e.state = 'patrol'; break; }

            const near = Math.abs(dx) <= ENFORCER.attackRange - 4;
            const level0 = Math.abs(player.body.y - b.y) < 40;
            if (near && level0 && e.cooldown <= 0) {
                e.facing = Math.sign(dx) || e.facing;
                e.state = 'windup';
                e.t = ENFORCER.windup;
                event = 'windup';
                brake(e, dt);
                break;
            }
            if (near) brake(e, dt);
            else if (b.onGround && edgeAhead(e, level) && Math.sign(dx) === e.facing) brake(e, dt);
            else walk(e, Math.sign(dx) || e.facing, ENFORCER.chaseSpeed, dt);
            e.anim.walk += Math.abs(b.vx) * dt * 0.1;
            break;
        }

        case 'windup': {
            brake(e, dt);
            e.t -= dt;
            if (e.t <= 0) { e.state = 'active'; e.t = ENFORCER.active; }
            break;
        }

        case 'active': {
            brake(e, dt);
            e.t -= dt;
            if (e.t <= 0) { e.state = 'recover'; e.t = ENFORCER.recover; }
            break;
        }

        case 'recover': {
            brake(e, dt);
            e.t -= dt;
            if (e.t <= 0) {
                e.state = 'chase';
                e.cooldown = ENFORCER.cooldown;
                e.alert = ENFORCER.memory;
            }
            break;
        }

        case 'guard': {
            // Гарда держит стража на месте: он закрылся, а не отступает.
            brake(e, dt);
            e.t -= dt;
            if (e.t <= 0) {
                e.state = 'chase';
                e.guardReady = ENFORCER.guardCooldown;
                e.cooldown = 0.25;
                e.alert = ENFORCER.memory;
            }
            break;
        }

        case 'dead': {
            e.t += dt;
            brake(e, dt * 0.5);
            break;
        }
    }

    b.vy = Math.min(ENFORCER.maxFall, b.vy + ENFORCER.gravity * dt);
    moveX(level, b, b.vx * dt);
    moveY(level, b, b.vy * dt);

    return event;
}
