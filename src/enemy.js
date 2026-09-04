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

import { ENFORCER, BLADES } from './tuning.js';
import { isOpen } from './combat.js';
import { makeBody, moveX, moveY } from './physics.js';
import { solidAtPoint, blocksSight } from './level.js';

export function createEnforcer(spawn, index = 0, rules = null) {
    const hp = rules?.hp ?? ENFORCER.hp;
    return {
        id: `enforcer-${index}`,
        /** Стихия стража. Видна формой знака, а не цветом. */
        element: spawn.element ?? 'heat',
        /** След чужой стихии на теле и сколько он ещё держится. */
        mark: null,
        markT: 0,
        lastRift: false,
        body: makeBody(spawn.x, spawn.y, ENFORCER.w, ENFORCER.h),
        facing: -1,
        hp,
        maxHp: hp,
        state: 'patrol',
        t: 0,
        /** Сколько ещё помнит игрока после потери из виду. */
        alert: 0,
        cooldown: 0,
        /** Копится, пока страж поворачивается. Разворот не мгновенный. */
        turning: 0,
        guardReady: 0,
        guardMax: ENFORCER.guard,
        hitstop: 0,
        flash: 0,
        anim: { walk: 0, guard: 0 },
        home: { ...spawn },
    };
}

export const isSwinging = (e) => e.state === 'active';
export const isGuarding = (e) => e.state === 'guard';
/** Заметил ли страж героя — для значка над головой. */
export const isAware = (e) => e.state !== 'patrol' && e.state !== 'dead';

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
    e.mark = null;
    e.markT = 0;
    e.hitstop = 0;
    e.flash = 0;
    e.facing = -1;
    e.turning = 0;
    e.body.x = e.home.x;
    e.body.y = e.home.y;
    e.body.vx = 0;
    e.body.vy = 0;
}

/**
 * Приход удара. Возвращает, что игрок услышал: снятие, звон или попадание.
 *
 * `opts` приходит из правил боя — см. `combat.js`. Здесь нет ни одного
 * решения о балансе, только исполнение чужих правил.
 */
export function hurtEnforcer(e, fromX, opts = {}) {
    if (e.state === 'dead') return 'none';
    const {
        parry = false, guard = 'meter', pierce = false,
        element = null, damage = BLADES.damage, factor = 1,
    } = opts;

    // Гарда держит клинок, но не стрелу: пробивающий удар её игнорирует.
    // Без этого закрывшийся страж становился неуязвим для лука, и лук
    // переставал быть ответом на глухую оборону.
    if (e.state === 'guard' && !pierce) {
        e.t = Math.min(e.guardMax, e.t + ENFORCER.guardExtend);
        // Звон подсвечивает ГАРДУ, а попадание — тело. Игрок должен видеть,
        // что именно остановило клинок, а не гадать по цвету искр.
        e.anim.guard = 0.3;
        return 'blocked';
    }

    // Собранный страж лобовую атаку просто не пускает. Открывается он
    // только собственным замахом — и это единственное окно.
    if (parry && !isOpen(e)) {
        e.anim.guard = 0.2;
        e.facing = Math.sign(fromX - e.body.x) || e.facing;
        return 'blocked';
    }

    // Раскол: две РАЗНЫЕ стихии по одной цели, пока держится след. Порядок
    // не важен — правило одно и запоминается с первого раза: «ударь двумя
    // разными — треснет». Платит раскол не столько уроном, сколько временем.
    const rift = Boolean(element && e.mark && e.mark !== element && e.markT > 0);

    // Смерть возвращается как 'dead' и затирает 'rift', поэтому факт
    // раскола держим на самом страже — рендеру и звуку он нужен и тогда,
    // когда этот же удар оказался последним.
    e.lastRift = rift;
    e.hp -= damage + (rift ? BLADES.riftBonus : 0);
    e.flash = rift ? 0.3 : 0.18;
    e.hitstop = rift ? 0.12 : 0.06;
    if (element) {
        e.mark = rift ? null : element;
        e.markT = rift ? 0 : BLADES.markTime;
    }
    // Удар разворачивает мгновенно: боль сама поворачивает голову.
    e.facing = Math.sign(fromX - e.body.x) || e.facing;
    e.turning = 0;
    e.body.vx = -e.facing * ENFORCER.knockback;

    if (e.hp <= 0) {
        e.state = 'dead';
        e.t = 0;
        e.body.vy = -180;
        return 'dead';
    }

    if (rift) {
        // Треснувший страж не закрывается — вот вся награда за реакцию.
        e.guardReady = BLADES.riftOpen;
        e.state = 'chase';
        e.alert = ENFORCER.memory;
        return 'rift';
    }

    if (factor >= BLADES.counter) {
        // Своей противоположностью гарда не поднимается вовсе: удары
        // цепляются друг за друга, и правильный клинок читается по темпу,
        // а не по циферке урона.
        e.state = 'chase';
        e.alert = ENFORCER.memory;
        return 'hit';
    }

    if (guard === 'meter' && e.guardReady <= 0) {
        e.state = 'guard';
        // Его же стихией — гарда встаёт сразу и держится дольше: клинок
        // вязнет, и это чувствуется временем, а не половинкой урона.
        e.guardMax = ENFORCER.guard * (factor <= BLADES.weak ? BLADES.guardSlam : 1);
        e.t = e.guardMax;
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
/**
 * Есть ли преграда между двумя точками. Помосты тоже считаются: стоящий
 * на мостике и стоящий под мостиком находятся в разных помещениях, даже
 * если между ними решётка.
 */
function blocked(level, ax, ay, bx, by) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 8);
    for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        if (blocksSight(level, ax + (bx - ax) * t, ay + (by - ay) * t)) return true;
    }
    return false;
}

