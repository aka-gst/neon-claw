/**
 * Мир: уровень, герой, стражи, добро — и правила их встречи.
 *
 * Здесь нет отрисовки. Всё, что должно быть видно, мир складывает в
 * `sparks` и `flashes`: рендер потом это проигрывает. Тот же приём, что и
 * в «Битве Стихий» — событие сначала данные, и только потом картинка.
 */

import { TILE, SWORD, ENFORCER, LOOT, PLAYER, CAMERA } from './tuning.js';
import { parseLevel, levelPixelHeight } from './level.js';
import { overlaps, bodyRect } from './physics.js';
import { createPlayer, updatePlayer, attackRect, isAttacking, hurtPlayer, pushPlayer } from './player.js';
import {
    createEnforcer, updateEnforcer, enforcerAttackRect, isSwinging, hurtEnforcer, reviveEnforcer,
} from './enemy.js';
import { getMode, strikeKind, DEFAULT_MODE } from './combat.js';

export function createWorld(rows, modeId = DEFAULT_MODE) {
    const level = parseLevel(rows);
    const mode = getMode(modeId);
    const player = createPlayer(level.spawn);
    player.hp = mode.player.hp;
    player.maxHp = mode.player.hp;
    return {
        level,
        mode,
        player,
        enemies: level.enemies.map((e, i) => createEnforcer(e, i, mode.enemy)),
        loot: level.loot.map((l, i) => ({ ...l, id: i, taken: false, bob: i * 0.7, vx: 0, vy: 0 })),
        sparks: [],
        /** Очередь звуков за шаг. Мир не знает, как они звучат. */
        events: [],
        score: 0,
        collected: 0,
        totalLoot: level.loot.length,
        phase: 'play',
        time: 0,
        shake: 0,
        /** Тикает, пока герой скребёт когтями по стене. */
        scrape: 0,
        lastSafe: { ...level.spawn },
        /** Куда откатывает смерть в режимах с мгновенным рестартом. */
        checkpoint: { ...level.spawn },
        reached: new Set(),
        attempts: 1,
        takedowns: 0,
        /** Пауза после смерти: без неё откат не читается как событие. */
        freeze: 0,
        notice: null,
    };
}

function spark(world, x, y, count, color, spread = 120, life = 0.35) {
    for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + world.time * 3;
        const s = spread * (0.4 + ((i * 37) % 10) / 10);
        world.sparks.push({
            x, y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s - 40,
            life,
            max: life,
            color,
        });
    }
}

function say(world, text, seconds = 2.4) {
    world.notice = { text, t: seconds };
}

function playerAttacks(world) {
    const p = world.player;
    if (!isAttacking(p)) return;
    const blade = attackRect(p);

    for (const e of world.enemies) {
        if (e.state === 'dead' || p.attack.hits.has(e.id)) continue;
        if (!overlaps(blade, bodyRect(e.body))) continue;

        p.attack.hits.add(e.id);
        const rules = world.mode;
        const kind = strikeKind(p, e);
        const takedown = Boolean(rules.takedown[kind]);
        const result = hurtEnforcer(e, p.body.x, {
            takedown,
            parry: rules.enemy.parry,
            guard: rules.enemy.guard,
        });
        const mid = { x: (blade.x + blade.w / 2 + e.body.x) / 2, y: e.body.y - e.body.h / 2 };

        if (result === 'takedown') {
            // Снятие тихое и мгновенное: это не победа в бою, а его отмена.
            spark(world, e.body.x, e.body.y - e.body.h / 2, 16, '#4dffb8', 200, 0.45);
            world.events.push('takedown');
            world.score += 150;
            world.takedowns += 1;
            p.hitstop = SWORD.hitstop * 1.4;
            world.shake = Math.max(world.shake, 5);
            say(world, kind === 'above' ? 'Сверху. Он даже не обернулся.' : 'Со спины. Чисто.', 1.4);
        } else if (result === 'blocked') {
            // Звон — это отказ, и он должен ощущаться отказом: отдача,
            // потерянный темп и ни единицы урона.
            spark(world, mid.x, mid.y, 12, '#9ad8ff', 200, 0.3);
            world.events.push('clang');
            pushPlayer(p, e.body.x, ENFORCER.clangKnockback);
            p.hitstop = SWORD.hitstop;
            world.shake = Math.max(world.shake, 3);
            say(world, world.mode.enemy.parry
                ? 'В лоб не берётся. Зайди со спины или вымани замах.'
                : 'Гарда. Выжди — она не вечная.', 1.8);
        } else {
            spark(world, mid.x, mid.y, 14, '#ff2d95', 260, 0.34);
            world.events.push(result === 'dead' ? 'kill' : 'hit');
            p.hitstop = SWORD.hitstop;
            world.shake = Math.max(world.shake, result === 'dead' ? 7 : 4);
            if (!p.body.onGround) p.body.vy = Math.min(p.body.vy, -SWORD.airLift);
            if (result === 'dead') {
                world.score += 100;
                spark(world, e.body.x, e.body.y - e.body.h / 2, 22, '#ffc857', 300, 0.6);
            }
        }
    }
}

