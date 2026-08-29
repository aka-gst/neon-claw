/**
 * Отрисовка. Мир сюда приходит готовым — рендер ничего не решает.
 *
 * Неон устроен в два прохода. Всё светящееся рисуется дважды: чётко на
 * основном холсте и толсто на уменьшенном втором, который потом
 * размывается и подмешивается сложением. Ядро линии остаётся резким,
 * вокруг него появляется ореол — именно так выглядит настоящая трубка,
 * и именно этого не даёт `shadowBlur`, который к тому же режет кадры.
 *
 * Никаких спрайтов: фигуры собраны из линий. Для неона это не компромисс,
 * а точное попадание — здесь всё и должно быть светящимся контуром.
 */

import { TILE, VIEW, SWORD, CORSAIR, LEDGE } from './tuning.js';
import { SOLID, ONEWAY, tileAt } from './level.js';
import { attackRect } from './player.js';
import { corsairAttackRect } from './enemy.js';
import { createBackdrop, drawBackdrop } from './backdrop.js';

const GLOW_SCALE = 2;
/**
 * Во сколько раз толще линия в проходе свечения. Больше 1.6 — и фигура
 * ростом в тайл с небольшим схлопывается в светящееся пятно: ореол
 * съедает промежутки между руками, ногами и плащом.
 */
const HALO = 1.55;

const HERO = {
    body: '#0b1022',
    rim: '#22e8ff',
    trim: '#ff2d95',
    blade: '#bff4ff',
};

const FOE = {
    body: '#140a16',
    rim: '#ff3b5c',
    trim: '#ff9f1c',
    guard: '#9ad8ff',
};

const canFilter = (() => {
    if (typeof document === 'undefined') return false;
    const probe = document.createElement('canvas').getContext('2d');
    probe.filter = 'blur(2px)';
    return probe.filter === 'blur(2px)';
})();

function scanlinePattern(ctx) {
    const cell = document.createElement('canvas');
    cell.width = 1;
    cell.height = 3;
    const c = cell.getContext('2d');
    c.fillStyle = 'rgba(0, 0, 0, 0.22)';
    c.fillRect(0, 2, 1, 1);
    return ctx.createPattern(cell, 'repeat');
}

export function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    const glow = document.createElement('canvas');
    glow.width = Math.ceil(VIEW.w / GLOW_SCALE);
    glow.height = Math.ceil(VIEW.h / GLOW_SCALE);
    return {
        canvas,
        ctx,
        glow,
        gctx: glow.getContext('2d'),
        layers: createBackdrop(),
        scan: scanlinePattern(ctx),
        /** Плотность пикселей: холст логический, а буфер может быть крупнее. */
        scale: 1,
        debug: false,
    };
}

/**
 * Подгонка под экран. Мир рисуется в логических 960×540, а буфер берётся
 * настолько крупным, насколько его реально покажут: на ретине это разница
 * между чёткой неоновой линией и мыльной.
 */
export function resizeRenderer(r, maxScale = 4) {
    const css = r.canvas.clientWidth || VIEW.w;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const scale = Math.max(1, Math.min(maxScale, (css / VIEW.w) * dpr));
    if (Math.abs(scale - r.scale) < 0.01 && r.canvas.width) return;
    r.scale = scale;
    r.canvas.width = Math.round(VIEW.w * scale);
    r.canvas.height = Math.round(VIEW.h * scale);
    r.scan = scanlinePattern(r.ctx);
}

/* ------------------------------------------------------------------ фигуры */

function polygon(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
}

/**
 * Поза сабли по фазе удара. Замах уходит назад и вверх, активная фаза —
 * это дуга сверху вниз, возврат — клинок опущен вперёд. Три позы, между
 * которыми игрок читает, что сейчас произойдёт.
 */
function bladeAngle(attack) {
    const { phase, t } = attack;
    if (phase === 'windup') return -2.35 + (t / SWORD.windup) * 0.25;
    if (phase === 'active') return -2.1 + (t / SWORD.active) * 2.6;
    if (phase === 'recover') return 0.5 - (t / SWORD.recover) * 0.2;
    return 1.15;
}

