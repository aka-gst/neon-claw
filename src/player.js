/**
 * Герой: движение, паркур, клинок.
 *
 * Модуль без DOM — им же питаются тесты. Состояния держатся в узде
 * намеренно: каждое лишнее в платформере оборачивается парой невозможных
 * переходов, которые всплывают через месяц.
 *
 *   move   бег, прыжок и падение — это одно состояние с разными коэффициентами
 *   wall   сползание по стене
 *   hang   вис на кромке
 *   climb  подтягивание (управление заблокировано)
 *   dash   рывок
 *   slide  подкат
 *   dead   —
 *
 * Глаголов движения ровно столько, чтобы вертикаль была дорогой, а не
 * препятствием: зацеп берёт три тайла, стена — любую высоту зигзагом,
 * рывок — четыре тайла провала, подкат — щель в один тайл.
 */

import { PLAYER, LEDGE, SWORD, WALL, DASH, SLIDE, BOW, STEP } from './tuning.js';
import { makeBody, moveX, moveY, findLedge, wallSide, headroom } from './physics.js';

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
        /** Толчок от стены не должен отменяться зажатой к стене клавишей. */
        pushLock: 0,
        cutUsed: true,

        wall: 0,
        wallCoyote: 0,
        /** Сторона, с которой только что оттолкнулись, и запрет на возврат. */
        lastWall: 0,
        wallLock: 0,
        dashReady: true,
        dashTimer: 0,
        dashCooldown: 0,
        slideTimer: 0,

        attack: { phase: 'none', t: 0, hits: new Set() },
        /** Лук: натяжение, угол и колчан. `release` мир забирает и обнуляет. */
        bow: { drawing: false, t: 0, power: 0, angle: 0, arrows: BOW.arrows, release: null },
        ledge: null,
        climb: 0,

        anim: { run: 0, land: 0, swing: 0, hurtFlash: 0, dash: 0 },
        sfx: [],
        spawn: { ...spawn },
    };
}

/** Куда достаёт клинок в активной фазе. */
export function attackRect(p) {
    const b = p.body;
    return {
        x: p.facing > 0 ? b.x + 1 : b.x - 1 - SWORD.reach,
        y: b.y - b.h * 0.9 - (p.state === 'slide' ? 6 : 0),
        w: SWORD.reach,
        h: SWORD.height,
    };
}

export const isAttacking = (p) => p.attack.phase === 'active';
export const canBeHit = (p) => p.invuln <= 0 && p.state !== 'dead';

/* ------------------------------------------------------------------- клинок */

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

/* ---------------------------------------------------------------------- лук */

/**
 * Куда целиться. У лука нет своего направления — он берёт его у движения:
 * стрелки на клавиатуре, наклон стика на телефоне. Без ввода стреляет
 * почти горизонтально вперёд: это самый частый выстрел, и он не должен
 * требовать отдельного действия.
 */
function aimAngle(p, intent) {
    let ax = intent.aimX ?? 0;
    let ay = intent.aimY ?? 0;
    if (Math.abs(ax) < 0.2 && Math.abs(ay) < 0.2) return p.facing > 0 ? -0.12 : Math.PI + 0.12;
    if (Math.abs(ax) < 0.2) ax = p.facing * 0.3;
    return Math.atan2(ay, ax);
}

function stepBow(p, intent, dt) {
    const bow = p.bow;

    if (!intent.bowHeld) {
        if (!bow.drawing) return;
        bow.drawing = false;
        // Случайное касание не должно стоить стрелы: слишком короткое
        // натяжение отменяет выстрел, а не тратит его впустую.
        if (bow.power < 0.18 || bow.arrows <= 0) {
            bow.t = 0;
            bow.power = 0;
            return;
        }
        bow.release = { angle: bow.angle, power: bow.power };
        bow.arrows -= 1;
        bow.t = 0;
        p.sfx.push('bow.release');
        return;
    }

    if (bow.arrows <= 0 || p.attack.phase !== 'none') return;
    if (!bow.drawing) {
        bow.drawing = true;
        bow.t = 0;
        p.sfx.push('bow.draw');
    }
    bow.t = Math.min(BOW.drawTime, bow.t + dt);
    bow.power = intent.aimPower != null
        ? Math.min(1, intent.aimPower)
        : Math.min(1, bow.t / BOW.drawTime);
    bow.angle = aimAngle(p, intent);
    // Целишься назад — разворачиваешься. Стрелять из-за спины нельзя.
    const facing = Math.cos(bow.angle) >= 0 ? 1 : -1;
    if (Math.abs(intent.aimX ?? 0) > 0.2) p.facing = facing;
}

