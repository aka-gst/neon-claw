/**
 * Герой: движение, сабля, зацеп.
 *
 * Модуль без DOM — им же питаются тесты. Состояний намеренно мало:
 * `move` (земля и воздух — это одно состояние с разными коэффициентами),
 * `hang`, `climb`, `hurt`, `dead`. Каждое лишнее состояние в платформере
 * оборачивается парой невозможных переходов, которые всплывают через месяц.
 */

import { PLAYER, LEDGE, SWORD, STEP } from './tuning.js';
import { makeBody, moveX, moveY, findLedge } from './physics.js';

export function createPlayer(spawn) {
    return {
        body: makeBody(spawn.x, spawn.y, PLAYER.w, PLAYER.h),
        facing: 1,
        state: 'move',
        hp: PLAYER.hp,
        maxHp: PLAYER.hp,

        coyote: 0,
        buffer: 0,
        invuln: 0,
        dropLock: 0,
        hitstop: 0,
        controlLock: 0,
        jumpHeldPrev: false,
        /** Отпустил кнопку — прыжок обрезаем ровно один раз за прыжок. */
        cutUsed: true,

        attack: { phase: 'none', t: 0, hits: new Set() },
        ledge: null,
        climb: 0,

        anim: { run: 0, land: 0, swing: 0, hurtFlash: 0 },
        /** Что игрок должен услышать. Мир заберёт и очистит. */
        sfx: [],
        spawn: { ...spawn },
    };
}

/** Куда достаёт сабля в активной фазе. */
export function attackRect(p) {
    const b = p.body;
    return {
        x: p.facing > 0 ? b.x + 1 : b.x - 1 - SWORD.reach,
        y: b.y - b.h * 0.9,
        w: SWORD.reach,
        h: SWORD.height,
    };
}

export const isAttacking = (p) => p.attack.phase === 'active';
export const canBeHit = (p) => p.invuln <= 0 && p.state !== 'dead';

function startAttack(p) {
    if (p.attack.phase !== 'none') return;
    p.attack.phase = 'windup';
    p.attack.t = 0;
    p.attack.hits.clear();
    p.anim.swing = 0;
    p.sfx.push('swing');
}

function stepAttack(p, dt) {
    const a = p.attack;
    if (a.phase === 'none') return;
    a.t += dt;
    p.anim.swing += dt;
    const { windup, active, recover } = SWORD;
    if (a.phase === 'windup' && a.t >= windup) { a.phase = 'active'; a.t -= windup; }
    if (a.phase === 'active' && a.t >= active) { a.phase = 'recover'; a.t -= active; }
    if (a.phase === 'recover' && a.t >= recover) { a.phase = 'none'; a.t = 0; }
}

function horizontal(p, intent, dt) {
    const b = p.body;
    const dir = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
    // Замах сажает героя на месте: удар должен иметь вес, а не быть
    // бесплатной добавкой к бегу. В воздухе инерция остаётся — там своя цена.
    const swinging = p.attack.phase !== 'none' && b.onGround;
    const top = PLAYER.runSpeed * (swinging ? 0.35 : 1);

    if (dir !== 0 && p.controlLock <= 0) {
        p.facing = dir;
        const accel = b.onGround ? PLAYER.accel : PLAYER.airAccel;
        b.vx += dir * accel * dt;
        if (Math.abs(b.vx) > top) b.vx = dir * top;
    } else {
        const brake = (b.onGround ? PLAYER.friction : PLAYER.airDrag) * dt;
        b.vx = Math.abs(b.vx) <= brake ? 0 : b.vx - Math.sign(b.vx) * brake;
    }
}

function vertical(p, intent, dt) {
    const b = p.body;

    if (b.onGround) {
        p.coyote = PLAYER.coyote;
    } else {
        p.coyote = Math.max(0, p.coyote - dt);
    }
    p.buffer = Math.max(0, p.buffer - dt);
    if (intent.jumpDown) p.buffer = PLAYER.jumpBuffer;

    if (p.buffer > 0 && p.coyote > 0 && p.controlLock <= 0) {
        // Спрыгивание с помоста: «вниз + прыжок» отключает односторонние
        // тайлы на пару кадров — этого хватает, чтобы провалиться сквозь.
        if (intent.down) {
            b.dropTimer = 0.12;
        } else {
            b.vy = -PLAYER.jump;
            p.cutUsed = false;
            p.sfx.push('jump');
        }
        p.buffer = 0;
        p.coyote = 0;
    }

    if (!intent.jumpHeld && !p.cutUsed && b.vy < 0) {
        b.vy *= PLAYER.jumpCut;
        p.cutUsed = true;
    }

    const g = b.vy < 0 ? PLAYER.gravity : PLAYER.fallGravity;
    b.vy = Math.min(PLAYER.maxFall, b.vy + g * dt);
}