function enemiesAttack(world) {
    const p = world.player;
    const rect = bodyRect(p.body);
    for (const e of world.enemies) {
        if (!isSwinging(e)) continue;
        if (!overlaps(enforcerAttackRect(e), rect)) continue;
        if (hurtPlayer(p, e.body.x, ENFORCER.damage)) {
            world.shake = Math.max(world.shake, 6);
            spark(world, p.body.x, p.body.y - p.body.h / 2, 16, '#ff5470', 240, 0.4);
        }
    }
}

function pickLoot(world, dt) {
    const p = world.player;
    for (const item of world.loot) {
        if (item.taken) continue;
        const dx = p.body.x - item.x;
        const dy = (p.body.y - p.body.h / 2) - item.y;
        const dist = Math.hypot(dx, dy);

        // Притяжение вблизи: за добром не должно хотеться прицеливаться.
        if (dist < LOOT.magnet) {
            const pull = (1 - dist / LOOT.magnet) * 420;
            item.x += (dx / (dist || 1)) * pull * dt;
            item.y += (dy / (dist || 1)) * pull * dt;
        }
        if (dist < LOOT.pickup) {
            item.taken = true;
            world.collected += 1;
            world.score += item.kind === 'core' ? LOOT.core : LOOT.chip;
            spark(world, item.x, item.y, item.kind === 'core' ? 18 : 8, '#ffc857', 180, 0.4);
            world.events.push(item.kind === 'core' ? 'core' : 'pickup');
            if (item.kind === 'core') {
                world.shake = Math.max(world.shake, 4);
                say(world, 'Ядро. Такие лежат там, куда не ведёт дорога.');
            }
        }
    }
}

function respawnIfFallen(world) {
    const p = world.player;
    if (p.body.y < levelPixelHeight(world.level) + TILE * 2) return;
    p.hp -= 1;
    p.invuln = PLAYER.invuln;
    p.anim.hurtFlash = 0.4;
    p.body.x = world.lastSafe.x;
    p.body.y = world.lastSafe.y;
    p.body.vx = 0;
    p.body.vy = 0;
    p.body.h = PLAYER.h;
    p.state = p.hp <= 0 ? 'dead' : 'move';
    world.shake = Math.max(world.shake, 6);
    world.events.push('fall');
}

/**
 * Чекпоинты. Берутся только вперёд: вернуться и «переоткрыть» ранний
 * нельзя, иначе откат начнёт наказывать за исследование.
 */