/** Натяжение отменяется всем, что уносит героя с места. */
function cancelBow(p) {
    p.bow.drawing = false;
    p.bow.t = 0;
    p.bow.power = 0;
}

/* ------------------------------------------------------------------ движение */

function horizontal(p, intent, dt) {
    const b = p.body;
    const dir = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
    const swinging = p.attack.phase !== 'none' && b.onGround;
    // Натяжение почти укореняет: лук не для бега, и это его главная цена.
    const drawn = p.bow.drawing ? BOW.drawSpeed : 1;
    const top = PLAYER.runSpeed * (swinging ? 0.35 : 1) * drawn;

    // Отдача и толчок от стены — это не бег, а бросок: пока они длятся,
    // ни разгон, ни трение к ним не применяются.
    if (p.controlLock > 0 || p.pushLock > 0) return;

    if (dir === 0) {
        const brake = (b.onGround ? PLAYER.friction : PLAYER.airDrag) * dt;
        b.vx = Math.abs(b.vx) <= brake ? 0 : b.vx - Math.sign(b.vx) * brake;
        return;
    }

    p.facing = dir;
    const along = b.vx * dir;
    if (along < top) {
        const accel = b.onGround ? PLAYER.accel : PLAYER.airAccel;
        b.vx += dir * accel * dt;
        if (b.vx * dir > top) b.vx = dir * top;
    } else {
        // Быстрее беговой герой едет только по инерции рывка. Она гасится,
        // но не обрывается: иначе рывок кончается как удар в стену.
        b.vx = dir * Math.max(top, along - DASH.exit * dt);
    }
}

function vertical(p, intent, dt) {
    const b = p.body;

    p.coyote = b.onGround ? PLAYER.coyote : Math.max(0, p.coyote - dt);
    p.wallCoyote = Math.max(0, p.wallCoyote - dt);
    p.buffer = Math.max(0, p.buffer - dt);
    if (intent.jumpDown) p.buffer = PLAYER.jumpBuffer;

    if (p.buffer > 0 && p.controlLock <= 0) {
        if (p.coyote > 0) {
            if (intent.down) {
                b.dropTimer = 0.12;
            } else {
                b.vy = -PLAYER.jump;
                p.cutUsed = false;
                p.sfx.push('jump');
            }
            p.buffer = 0;
            p.coyote = 0;
        } else if (p.wallCoyote > 0 && p.wall !== 0) {
            // Толчок от стены: вверх слабее обычного прыжка, зато вбок.
            b.vy = -WALL.jumpY;
            b.vx = -p.wall * WALL.jumpX;
            p.facing = -p.wall;
            p.pushLock = WALL.lock;
            p.cutUsed = false;
            p.wallCoyote = 0;
            p.lastWall = p.wall;
            p.wallLock = WALL.sameWallLock;
            p.wall = 0;
            p.buffer = 0;
            p.dashReady = true;
            p.sfx.push('walljump');
        }
    }

    if (!intent.jumpHeld && !p.cutUsed && b.vy < 0) {
        b.vy *= PLAYER.jumpCut;
        p.cutUsed = true;
    }

    const g = b.vy < 0 ? PLAYER.gravity : PLAYER.fallGravity;
    b.vy = Math.min(PLAYER.maxFall, b.vy + g * dt);
}

/* -------------------------------------------------------------------- стена */

function tryWall(p, level, intent) {
    const b = p.body;
    // Ловим и на взлёте тоже: требовать попадания в апекс — жестоко, а
    // именно на этом зигзаг у живого игрока и разваливался.
    if (b.onGround || b.vy < -WALL.catchRise || p.state !== 'move') return false;
    const side = wallSide(level, b);
    if (side === 0) return false;
    // На ту же стену сразу возвращаться нельзя — иначе по ней лезут вверх.
    if (p.wallLock > 0 && side === p.lastWall) return false;
    // Прижаться — сознательное действие: клавиша в сторону стены.
    if (!((side > 0 && intent.right) || (side < 0 && intent.left))) return false;

    p.state = 'wall';
    p.wall = side;
    p.facing = side;
    p.wallCoyote = WALL.coyote;
    p.dashReady = true;
    p.cutUsed = true;
    return true;
}