/**
 * Поворот с задержкой. Мгновенный разворот отменял перекат за спину:
 * игрок оказывался сзади и в тот же кадр снова оказывался спереди.
 */
function face(e, dir, dt) {
    if (!dir || dir === e.facing) {
        e.turning = 0;
        return;
    }
    e.turning += dt;
    if (e.turning >= ENFORCER.turnTime) {
        e.facing = dir;
        e.turning = 0;
    }
}

/**
 * Страж замечает героя в пределах дальности и примерно на своей высоте —
 * но не сквозь стену. Прятаться за угол осталось, красться — нет: это
 * платформер с фехтованием, а не стелс.
 */
function sees(e, player, level) {
    if (player.state === 'dead') return false;
    const dx = player.body.x - e.body.x;
    const dy = player.body.y - e.body.y;
    if (Math.abs(dx) >= ENFORCER.sight || Math.abs(dy) >= ENFORCER.sightRise) return false;
    return !blocked(level, e.body.x, e.body.y - e.body.h * 0.78,
        player.body.x, player.body.y - player.body.h * 0.5);
}

function walk(e, dir, speed, dt) {
    const b = e.body;
    // Пока разворачивается — не едет: разворот должен быть виден.
    if (dir !== e.facing) {
        face(e, dir, dt);
        brake(e, dt);
        return;
    }
    b.vx += dir * ENFORCER.accel * dt;
    if (Math.abs(b.vx) > speed) b.vx = dir * speed;
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
    e.markT = Math.max(0, e.markT - dt);
    if (e.markT === 0) e.mark = null;
    e.alert = Math.max(0, e.alert - dt);

    let event = null;

    switch (e.state) {
        case 'patrol': {
            if (b.onGround && edgeAhead(e, level)) face(e, -e.facing, ENFORCER.turnTime);
            walk(e, e.facing, ENFORCER.patrolSpeed, dt);
            e.anim.walk += Math.abs(b.vx) * dt * 0.1;
            if (sees(e, player, level)) {
                e.state = 'chase';
                e.alert = ENFORCER.memory;
                event = 'spot';
            }
            break;
        }

        case 'chase': {
            const dx = player.body.x - b.x;
            if (sees(e, player, level)) e.alert = ENFORCER.memory;
            if (e.alert <= 0) { e.state = 'patrol'; break; }

            const near = Math.abs(dx) <= ENFORCER.attackRange - 4;
            const level0 = Math.abs(player.body.y - b.y) < 40;
            if (near && level0 && e.cooldown <= 0 && Math.sign(dx) === e.facing) {
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
