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

import { ENFORCER, NOISE, LIGHT } from './tuning.js';
import { isOpen } from './combat.js';
import { makeBody, moveX, moveY } from './physics.js';
import { solidAtPoint } from './level.js';

export function createEnforcer(spawn, index = 0, rules = null) {
    const hp = rules?.hp ?? ENFORCER.hp;
    return {
        id: `enforcer-${index}`,
        body: makeBody(spawn.x, spawn.y, ENFORCER.w, ENFORCER.h),
        facing: -1,
        hp,
        maxHp: hp,
        state: 'patrol',
        t: 0,
        /** Сколько ещё помнит игрока после потери из виду. */
        alert: 0,
        cooldown: 0,
        /** Куда идти проверять шум. null — ничего не слышал. */
        suspect: null,
        scan: 0,
        guardReady: 0,
        hitstop: 0,
        flash: 0,
        anim: { walk: 0, guard: 0 },
        home: { ...spawn },
    };
}

export const isSwinging = (e) => e.state === 'active';
export const isGuarding = (e) => e.state === 'guard';

/** Настроение стража одним словом — для значка над головой и цвета конуса. */
export function moodOf(e) {
    if (e.state === 'dead') return 'dead';
    if (e.alert > 0 || e.state === 'chase' || OPEN.has(e.state) || e.state === 'guard') return 'alert';
    if (e.state === 'suspect') return 'suspect';
    return 'calm';
}

const OPEN = new Set(['windup', 'active', 'recover']);

/**
 * Услышанный шум. Стены его не держат — в этом весь смысл: зрение
 * перекрывается геометрией, слух нет. Возвращает true только на свежем
 * переполохе, чтобы мир не звенел значком на каждом шаге игрока.
 */
export function hearNoise(e, x, y, radius) {
    if (e.state === 'dead' || radius <= 0) return false;
    const d = Math.hypot(x - e.body.x, y - (e.body.y - e.body.h / 2));
    if (d > radius) return false;

    // Тот, кто уже дерётся или гонится, шумом не удивишь — только продлишь память.
    if (e.state === 'chase' || e.state === 'guard' || OPEN.has(e.state)) {
        e.alert = ENFORCER.memory;
        return false;
    }

    const fresh = e.state !== 'suspect';
    e.state = 'suspect';
    e.suspect = { x, y };
    e.t = NOISE.investigate;
    e.scan = 0.55;
    return fresh;
}

export function enforcerAttackRect(e) {
    const b = e.body;
    return {
        x: e.facing > 0 ? b.x + 1 : b.x - 1 - ENFORCER.attackRange,
        y: b.y - b.h * 0.9,
        w: ENFORCER.attackRange,
        h: 24,
    };
}

/** Поднять убитого обратно: комната — это задача, и решать её надо целиком. */
export function reviveEnforcer(e, rules = null) {
    const hp = rules?.hp ?? e.maxHp;
    e.hp = hp;
    e.maxHp = hp;
    e.state = 'patrol';
    e.t = 0;
    e.alert = 0;
    e.cooldown = 0;
    e.guardReady = 0;
    e.hitstop = 0;
    e.flash = 0;
    e.facing = -1;
    e.suspect = null;
    e.scan = 0;
    e.body.x = e.home.x;
    e.body.y = e.home.y;
    e.body.vx = 0;
    e.body.vy = 0;
}

/**
 * Приход удара. Возвращает, что игрок услышал: снятие, звон или попадание.
 *
 * `opts` приходит из режима боя — см. `combat.js`. Здесь нет ни одного
 * решения о балансе, только исполнение чужих правил.
 */