function updateWall(p, level, intent, dt) {
    const b = p.body;
    p.wallCoyote = WALL.coyote;
    p.buffer = Math.max(0, p.buffer - dt);
    if (intent.jumpDown) p.buffer = PLAYER.jumpBuffer;

    // Держаться не надо: прижался — висишь, пока сам не оттолкнёшься или
    // не поведёшь в другую сторону. Требование зажимать клавишу к стене
    // съедало палец, который в этот же момент нужен на прыжке.
    const leaving = (p.wall > 0 && intent.left) || (p.wall < 0 && intent.right);
    const stillWall = wallSide(level, b) === p.wall;

    if (p.buffer > 0) {
        b.vy = -WALL.jumpY;
        b.vx = -p.wall * WALL.jumpX;
        p.facing = -p.wall;
        p.pushLock = WALL.lock;
        p.cutUsed = false;
        p.state = 'move';
        p.lastWall = p.wall;
        p.wallLock = WALL.sameWallLock;
        p.wall = 0;
        p.buffer = 0;
        p.wallCoyote = 0;
        p.sfx.push('walljump');
        return;
    }

    if (leaving || !stillWall) {
        // Сторону НЕ обнуляем: на ней держится койот-окно, а срыв со
        // стены — ровно тот случай, ради которого оно и заведено.
        p.state = 'move';
        return;
    }

    b.vx = 0;
    b.vy = Math.min(WALL.slide, b.vy + PLAYER.fallGravity * dt);
    moveY(level, b, b.vy * dt);
    if (b.onGround) {
        p.state = 'move';
        p.wall = 0;
    }
}

/* -------------------------------------------------------------------- рывок */

function tryDash(p, intent, level) {
    if (!intent.dashDown || p.dashCooldown > 0 || p.controlLock > 0) return false;
    if (p.state !== 'move' && p.state !== 'wall') return false;

    if (intent.down && p.body.onGround) {
        p.state = 'slide';
        p.slideTimer = SLIDE.max;
        p.body.h = SLIDE.height;
        p.body.vx = p.facing * Math.max(SLIDE.speed, Math.abs(p.body.vx));
        p.attack.phase = 'none';
        p.sfx.push('slide');
        return true;
    }

    if (!p.dashReady) return false;
    if (p.state === 'wall') p.facing = -p.wall;
    p.state = 'dash';
    p.wall = 0;
    cancelBow(p);
    p.dashTimer = DASH.time;
    p.dashReady = false;
    p.dashCooldown = DASH.cooldown;
    p.body.vx = p.facing * DASH.speed;
    p.body.vy = 0;
    p.attack.phase = 'none';
    p.anim.dash = 0;
    // Перекат: сквозь замах можно пройти, но только в начале рывка.
    p.invuln = Math.max(p.invuln, DASH.invuln);
    p.sfx.push('dash');
    return true;
}

function updateDash(p, level, dt) {
    const b = p.body;
    p.dashTimer -= dt;
    p.anim.dash += dt;
    b.vy = 0;
    b.vx = p.facing * DASH.speed;
    moveX(level, b, b.vx * dt);
    moveY(level, b, 0);
    if (b.hitWall !== 0 || p.dashTimer <= 0) {
        p.state = 'move';
        b.vx = p.facing * PLAYER.runSpeed * (b.hitWall !== 0 ? 0 : 1.15);
    }
}

/* ------------------------------------------------------------------- подкат */

function updateSlide(p, level, intent, dt) {
    const b = p.body;
    p.slideTimer -= dt;

    const brake = SLIDE.friction * dt;
    b.vx = Math.abs(b.vx) <= brake ? 0 : b.vx - Math.sign(b.vx) * brake;
    b.vy = Math.min(PLAYER.maxFall, b.vy + PLAYER.fallGravity * dt);

    moveX(level, b, b.vx * dt);
    moveY(level, b, b.vy * dt);

    const done = p.slideTimer <= 0 || Math.abs(b.vx) < SLIDE.minSpeed || b.hitWall !== 0;
    if (!done) return;

    // Под низким потолком подкат не заканчивается: встать некуда.
    if (!headroom(level, b, PLAYER.h)) {
        p.slideTimer = 0.1;
        if (Math.abs(b.vx) < SLIDE.minSpeed) b.vx = p.facing * SLIDE.minSpeed;
        return;
    }
    b.h = PLAYER.h;
    p.state = 'move';
}