function takeCheckpoint(world) {
    const p = world.player.body;
    world.level.checkpoints.forEach((c, i) => {
        if (world.reached.has(i)) return;
        if (Math.abs(p.x - c.x) > TILE || Math.abs(p.y - c.y) > TILE * 1.5) return;
        world.reached.add(i);
        world.checkpoint = { x: c.x, y: c.y };
        world.events.push('checkpoint');
        spark(world, c.x, c.y - TILE, 14, '#4dffb8', 160, 0.5);
        say(world, 'Точка отката.', 1.2);
    });
}

/** Мгновенный рестарт: комната — это задача, и решается она целиком. */
function restartFromCheckpoint(world) {
    const p = world.player;
    world.attempts += 1;
    p.hp = world.mode.player.hp;
    p.body.x = world.checkpoint.x;
    p.body.y = world.checkpoint.y;
    p.body.vx = 0;
    p.body.vy = 0;
    p.body.h = PLAYER.h;
    p.state = 'move';
    p.invuln = 0.5;
    p.ledge = null;
    p.wall = 0;
    p.dashReady = true;
    p.attack.phase = 'none';
    for (const e of world.enemies) reviveEnforcer(e, world.mode.enemy);
    world.events.push('retry');
}

function reachedExit(world) {
    const exit = world.level.exit;
    if (!exit) return false;
    const p = world.player.body;
    return Math.abs(p.x - exit.x) < TILE && Math.abs(p.y - exit.y) < TILE * 1.5;
}

export function stepWorld(world, intent, dt) {
    world.time += dt;
    world.shake *= 1 - Math.min(1, CAMERA.shakeDecay * dt);
    if (world.shake < 0.05) world.shake = 0;
    if (world.notice) {
        world.notice.t -= dt;
        if (world.notice.t <= 0) world.notice = null;
    }

    for (const s of world.sparks) {
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 520 * dt;
        s.vx *= 0.94;
    }
    if (world.sparks.length > 260) world.sparks.splice(0, world.sparks.length - 260);
    world.sparks = world.sparks.filter((s) => s.life > 0);

    for (const item of world.loot) item.bob += dt;

    if (world.phase !== 'play') return;

    // Пауза после смерти. Мир стоит, искры летят: игрок должен увидеть,
    // что именно его убило, прежде чем окажется на чекпоинте.
    if (world.freeze > 0) {
        world.freeze -= dt;
        if (world.freeze <= 0) restartFromCheckpoint(world);
        return;
    }

    const p = world.player;
    updatePlayer(p, world.level, intent, dt);
    if (p.sfx.length) {
        world.events.push(...p.sfx);
        p.sfx.length = 0;
    }
    for (const e of world.enemies) updateEnforcer(e, world.level, p, dt);

    // Когти по бетону: искры и скрежет. Стена должна ощущаться стеной,
    // а не невидимым режимом падения.
    if (p.state === 'wall') {
        world.scrape -= dt;
        if (world.scrape <= 0) {
            world.scrape = 0.07;
            const side = p.wall;
            spark(world, p.body.x + side * p.body.w / 2, p.body.y - p.body.h * 0.6, 3, '#7dfcff', 90, 0.22);
            world.events.push('scrape');
        }
    } else {
        world.scrape = 0;
    }

    playerAttacks(world);
    enemiesAttack(world);
    pickLoot(world, dt);
    takeCheckpoint(world);
    respawnIfFallen(world);

    if (p.body.onGround && p.state === 'move' && p.hp > 0) {
        world.lastSafe.x = p.body.x;
        world.lastSafe.y = p.body.y;
    }

    if (p.hp <= 0) {
        if (world.mode.player.retry === 'checkpoint') {
            world.freeze = 0.4;
            world.shake = Math.max(world.shake, 8);
            world.events.push('lose');
        } else {
            world.phase = 'lost';
            world.events.push('lose');
        }
    } else if (reachedExit(world)) {
        world.phase = 'won';
        world.score += 250 + p.hp * 50;
        world.events.push('win');
    }
}

export { say };