function drawBlade(ctx, hand, angle, length, color, lw, trail) {
    const tip = [hand[0] + Math.cos(angle) * length, hand[1] + Math.sin(angle) * length];
    if (trail !== null && trail !== undefined) {
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(hand[0], hand[1], length * 0.95, trail, angle, trail > angle);
        ctx.lineWidth = lw * 2.4;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.moveTo(hand[0], hand[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
}

function drawHero(ctx, p, glowPass, time) {
    const b = p.body;
    const lw = (w) => (glowPass ? w * HALO : w);
    const solid = !glowPass;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(p.facing, 1);

    const hanging = p.state === 'hang';
    const climbing = p.state === 'climb';
    const airborne = !b.onGround && !hanging && !climbing;
    const speed = Math.abs(b.vx);
    const phase = p.anim.run;
    const crouch = p.anim.land > 0 ? 3 : 0;

    const hip = -15 + crouch;
    const shoulder = -24 + crouch;
    const headY = -28.5 + crouch;

    /* ноги */
    const legs = [];
    if (hanging) {
        legs.push([[0, hip], [2.5, -5], [1, 0]]);
        legs.push([[0, hip], [-3, -6], [-5.5, -1]]);
    } else if (airborne) {
        const tuck = b.vy < 0 ? 1 : 0.4;
        legs.push([[0, hip], [5, -8 * tuck - 4], [8, -3]]);
        legs.push([[0, hip], [-4, -6], [-7, -8 * tuck]]);
    } else if (speed > 14) {
        const s = Math.sin(phase) * 7;
        const lift = Math.max(0, Math.cos(phase)) * 5;
        legs.push([[0, hip], [s * 0.5, -7], [s, -lift]]);
        legs.push([[0, hip], [-s * 0.5, -7], [-s, -Math.max(0, -Math.cos(phase)) * 5]]);
    } else {
        const idle = Math.sin(time * 2.2) * 0.5;
        legs.push([[0, hip], [2, -7], [3, 0 + idle]]);
        legs.push([[0, hip], [-2, -7], [-3.5, 0]]);
    }
    ctx.strokeStyle = HERO.rim;
    ctx.lineWidth = lw(2.4);
    ctx.lineJoin = 'round';
    for (const leg of legs) {
        ctx.beginPath();
        ctx.moveTo(leg[0][0], leg[0][1]);
        ctx.lineTo(leg[1][0], leg[1][1]);
        ctx.lineTo(leg[2][0], leg[2][1]);
        ctx.stroke();
    }

    /* плащ — треплется от скорости, а в висе просто свисает */
    const flap = hanging ? 0 : Math.sin(time * 9 + phase) * (2 + speed * 0.04);
    const tail = [
        [-1, shoulder + 1],
        [-9 - speed * 0.03, shoulder + 7 + flap],
        [-12 - speed * 0.05, hip + 7 - flap],
        [-4, hip + 3],
        [-1, hip - 1],
    ];
    polygon(ctx, tail);
    if (solid) {
        ctx.fillStyle = HERO.body;
        ctx.fill();
    }
    ctx.strokeStyle = HERO.trim;
    ctx.lineWidth = lw(1.6);
    ctx.stroke();

    /* корпус */
    polygon(ctx, [[-3.4, hip + 1], [3.4, hip + 1], [2.6, shoulder], [-2.6, shoulder]]);
    if (solid) {
        ctx.fillStyle = HERO.body;
        ctx.fill();
    }
    ctx.strokeStyle = HERO.rim;
    ctx.lineWidth = lw(2);
    ctx.stroke();

    /* голова, треуголка, визор */
    ctx.beginPath();
    ctx.arc(0.5, headY, 4.6, 0, Math.PI * 2);
    if (solid) {
        ctx.fillStyle = HERO.body;
        ctx.fill();
    }
    ctx.strokeStyle = HERO.rim;
    ctx.lineWidth = lw(1.7);
    ctx.stroke();

    polygon(ctx, [
        [-8.5, headY - 3.5], [-4, headY - 8], [0.5, headY - 5.2],
        [5, headY - 8], [9.5, headY - 3.5], [0.5, headY - 2],
    ]);
    if (solid) {
        ctx.fillStyle = HERO.body;
        ctx.fill();
    }
    ctx.strokeStyle = HERO.trim;
    ctx.lineWidth = lw(1.7);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(1.5, headY - 0.5);
    ctx.lineTo(5.4, headY - 0.5);
    ctx.strokeStyle = '#7dfcff';
    ctx.lineWidth = lw(1.8);
    ctx.stroke();

    /* рука и сабля */
    const angle = bladeAngle(p.attack);
    const hand = hanging ? [1, shoulder - 6] : [4.5, shoulder + 3];
    if (!hanging) {
        ctx.beginPath();
        ctx.moveTo(2, shoulder + 1);
        ctx.lineTo(hand[0], hand[1]);
        ctx.strokeStyle = HERO.rim;
        ctx.lineWidth = lw(2);
        ctx.stroke();
        const trail = p.attack.phase === 'active' ? -2.1 : null;
        drawBlade(ctx, hand, angle, 22, HERO.blade, lw(2.2), trail);
    } else {
        // В висе обе руки на кромке — сабля убрана за спину.
        ctx.strokeStyle = HERO.rim;
        ctx.lineWidth = lw(2);
        ctx.beginPath();
        ctx.moveTo(-2, shoulder + 1);
        ctx.lineTo(-1, shoulder - 7);
        ctx.moveTo(2, shoulder + 1);
        ctx.lineTo(3, shoulder - 7);
        ctx.stroke();
        drawBlade(ctx, [-3, shoulder + 2], 2.4, 18, HERO.trim, lw(1.6), null);
    }

    ctx.restore();
}

function drawCorsair(ctx, e, glowPass, time) {
    const b = e.body;
    const lw = (w) => (glowPass ? w * HALO : w);
    const solid = !glowPass;
    const dying = e.state === 'dead';

    ctx.save();
    ctx.translate(b.x, b.y);
    if (dying) {
        ctx.globalAlpha = Math.max(0, 1 - e.t * 1.4);
        ctx.rotate(Math.min(1.4, e.t * 3) * -e.facing);
    }
    ctx.scale(e.facing, 1);

    const hip = -14;
    const shoulder = -23;
    const headY = -27.5;
    const rim = e.flash > 0 ? '#ffffff' : FOE.rim;
    const speed = Math.abs(b.vx);

    /* ноги */
    const s = speed > 8 ? Math.sin(e.anim.walk) * 6 : 0;
    ctx.strokeStyle = rim;
    ctx.lineWidth = lw(2.6);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, hip); ctx.lineTo(s * 0.5, -7); ctx.lineTo(s, 0);
    ctx.moveTo(0, hip); ctx.lineTo(-s * 0.5, -7); ctx.lineTo(-s, 0);
    ctx.stroke();

    /* корпус — шире героя: корсар тяжелее и читается как стена */
    polygon(ctx, [[-4.4, hip + 1], [4.4, hip + 1], [3.4, shoulder], [-3.4, shoulder]]);
    if (solid) {
        ctx.fillStyle = FOE.body;
        ctx.fill();
    }
    ctx.strokeStyle = rim;
    ctx.lineWidth = lw(2);
    ctx.stroke();

    /* шлем с гребнем */
    polygon(ctx, [[-5, headY + 3], [-5, headY - 2], [0, headY - 6], [5, headY - 2], [5, headY + 3]]);
    if (solid) {
        ctx.fillStyle = FOE.body;
        ctx.fill();
    }
    ctx.lineWidth = lw(1.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, headY - 6);
    ctx.lineTo(-7, headY - 9);
    ctx.strokeStyle = FOE.trim;
    ctx.lineWidth = lw(1.6);
    ctx.stroke();

    /* один глаз-щель: в неоне этого достаточно, чтобы он смотрел */
    ctx.beginPath();
    ctx.moveTo(1, headY);
    ctx.lineTo(4.6, headY);
    ctx.strokeStyle = e.state === 'windup' ? '#fff2a8' : '#ff8fa3';
    ctx.lineWidth = lw(2);
    ctx.stroke();

    /* клинок и гарда */
    if (e.state === 'guard') {
        // Гарда — дуга поперёк корпуса. Её видно раньше, чем понимаешь,
        // что бьёшь в пустоту, и это честно.
        const pulse = 0.75 + Math.sin(time * 18) * 0.25 + e.anim.guard * 1.5;
        ctx.globalAlpha = Math.min(1, pulse);
        ctx.beginPath();
        ctx.arc(4, hip - 4, 15, -1.15, 1.15);
        ctx.strokeStyle = FOE.guard;
        ctx.lineWidth = lw(2.6);
        ctx.stroke();
        ctx.globalAlpha = 1;
        drawBlade(ctx, [5, shoulder + 4], -1.55, 20, FOE.guard, lw(2.2), null);
    } else {
        const raised = e.state === 'windup';
        const swinging = e.state === 'active';
        const angle = raised ? -2.2 : swinging ? 0.35 : 1.0;
        const color = raised ? '#fff2a8' : swinging ? '#ffd166' : FOE.trim;
        ctx.beginPath();
        ctx.moveTo(2.5, shoulder + 1);
        ctx.lineTo(5.5, shoulder + 4);
        ctx.strokeStyle = rim;
        ctx.lineWidth = lw(2);
        ctx.stroke();
        drawBlade(ctx, [5.5, shoulder + 4], angle, 22, color, lw(2.4), swinging ? -2.2 : null);
    }

    ctx.restore();

    /* полоска здоровья появляется только у раненого — лишний UI не нужен */
    if (!dying && e.hp < e.maxHp && !glowPass) {
        const w = 22;
        ctx.fillStyle = 'rgba(6, 8, 18, 0.8)';
        ctx.fillRect(b.x - w / 2, b.y - b.h - 11, w, 3);
        ctx.fillStyle = FOE.rim;
        ctx.fillRect(b.x - w / 2, b.y - b.h - 11, (w * e.hp) / e.maxHp, 3);
    }
}

/* ------------------------------------------------------------------- сцена */

function drawTiles(ctx, world, cam, glowPass) {
    const level = world.level;
    const lw = (w) => (glowPass ? w * HALO : w);
    const c0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
    const c1 = Math.min(level.width - 1, Math.ceil((cam.x + VIEW.w) / TILE) + 1);
    const r0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
    const r1 = Math.min(level.height - 1, Math.ceil((cam.y + VIEW.h) / TILE) + 1);

    for (let row = r0; row <= r1; row += 1) {
        for (let col = c0; col <= c1; col += 1) {
            const t = tileAt(level, col, row);
            if (t === 0) continue;
            const x = col * TILE;
            const y = row * TILE;

            if (t === ONEWAY) {
                ctx.beginPath();
                ctx.moveTo(x, y + 2.5);
                ctx.lineTo(x + TILE, y + 2.5);
                ctx.strokeStyle = '#ff2d95';
                ctx.lineWidth = lw(2.5);
                ctx.stroke();
                if (!glowPass) {
                    ctx.fillStyle = 'rgba(255, 45, 149, 0.10)';
                    ctx.fillRect(x, y + 4, TILE, 5);
                }
                continue;
            }

            const openAbove = tileAt(level, col, row - 1) !== SOLID;
            if (!glowPass) {
                ctx.fillStyle = openAbove ? '#0d1226' : '#090c1c';
                ctx.fillRect(x, y, TILE, TILE);
                ctx.strokeStyle = 'rgba(60, 90, 150, 0.16)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);

                // Редкие окна внутри массива — чтобы камень читался как здание.
                if (!openAbove && (col * 7 + row * 13) % 11 === 0) {
                    ctx.fillStyle = (col + row) % 3 === 0 ? 'rgba(255, 200, 87, 0.5)' : 'rgba(34, 232, 255, 0.35)';
                    ctx.fillRect(x + 8, y + 8, 5, 7);
                }
            }

            if (openAbove) {
                ctx.beginPath();
                ctx.moveTo(x, y + 1.5);
                ctx.lineTo(x + TILE, y + 1.5);
                ctx.strokeStyle = '#22e8ff';
                ctx.lineWidth = lw(2.2);
                ctx.stroke();
            }
            if (tileAt(level, col - 1, row) !== SOLID) {
                ctx.beginPath();
                ctx.moveTo(x + 1, y);
                ctx.lineTo(x + 1, y + TILE);
                ctx.strokeStyle = 'rgba(124, 77, 255, 0.55)';
                ctx.lineWidth = lw(1.4);
                ctx.stroke();
            }
            if (tileAt(level, col + 1, row) !== SOLID) {
                ctx.beginPath();
                ctx.moveTo(x + TILE - 1, y);
                ctx.lineTo(x + TILE - 1, y + TILE);
                ctx.strokeStyle = 'rgba(124, 77, 255, 0.55)';
                ctx.lineWidth = lw(1.4);
                ctx.stroke();
            }
        }
    }
}

function drawLoot(ctx, world, glowPass) {
    const lw = (w) => (glowPass ? w * HALO : w);
    for (const item of world.loot) {
        if (item.taken) continue;
        const core = item.kind === 'core';
        const r = core ? 9 : 5.5;
        const y = item.y + Math.sin(item.bob * 2.4) * 2.5;
        const spin = item.bob * (core ? 1.4 : 2.2);

        ctx.save();
        ctx.translate(item.x, y);
        ctx.rotate(spin);
        ctx.beginPath();
        if (core) {
            for (let i = 0; i < 6; i += 1) {
                const a = (i / 6) * Math.PI * 2;
                const px = Math.cos(a) * r;
                const py = Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
        } else {
            ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0);
            ctx.closePath();
        }
        ctx.strokeStyle = core ? '#4dffb8' : '#ffc857';
        ctx.lineWidth = lw(2);
        ctx.stroke();
        if (!glowPass) {
            ctx.fillStyle = core ? 'rgba(77, 255, 184, 0.18)' : 'rgba(255, 200, 87, 0.16)';
            ctx.fill();
        }
        ctx.restore();

        if (core) {
            ctx.beginPath();
            ctx.arc(item.x, y, r + 5 + Math.sin(item.bob * 3) * 2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(77, 255, 184, 0.45)';
            ctx.lineWidth = lw(1.2);
            ctx.stroke();
        }
    }
}

function drawExit(ctx, world, glowPass, time) {
    const exit = world.level.exit;
    if (!exit) return;
    const lw = (w) => (glowPass ? w * HALO : w);
    const h = TILE * 3;
    if (!glowPass) {
        const beam = ctx.createLinearGradient(0, exit.y - h, 0, exit.y);
        beam.addColorStop(0, 'rgba(77, 255, 184, 0)');
        beam.addColorStop(1, 'rgba(77, 255, 184, 0.28)');
        ctx.fillStyle = beam;
        ctx.fillRect(exit.x - TILE * 0.7, exit.y - h, TILE * 1.4, h);
    }
    ctx.strokeStyle = '#4dffb8';
    ctx.lineWidth = lw(2.4);
    for (let i = 0; i < 3; i += 1) {
        const off = ((time * 40 + i * 26) % 78);
        ctx.globalAlpha = 1 - off / 78;
        ctx.beginPath();
        ctx.moveTo(exit.x - 10, exit.y - 6 - off);
        ctx.lineTo(exit.x, exit.y - 14 - off);
        ctx.lineTo(exit.x + 10, exit.y - 6 - off);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawSparks(ctx, world, glowPass) {
    const lw = (w) => (glowPass ? w * HALO : w);
    ctx.lineCap = 'round';
    for (const s of world.sparks) {
        const k = s.life / s.max;
        ctx.globalAlpha = k;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 0.02, s.y - s.vy * 0.02);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = lw(1.5 + k * 1.5);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
}

function paintWorld(ctx, world, cam, glowPass) {
    drawTiles(ctx, world, cam, glowPass);
    drawExit(ctx, world, glowPass, world.time);
    drawLoot(ctx, world, glowPass);
    for (const e of world.enemies) drawCorsair(ctx, e, glowPass, world.time);

    const p = world.player;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 22) % 2 === 0;
    if (!blink && p.state !== 'dead') drawHero(ctx, p, glowPass, world.time);
    else if (p.state === 'dead') {
        ctx.globalAlpha = 0.4;
        drawHero(ctx, p, glowPass, world.time);
        ctx.globalAlpha = 1;
    }

    drawSparks(ctx, world, glowPass);
}

function drawHud(ctx, world) {
    ctx.save();
    ctx.font = '600 15px "Rajdhani", "DIN Alternate", system-ui, sans-serif';
    ctx.textBaseline = 'top';

    const p = world.player;
    for (let i = 0; i < p.maxHp; i += 1) {
        const x = 22 + i * 17;
        const alive = i < p.hp;
        ctx.strokeStyle = alive ? '#ff2d95' : 'rgba(255, 45, 149, 0.22)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(x, 30);
        ctx.lineTo(x + 5, 20);
        ctx.lineTo(x + 10, 30);
        ctx.stroke();
    }

    ctx.fillStyle = '#7dfcff';
    ctx.textAlign = 'right';
    ctx.fillText(String(world.score).padStart(5, '0'), VIEW.w - 22, 18);
    ctx.fillStyle = 'rgba(125, 252, 255, 0.55)';
    ctx.font = '600 12px "Rajdhani", system-ui, sans-serif';
    ctx.fillText(`ТРОФЕИ ${world.collected}/${world.totalLoot}`, VIEW.w - 22, 38);

    if (world.notice) {
        const alpha = Math.min(1, world.notice.t * 2);
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.font = '600 15px "Rajdhani", system-ui, sans-serif';
        ctx.fillStyle = '#ffc857';
        ctx.fillText(world.notice.text, VIEW.w / 2, VIEW.h - 54);
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}

function drawDebug(ctx, world) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#00ff88';
    const p = world.player;
    const pb = p.body;
    ctx.strokeRect(pb.x - pb.w / 2, pb.y - pb.h, pb.w, pb.h);
    if (p.attack.phase === 'active') {
        const r = attackRect(p);
        ctx.strokeStyle = '#ffff00';
        ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    for (const e of world.enemies) {
        ctx.strokeStyle = '#ff8800';
        ctx.strokeRect(e.body.x - e.body.w / 2, e.body.y - e.body.h, e.body.w, e.body.h);
        if (e.state === 'active') {
            const r = corsairAttackRect(e);
            ctx.strokeStyle = '#ff0044';
            ctx.strokeRect(r.x, r.y, r.w, r.h);
        }
    }
    ctx.restore();
}

export function render(r, world, cam) {
    const { ctx, gctx, glow } = r;
    const s = r.scale;

    ctx.setTransform(s, 0, 0, s, 0, 0);
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, glow.width, glow.height);

    drawBackdrop(ctx, r.layers, cam.x + cam.shakeX, cam.y + cam.shakeY);

    const ox = -Math.round(cam.x + cam.shakeX);
    const oy = -Math.round(cam.y + cam.shakeY);
    ctx.setTransform(s, 0, 0, s, ox * s, oy * s);
    gctx.setTransform(1 / GLOW_SCALE, 0, 0, 1 / GLOW_SCALE, ox / GLOW_SCALE, oy / GLOW_SCALE);

    paintWorld(gctx, world, cam, true);
    paintWorld(ctx, world, cam, false);
    if (r.debug) drawDebug(ctx, world);

    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (canFilter) {
        ctx.filter = 'blur(2.5px)';
        ctx.globalAlpha = 0.7;
        ctx.drawImage(glow, 0, 0, VIEW.w, VIEW.h);
        ctx.filter = 'blur(8px)';
        ctx.globalAlpha = 0.3;
        ctx.drawImage(glow, 0, 0, VIEW.w, VIEW.h);
        ctx.filter = 'none';
    } else {
        // Без фильтра ореол собирается смещёнными копиями — грубее, но живо.
        ctx.globalAlpha = 0.22;
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
            ctx.drawImage(glow, dx, dy, VIEW.w, VIEW.h);
        }
    }
    ctx.restore();

    ctx.fillStyle = r.scan;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    const vig = ctx.createRadialGradient(VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.35, VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.85);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    drawHud(ctx, world);
}

export { HERO, FOE, LEDGE, CORSAIR };
