/**
 * Мир: уровень, герой, корсары, добро — и правила их встречи.
 *
 * Здесь нет отрисовки. Всё, что должно быть видно, мир складывает в
 * `sparks` и `flashes`: рендер потом это проигрывает. Тот же приём, что и
 * в «Битве Стихий» — событие сначала данные, и только потом картинка.
 */

import { TILE, SWORD, CORSAIR, LOOT, PLAYER, CAMERA } from './tuning.js';
import { parseLevel, levelPixelHeight } from './level.js';
import { overlaps, bodyRect } from './physics.js';
import { createPlayer, updatePlayer, attackRect, isAttacking, hurtPlayer, pushPlayer } from './player.js';
import { createCorsair, updateCorsair, corsairAttackRect, isSwinging, hurtCorsair } from './enemy.js';

export function createWorld(rows) {
    const level = parseLevel(rows);
    const player = createPlayer(level.spawn);
    return {
        level,
        player,
        enemies: level.enemies.map((e, i) => createCorsair(e, i)),
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
        lastSafe: { ...level.spawn },
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
        const result = hurtCorsair(e, p.body.x);
        const mid = { x: (blade.x + blade.w / 2 + e.body.x) / 2, y: e.body.y - e.body.h / 2 };

        if (result === 'blocked') {
            // Звон — это отказ, и он должен ощущаться отказом: отдача,
            // потерянный темп и ни единицы урона.
            spark(world, mid.x, mid.y, 12, '#9ad8ff', 200, 0.3);
            world.events.push('clang');
            pushPlayer(p, e.body.x, CORSAIR.clangKnockback);
            p.hitstop = SWORD.hitstop;
            world.shake = Math.max(world.shake, 3);
            say(world, 'Гарда. Выжди — она не вечная.', 1.6);
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
        if (!overlaps(corsairAttackRect(e), rect)) continue;
        if (hurtPlayer(p, e.body.x, CORSAIR.damage)) {
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
    p.state = p.hp <= 0 ? 'dead' : 'move';
    world.shake = Math.max(world.shake, 6);
    world.events.push('fall');
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

    const p = world.player;
    updatePlayer(p, world.level, intent, dt);
    if (p.sfx.length) {
        world.events.push(...p.sfx);
        p.sfx.length = 0;
    }
    for (const e of world.enemies) updateCorsair(e, world.level, p, dt);

    playerAttacks(world);
    enemiesAttack(world);
    pickLoot(world, dt);
    respawnIfFallen(world);

    if (p.body.onGround && p.state === 'move' && p.hp > 0) {
        world.lastSafe.x = p.body.x;
        world.lastSafe.y = p.body.y;
    }

    if (p.hp <= 0) {
        world.phase = 'lost';
        world.events.push('lose');
    } else if (reachedExit(world)) {
        world.phase = 'won';
        world.score += 250 + p.hp * 50;
        world.events.push('win');
    }
}

export { say };