/* --------------------------------------------------------------- вис и урон */

function tryLedge(p, level, intent) {
    const b = p.body;
    if (b.onGround || p.dropLock > 0 || p.attack.phase !== 'none') return false;
    if ((intent.left && p.facing > 0) || (intent.right && p.facing < 0)) return false;

    const grab = findLedge(level, b, p.facing);
    if (!grab) return false;

    p.ledge = grab;
    p.state = 'hang';
    cancelBow(p);
    p.wall = 0;
    b.x = grab.hangX;
    b.y = grab.hangY;
    b.vx = 0;
    b.vy = 0;
    p.cutUsed = true;
    p.dashReady = true;
    p.sfx.push('ledge');
    return true;
}

function updateHang(p, intent) {
    const b = p.body;
    b.vx = 0;
    b.vy = 0;

    if (intent.down) {
        p.state = 'move';
        p.dropLock = LEDGE.dropLock;
        p.ledge = null;
        return;
    }
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
    cancelBow(p);
    p.body.h = PLAYER.h;
    p.state = p.hp <= 0 ? 'dead' : 'move';
    p.ledge = null;
    p.wall = 0;
    p.sfx.push('hurt');
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

/* --------------------------------------------------------------------- шаг */

export function updatePlayer(p, level, intent, dt) {
    if (p.hitstop > 0) {
        p.hitstop -= dt;
        return;
    }

    p.invuln = Math.max(0, p.invuln - dt);
    p.dropLock = Math.max(0, p.dropLock - dt);
    p.controlLock = Math.max(0, p.controlLock - dt);
    p.pushLock = Math.max(0, p.pushLock - dt);
    p.wallLock = Math.max(0, p.wallLock - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.anim.hurtFlash = Math.max(0, p.anim.hurtFlash - dt);
    p.anim.land = Math.max(0, p.anim.land - dt);
    p.body.dropTimer = Math.max(0, p.body.dropTimer - dt);

    if (p.state === 'dead') {
        p.body.vy = Math.min(PLAYER.maxFall, p.body.vy + PLAYER.fallGravity * dt);
        moveY(level, p.body, p.body.vy * dt);
        return;
    }

    if (p.state === 'climb') return updateClimb(p, dt);
    if (p.state === 'dash') return updateDash(p, level, dt);
    if (p.state === 'slide') {
        if (intent.jumpDown && headroom(level, p.body, PLAYER.h)) {
            p.body.h = PLAYER.h;
            p.state = 'move';
            p.buffer = PLAYER.jumpBuffer;
        } else {
            return updateSlide(p, level, intent, dt);
        }
    }

    if (p.state === 'hang') {
        updateHang(p, intent);
        if (p.state === 'hang') return;
    }

    if (tryDash(p, intent, level)) return;

    if (p.state === 'wall') {
        stepAttack(p, dt);
        updateWall(p, level, intent, dt);
        if (p.state === 'wall') return;
    }

    if (intent.attackDown && p.state === 'move' && p.controlLock <= 0) {
        cancelBow(p);
        startAttack(p);
    }
    stepAttack(p, dt);
    if (p.state === 'move' && p.controlLock <= 0) stepBow(p, intent, dt);

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
    if (p.body.onGround) {
        p.cutUsed = true;
        p.dashReady = true;
        p.wall = 0;
        p.lastWall = 0;
    }

    if (p.state === 'move') {
        // Кромку ловим только на падении — она про руки. Стену и на
        // взлёте: требовать попадания в апекс жестоко.
        const caught = p.body.vy > 0 && tryLedge(p, level, intent);
        if (!caught && p.body.vy > -WALL.catchRise) tryWall(p, level, intent);
    }

    if (p.body.onGround && Math.abs(p.body.vx) > 12) p.anim.run += Math.abs(p.body.vx) * dt * 0.09;
    else if (p.body.onGround) p.anim.run += dt * 1.2;
}

export { STEP };