export function hurtEnforcer(e, fromX, opts = {}) {
    if (e.state === 'dead') return 'none';
    const { takedown = false, parry = false, guard = 'meter' } = opts;

    // Снятие. Ни гарда, ни здоровье тут не участвуют — в этом весь смысл
    // захода со спины: он отменяет бой, а не выигрывает его.
    if (takedown) {
        e.hp = 0;
        e.state = 'dead';
        e.t = 0;
        e.flash = 0.22;
        e.body.vy = -140;
        e.body.vx = (Math.sign(e.body.x - fromX) || 1) * 70;
        return 'takedown';
    }

    if (e.state === 'guard') {
        e.t = Math.min(ENFORCER.guard, e.t + ENFORCER.guardExtend);
        e.anim.guard = 0.18;
        return 'blocked';
    }

    // Собранный страж лобовую атаку просто не пускает. Открывается он
    // только собственным замахом — и это единственное окно.
    if (parry && !isOpen(e)) {
        e.anim.guard = 0.2;
        e.facing = Math.sign(fromX - e.body.x) || e.facing;
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

    if (guard === 'meter' && e.guardReady <= 0) {
        e.state = 'guard';
        e.t = ENFORCER.guard;
        e.anim.guard = 0.2;
    } else {
        e.state = 'chase';
        e.alert = ENFORCER.memory;
    }
    return 'hit';
}

/**
 * Зрение. Первый кирпич стелса и обязательное условие для снятия со спины:
 * пока страж разворачивался к игроку в тот же кадр, когда тот появлялся в
 * радиусе, «зайти сзади» было физически невозможно.
 *
 * Спиной не видят вовсе. Заметив однажды, помнят и следят — развернулись.
 */
/** Есть ли камень между двумя точками. Шаг в треть тайла — стены толще. */
function blocked(level, ax, ay, bx, by) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 8);
    for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        if (solidAtPoint(level, ax + (bx - ax) * t, ay + (by - ay) * t)) return true;
    }
    return false;
}

function sees(e, player, level) {
    if (player.state === 'dead') return false;
    const dx = player.body.x - e.body.x;
    const dy = player.body.y - e.body.y;
    // Тьма — ресурс: в ней стража подпускают вчетверо ближе.
    const lit = player.lit ?? 1;
    const reach = ENFORCER.sight * (LIGHT.darkSight + (1 - LIGHT.darkSight) * lit);
    if (Math.abs(dx) >= reach) return false;
    // Заметив однажды, страж следит и за спиной: он развернулся.
    if (e.alert > 0) {
        return Math.abs(dy) < 70 && !blocked(level, e.body.x, e.body.y - e.body.h * 0.78,
            player.body.x, player.body.y - player.body.h * 0.5);
    }
    if (Math.sign(dx) !== e.facing) return false;
    if (Math.abs(dy) >= ENFORCER.coneNear + Math.abs(dx) * ENFORCER.coneSpread) return false;
    // Сквозь стену не видят. Из-за этого геометрия уровня начинает работать
    // на стелс: угол здания — это укрытие, а не просто препятствие.
    return !blocked(level, e.body.x, e.body.y - e.body.h * 0.78,
        player.body.x, player.body.y - player.body.h * 0.5);
}

/**
 * Границы конуса для отрисовки. Картинка обязана совпадать с правилом,
 * поэтому конус укорачивается о ближайшую стену так же, как и взгляд.
 */
export function sightCone(e, level, lit = 1) {
    const eye = { x: e.body.x, y: e.body.y - e.body.h * 0.78 };
    let far = ENFORCER.sight * (LIGHT.darkSight + (1 - LIGHT.darkSight) * lit);
    if (level) {
        for (let d = 8; d <= far; d += 8) {
            if (solidAtPoint(level, eye.x + e.facing * d, eye.y)) { far = d - 8; break; }
        }
    }
    const half = ENFORCER.coneNear + far * ENFORCER.coneSpread;
    return { eye, far, near: ENFORCER.coneNear, half, facing: e.facing };
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
            if (sees(e, player, level)) {
                e.state = 'chase';
                e.alert = ENFORCER.memory;
                event = 'spot';
            }
            break;
        }

        case 'suspect': {
            // Идёт на звук, а дойдя — осматривается. Ровно столько ума,
            // сколько нужно, чтобы шум был решением игрока, а не фоном.
            if (sees(e, player, level)) {
                e.state = 'chase';
                e.alert = ENFORCER.memory;
                event = 'spot';
                break;
            }
            e.t -= dt;
            const dx = (e.suspect?.x ?? b.x) - b.x;
            if (Math.abs(dx) > 12 && e.t > 0.9) {
                if (b.onGround && edgeAhead(e, level) && Math.sign(dx) === e.facing) brake(e, dt);
                else walk(e, Math.sign(dx) || e.facing, ENFORCER.patrolSpeed * 1.35, dt);
            } else {
                brake(e, dt);
                e.scan -= dt;
                if (e.scan <= 0) {
                    e.facing = -e.facing;
                    e.scan = 0.7;
                }
            }
            e.anim.walk += Math.abs(b.vx) * dt * 0.1;
            if (e.t <= 0) {
                e.state = 'patrol';
                e.suspect = null;
            }
            break;
        }

        case 'chase': {
            const dx = player.body.x - b.x;
            if (sees(e, player, level)) e.alert = ENFORCER.memory;
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