function tryLedge(p, level, intent) {
    const b = p.body;
    if (b.onGround || p.dropLock > 0 || p.attack.phase !== 'none') return false;
    // Уходишь от стены — не цепляешься. Иначе карниз ловит тех, кто явно
    // решил лететь мимо, и это читается как залипание.
    if ((intent.left && p.facing > 0) || (intent.right && p.facing < 0)) return false;

    const grab = findLedge(level, b, p.facing);
    if (!grab) return false;

    p.ledge = grab;
    p.state = 'hang';
    p.sfx.push('ledge');
    b.x = grab.hangX;
    b.y = grab.hangY;
    b.vx = 0;
    b.vy = 0;
    p.cutUsed = true;
    return true;
}

function updateHang(p, intent, dt) {
    const b = p.body;
    b.vx = 0;
    b.vy = 0;

    if (intent.down) {
        p.state = 'move';
        p.dropLock = LEDGE.dropLock;
        p.ledge = null;
        return;
    }
    // Прыжок с виса — это подтягивание, а не отдельный прыжок вверх:
    // за край держатся руками, значит наверх выбираются, а не взлетают.
    if (intent.jumpDown || intent.up) {
        p.state = 'climb';
        p.climb = LEDGE.climb;
        return;
    }
    const away = (intent.left && p.ledge.facing > 0) || (intent.right && p.ledge.facing < 0);
    if (away) {
        p.state = 'move';
        p.dropLock = LEDGE.dropLock;
        b.vx = -p.ledge.facing * 60;
        p.ledge = null;
    }
}

function updateClimb(p, dt) {
    p.climb -= dt;
    if (p.climb > 0) return;
    const b = p.body;
    b.x = p.ledge.standX;
    b.y = p.ledge.standY;
    b.vx = 0;
    b.vy = 0;
    p.state = 'move';
    p.ledge = null;
    p.dropLock = 0.05;
}

export function hurtPlayer(p, fromX, damage = 1) {
    if (!canBeHit(p)) return false;
    p.hp -= damage;
    p.invuln = PLAYER.invuln;
    p.controlLock = 0.18;
    p.anim.hurtFlash = 0.4;
    p.attack.phase = 'none';
    p.sfx.push('hurt');
    p.state = p.hp <= 0 ? 'dead' : 'move';
    p.ledge = null;
    const away = Math.sign(p.body.x - fromX) || -p.facing;
    p.body.vx = away * PLAYER.hurtKnockback.x;
    p.body.vy = -PLAYER.hurtKnockback.y;
    return true;
}

/** Отдача от звона о гарду. Урона нет — есть отказ и потерянный темп. */
export function pushPlayer(p, fromX, force) {
    const away = Math.sign(p.body.x - fromX) || -p.facing;
    p.body.vx = away * force;
    p.body.vy = Math.min(p.body.vy, -70);
}

export function updatePlayer(p, level, intent, dt) {
    if (p.hitstop > 0) {
        p.hitstop -= dt;
        return;
    }

    p.invuln = Math.max(0, p.invuln - dt);
    p.dropLock = Math.max(0, p.dropLock - dt);
    p.controlLock = Math.max(0, p.controlLock - dt);
    p.anim.hurtFlash = Math.max(0, p.anim.hurtFlash - dt);
    p.anim.land = Math.max(0, p.anim.land - dt);
    p.body.dropTimer = Math.max(0, p.body.dropTimer - dt);

    if (p.state === 'dead') {
        p.body.vy = Math.min(PLAYER.maxFall, p.body.vy + PLAYER.fallGravity * dt);
        moveY(level, p.body, p.body.vy * dt);
        return;
    }

    if (p.state === 'climb') {
        updateClimb(p, dt);
        return;
    }

    if (p.state === 'hang') {
        stepAttack(p, dt);
        updateHang(p, intent, dt);
        if (p.state === 'hang') return;
    }

    if (intent.attackDown && p.state === 'move' && p.controlLock <= 0) startAttack(p);
    stepAttack(p, dt);

    const wasAir = !p.body.onGround;
    horizontal(p, intent, dt);
    vertical(p, intent, dt);

    moveX(level, p.body, p.body.vx * dt);
    const fallingBefore = p.body.vy;
    moveY(level, p.body, p.body.vy * dt);

    if (wasAir && p.body.onGround && fallingBefore > 240) {
        p.anim.land = 0.16;
        p.sfx.push('land');
    }
    if (p.body.onGround) p.cutUsed = true;

    if (p.state === 'move' && p.body.vy > 0) tryLedge(p, level, intent);

    if (p.body.onGround && Math.abs(p.body.vx) > 12) p.anim.run += Math.abs(p.body.vx) * dt * 0.09;
    else if (p.body.onGround) p.anim.run += dt * 1.2;

    p.jumpHeldPrev = intent.jumpHeld;
}

export { STEP };
