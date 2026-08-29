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

import { TILE, VIEW, SWORD, ENFORCER, LEDGE, BOW } from './tuning.js';
import { SOLID, ONEWAY, tileAt, levelPixelHeight } from './level.js';
import { attackRect } from './player.js';
import { enforcerAttackRect } from './enemy.js';
import { createBackdrop, drawBackdrop } from './backdrop.js';
import { variantAt } from './assets.js';
import { formatTime } from './results.js';

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

/**
 * Роль → как её рисовать. Ассеты не знают цветов: они называют смысл, а
 * палитра живёт здесь. Поэтому сменить весь вид района — это правка одной
 * таблицы, а не пятнадцати файлов.
 */
const ROLE = {
    edge:   { stroke: '#22e8ff',                    width: 2.2, glow: true },
    side:   { stroke: 'rgba(124, 77, 255, 0.55)',   width: 1.4, glow: true },
    body:   { stroke: 'rgba(60, 90, 150, 0.2)',     width: 1,   fill: '#0c1024', glow: false },
    // Золото значит «возьми» и больше ничего. Мелочь внутри массива —
    // холодная: иначе весь бетон читается как рассыпанная добыча.
    detail: { stroke: 'rgba(120, 190, 240, 0.34)',  width: 1,   fill: 'rgba(96, 158, 214, 0.2)', glow: false },
    wire:   { stroke: 'rgba(130, 170, 225, 0.55)',  width: 1.2, glow: false },
    sign:   { stroke: '#ff2d95',                    width: 1.6, fill: 'rgba(255, 45, 149, 0.35)', glow: true },
    hot:    { stroke: '#ff3b5c',                    width: 2,   fill: 'rgba(255, 59, 92, 0.25)', glow: true },
    loot:   { stroke: '#ffc857',                    width: 2,   glow: true },
    data:   { stroke: '#4dffb8',                    width: 2,   glow: true },
    foe:    { stroke: '#ff3b5c',                    width: 1.6, glow: true },
};

/** Проигрывание списка примитивов из ассета в координатах клетки. */
function paintOps(ctx, ops, ox, oy, glowPass) {
    for (const op of ops) {
        const style = ROLE[op.role] ?? ROLE.detail;
        if (glowPass && !style.glow) continue;
        ctx.strokeStyle = style.stroke;
        ctx.fillStyle = style.fill ?? style.stroke;
        ctx.lineWidth = (op.width ?? style.width) * (glowPass ? HALO : 1);
        ctx.beginPath();
        if (op.op === 'line' || op.op === 'poly') {
            ctx.moveTo(ox + op.pts[0][0], oy + op.pts[0][1]);
            for (let i = 1; i < op.pts.length; i += 1) ctx.lineTo(ox + op.pts[i][0], oy + op.pts[i][1]);
            if (op.op === 'poly' && op.close) ctx.closePath();
        } else if (op.op === 'rect') {
            ctx.rect(ox + op.x, oy + op.y, op.w, op.h);
        } else if (op.op === 'arc') {
            ctx.arc(ox + op.cx, oy + op.cy, op.r, op.a0, op.a1);
        }
        if (op.fill && !glowPass) ctx.fill();
        else ctx.stroke();
    }
}

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
        /** Набор тайлов района. null — рисуем встроенным способом. */
        tiles: null,
        /** Нарисованные слои параллакса. null — генерируем сами. */
        art: null,
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

    const st = p.state;
    const sliding = st === 'slide';
    const dashing = st === 'dash';
    const onWall = st === 'wall';
    const hanging = st === 'hang';
    const climbing = st === 'climb';
    const airborne = !b.onGround && !onWall && !hanging && !climbing && !dashing;
    const speed = Math.abs(b.vx);
    const phase = p.anim.run;
    const crouch = p.anim.land > 0 ? 3 : 0;

    // Подкат кладёт героя набок, рывок наклоняет вперёд. Одна фигура, разные
    // центры тяжести — этого хватает, чтобы позы не путались между собой.
    const hip = sliding ? -6 : -14 + crouch;
    const shoulder = sliding ? -9.5 : -23 + crouch;
    const headY = sliding ? -11.5 : -27.5 + crouch;
    const lean = dashing ? 3.5 : sliding ? 6 : 0;

    /* след рывка */
    if (dashing) {
        ctx.strokeStyle = HERO.rim;
        for (let i = 1; i <= 3; i += 1) {
            ctx.globalAlpha = 0.3 / i;
            ctx.beginPath();
            ctx.moveTo(-6 - i * 7, -6 - i * 3);
            ctx.lineTo(-16 - i * 9, -6 - i * 3);
            ctx.lineWidth = lw(2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    /* ноги */
    const legs = [];
    if (sliding) {
        legs.push([[lean * 0.4, hip], [7, hip - 1], [13, -1]]);
        legs.push([[lean * 0.4, hip], [-2, hip + 2], [-6, -1]]);
    } else if (hanging || climbing) {
        legs.push([[0, hip], [3, -6], [1.5, 0]]);
        legs.push([[0, hip], [-3, -7], [-5.5, -2]]);
    } else if (onWall) {
        // Ноги упёрты в стену, колени наружу: поза читается как «держусь».
        legs.push([[0, hip], [5, -8], [8, -2]]);
        legs.push([[0, hip], [3, -5], [7.5, -11]]);
    } else if (dashing) {
        legs.push([[lean * 0.4, hip], [-5, -9], [-11, -11]]);
        legs.push([[lean * 0.4, hip], [-6, -6], [-13, -5]]);
    } else if (airborne) {
        const tuck = b.vy < 0 ? 1 : 0.4;
        legs.push([[0, hip], [5, -8 * tuck - 4], [8, -3]]);
        legs.push([[0, hip], [-4, -6], [-7, -8 * tuck]]);
    } else if (speed > 14) {
        const sw = Math.sin(phase) * 7;
        const lift = Math.max(0, Math.cos(phase)) * 5;
        legs.push([[0, hip], [sw * 0.5, -7], [sw, -lift]]);
        legs.push([[0, hip], [-sw * 0.5, -7], [-sw, -Math.max(0, -Math.cos(phase)) * 5]]);
    } else {
        const idle = Math.sin(time * 2.2) * 0.5;
        legs.push([[0, hip], [2, -7], [3, idle]]);
        legs.push([[0, hip], [-2, -7], [-3.5, 0]]);
    }
    ctx.strokeStyle = HERO.rim;
    ctx.lineWidth = lw(2.4);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const leg of legs) {
        ctx.beginPath();
        ctx.moveTo(leg[0][0], leg[0][1]);
        ctx.lineTo(leg[1][0], leg[1][1]);
        ctx.lineTo(leg[2][0], leg[2][1]);
        ctx.stroke();
    }
    ctx.lineCap = 'butt';

    /* Шарф — две ленты позади. Длина от скорости, волна от времени: по нему
       читается инерция там, где силуэт слишком мал для развёрнутой позы. */
    const drag = Math.min(26, 8 + speed * 0.07 + (dashing ? 16 : 0));
    ctx.strokeStyle = HERO.trim;
    ctx.lineWidth = lw(2);
    for (let i = 0; i < 2; i += 1) {
        const wave = Math.sin(time * 7 + i * 2.1 + phase) * (2 + speed * 0.02);
        const rise = hanging || onWall ? 6 : 0;
        ctx.beginPath();
        ctx.moveTo(-1 + lean * 0.5, shoulder + 1 + i);
        ctx.quadraticCurveTo(
            -drag * 0.5, shoulder + 2 + wave + i * 3 + rise,
            -drag, shoulder + 5 + wave * 1.7 + i * 4 + rise,
        );
        ctx.stroke();
    }

    /* корпус */
    const sx = lean * 0.6;
    polygon(ctx, [[-3.4, hip + 1], [3.4, hip + 1], [sx + 2.6, shoulder], [sx - 2.6, shoulder]]);
    if (solid) {
        ctx.fillStyle = HERO.body;
        ctx.fill();
    }
    ctx.strokeStyle = HERO.rim;
    ctx.lineWidth = lw(2);
    ctx.stroke();

    /* капюшон: клин с задним хвостом вместо головы-шара */
    const hx = lean;
    polygon(ctx, [
        [hx - 4.6, headY + 4], [hx - 6, headY - 2.5], [hx - 1.5, headY - 7.5],
        [hx + 3.6, headY - 6], [hx + 5.4, headY - 0.5], [hx + 4, headY + 4],
    ]);
    if (solid) {
        ctx.fillStyle = HERO.body;
        ctx.fill();
    }
    ctx.lineWidth = lw(1.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx - 5.6, headY - 2);
    ctx.lineTo(hx - 11 - drag * 0.15, headY + 2.5 + Math.sin(time * 7) * 1.5);
    ctx.strokeStyle = HERO.trim;
    ctx.lineWidth = lw(1.6);
    ctx.stroke();

    /* визор */
    ctx.beginPath();
    ctx.moveTo(hx + 0.6, headY - 0.6);
    ctx.lineTo(hx + 5, headY - 1.4);
    ctx.strokeStyle = '#7dfcff';
    ctx.lineWidth = lw(2);
    ctx.stroke();

    /* руки, когти и катана */
    const angle = bladeAngle(p.attack);
    if (hanging || climbing || onWall) {
        // Когти. Название игры про них: за кромку держатся железом, а не пальцами.
        const reach = onWall
            ? [[6, shoulder - 5], [7, shoulder + 4]]
            : [[-1, shoulder - 7], [3, shoulder - 7]];
        ctx.strokeStyle = HERO.rim;
        ctx.lineWidth = lw(2);
        ctx.beginPath();
        for (const [ax, ay] of reach) {
            ctx.moveTo(0, shoulder + 1);
            ctx.lineTo(ax, ay);
        }
        ctx.stroke();
        ctx.strokeStyle = '#bff4ff';
        ctx.lineWidth = lw(1.8);
        ctx.beginPath();
        for (const [ax, ay] of reach) {
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + 3, ay - 2.5);
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + 3.5, ay + 0.5);
        }
        ctx.stroke();
        drawBlade(ctx, [-3, shoulder + 3], 2.5, 17, HERO.trim, lw(1.6), null);
    } else if (p.bow.drawing) {
        // Лук держат обеими руками и разворачивают по прицелу: поза должна
        // говорить, куда полетит, ещё до того, как игрок увидит дугу.
        const local = p.facing > 0 ? p.bow.angle : Math.PI - p.bow.angle;
        const power = p.bow.power;
        ctx.save();
        ctx.translate(4, shoulder + 2);
        ctx.rotate(local);
        ctx.strokeStyle = '#4dffb8';
        ctx.lineWidth = lw(2);
        ctx.beginPath();
        ctx.arc(6, 0, 9, -2.1, 2.1);
        ctx.stroke();
        ctx.strokeStyle = '#bff4ff';
        ctx.lineWidth = lw(1.2);
        ctx.beginPath();
        ctx.moveTo(6 + 9 * Math.cos(-2.1), 9 * Math.sin(-2.1));
        ctx.lineTo(-2 - power * 4, 0);
        ctx.lineTo(6 + 9 * Math.cos(2.1), 9 * Math.sin(2.1));
        ctx.stroke();
        ctx.lineWidth = lw(1.8);
        ctx.beginPath();
        ctx.moveTo(-2 - power * 4, 0);
        ctx.lineTo(12, 0);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = HERO.rim;
        ctx.lineWidth = lw(2);
        ctx.beginPath();
        ctx.moveTo(sx + 2, shoulder + 1);
        ctx.lineTo(4, shoulder + 2);
        ctx.stroke();
    } else {
        const hand = sliding ? [8, hip - 2] : [sx + 4.5, shoulder + 3];
        ctx.beginPath();
        ctx.moveTo(sx + 2, shoulder + 1);
        ctx.lineTo(hand[0], hand[1]);
        ctx.strokeStyle = HERO.rim;
        ctx.lineWidth = lw(2);
        ctx.stroke();
        const trail = p.attack.phase === 'active' ? -2.1 : null;
        const rest = sliding ? 2.6 : dashing ? 2.9 : angle;
        drawBlade(ctx, hand, p.attack.phase === 'none' ? rest : angle, 22, HERO.blade, lw(2.2), trail);
    }

    ctx.restore();
}

function drawEnforcer(ctx, e, glowPass, time) {
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

    /* корпус — шире героя: страж тяжелее и читается как стена */
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

function drawCheckpoints(ctx, world, glowPass, time) {
    const lw = (w) => (glowPass ? w * HALO : w);
    world.level.checkpoints.forEach((c, i) => {
        const live = world.reached.has(i);
        const h = TILE * 1.6;
        ctx.strokeStyle = live ? '#4dffb8' : 'rgba(77, 255, 184, 0.3)';
        ctx.lineWidth = lw(live ? 2.2 : 1.4);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x, c.y - h);
        ctx.stroke();
        const pulse = live ? 3 + Math.sin(time * 4 + i) * 1.5 : 2.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y - h, pulse, 0, Math.PI * 2);
        ctx.stroke();
    });
}

function drawTiles(ctx, world, cam, glowPass, tiles) {
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
                const bars = tiles?.kinds?.oneway;
                if (bars) paintOps(ctx, bars[variantAt(col, row, bars.length)], x, y, glowPass);
                continue;
            }

            const openAbove = tileAt(level, col, row - 1) !== SOLID;
            if (!glowPass) {
                ctx.fillStyle = openAbove ? '#0d1226' : '#090c1c';
                ctx.fillRect(x, y, TILE, TILE);
                ctx.strokeStyle = 'rgba(60, 90, 150, 0.16)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);

                // Встроенные окна нужны, только пока нет тайлсета: с ним
                // вся мелочь приходит из ассета, и дублировать её нельзя.
                if (!tiles && !openAbove && (col * 7 + row * 13) % 11 === 0) {
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
            /*
             * Каждая грань, которая касается воздуха, обязана быть видна.
             * Циан сверху значит «сюда можно встать», фиолет по бокам и
             * снизу — «об это упрёшься». Без нижней грани подвешенная плита
             * с проходом под ней выходила чёрной на чёрном: игрок утыкался
             * в стену, которой не видел, и это читалось как поломка.
             */
            ctx.strokeStyle = 'rgba(140, 100, 255, 0.8)';
            ctx.lineWidth = lw(1.6);
            if (tileAt(level, col - 1, row) !== SOLID) {
                ctx.beginPath();
                ctx.moveTo(x + 1, y);
                ctx.lineTo(x + 1, y + TILE);
                ctx.stroke();
            }
            if (tileAt(level, col + 1, row) !== SOLID) {
                ctx.beginPath();
                ctx.moveTo(x + TILE - 1, y);
                ctx.lineTo(x + TILE - 1, y + TILE);
                ctx.stroke();
            }
            if (tileAt(level, col, row + 1) !== SOLID) {
                ctx.beginPath();
                ctx.moveTo(x, y + TILE - 1);
                ctx.lineTo(x + TILE, y + TILE - 1);
                ctx.stroke();
            }

            if (!tiles) continue;
            const kind = openAbove ? 'solid.top' : 'solid.body';
            const list = tiles.kinds[kind];
            if (list) paintOps(ctx, list[variantAt(col, row, list.length)], x, y, glowPass);

            // Декор ставится в пустую клетку над поверхностью: он стоит НА
            // крыше, а не внутри неё. Редко — иначе район превращается в свалку.
            const props = tiles.kinds.prop;
            if (openAbove && props && variantAt(col + 977, row, 6) === 0
                && tileAt(level, col, row - 1) === 0) {
                paintOps(ctx, props[variantAt(col, row + 31, props.length)], x, y - TILE, glowPass);
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

/**
 * Стрелы и предпросмотр полёта.
 *
 * Дуга из точек считается той же физикой, что и настоящая стрела, — иначе
 * она врала бы игроку о том, куда попадёт. Без неё лук с тяжестью и
 * сопротивлением воздуха превращается в угадайку.
 */
function drawArrows(ctx, world, glowPass) {
    const lw = (w) => (glowPass ? w * HALO : w);
    const p = world.player;

    if (p.bow.drawing) {
        const power = p.bow.power;
        const speed = BOW.speedMin + (BOW.speedMax - BOW.speedMin) * power;
        let x = p.body.x + Math.cos(p.bow.angle) * 8;
        let y = p.body.y - p.body.h * 0.62 + Math.sin(p.bow.angle) * 8;
        let vx = Math.cos(p.bow.angle) * speed;
        let vy = Math.sin(p.bow.angle) * speed;
        const step = 0.055;

        ctx.fillStyle = '#4dffb8';
        for (let i = 0; i < BOW.preview; i += 1) {
            vy += BOW.gravity * step;
            const decay = 1 - Math.min(1, BOW.drag * step);
            vx *= decay;
            vy *= decay;
            x += vx * step;
            y += vy * step;
            ctx.globalAlpha = (1 - i / BOW.preview) * 0.75 * (0.35 + power * 0.65);
            ctx.beginPath();
            ctx.arc(x, y, lw(0.9), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    ctx.lineCap = 'round';
    for (const a of world.arrows) {
        // След: по нему читается дуга уже улетевшей стрелы, и следующий
        // выстрел поправляют по нему, а не наугад.
        if (a.trail && a.trail.length > 1) {
            ctx.strokeStyle = 'rgba(191, 244, 255, 0.28)';
            ctx.lineWidth = lw(1);
            ctx.beginPath();
            ctx.moveTo(a.trail[0][0], a.trail[0][1]);
            for (let i = 1; i < a.trail.length; i += 1) ctx.lineTo(a.trail[i][0], a.trail[i][1]);
            ctx.stroke();
        }
        const angle = Math.atan2(a.vy, a.vx);
        ctx.strokeStyle = '#bff4ff';
        ctx.lineWidth = lw(1.8);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x - Math.cos(angle) * 11, a.y - Math.sin(angle) * 11);
        ctx.stroke();
    }
    for (const s of world.stuck) {
        ctx.strokeStyle = 'rgba(191, 244, 255, 0.55)';
        ctx.lineWidth = lw(1.5);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - Math.cos(s.angle) * 9, s.y - Math.sin(s.angle) * 9);
        ctx.stroke();
    }
    ctx.lineCap = 'butt';
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

function paintWorld(ctx, world, cam, glowPass, tiles) {
    drawTiles(ctx, world, cam, glowPass, tiles);
    drawCheckpoints(ctx, world, glowPass, world.time);
    drawExit(ctx, world, glowPass, world.time);
    drawLoot(ctx, world, glowPass);
    for (const e of world.enemies) drawEnforcer(ctx, e, glowPass, world.time);

    const p = world.player;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 22) % 2 === 0;
    if (!blink && p.state !== 'dead') drawHero(ctx, p, glowPass, world.time);
    else if (p.state === 'dead') {
        ctx.globalAlpha = 0.4;
        drawHero(ctx, p, glowPass, world.time);
        ctx.globalAlpha = 1;
    }

    drawArrows(ctx, world, glowPass);
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

    // Колчан рядом с жизнями: и то и другое кончается, и знать надо заранее.
    for (let i = 0; i < world.player.bow.arrows; i += 1) {
        const x = 22 + i * 7;
        ctx.strokeStyle = '#4dffb8';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x, 46);
        ctx.lineTo(x, 56);
        ctx.stroke();
    }

    ctx.fillStyle = '#7dfcff';
    ctx.textAlign = 'right';
    ctx.fillText(String(world.score).padStart(5, '0'), VIEW.w - 22, 18);
    ctx.fillStyle = 'rgba(125, 252, 255, 0.55)';
    ctx.font = '600 12px "Rajdhani", system-ui, sans-serif';
    ctx.fillText(`ТРОФЕИ ${world.collected}/${world.totalLoot}`, VIEW.w - 22, 38);

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(125, 252, 255, 0.4)';
    ctx.fillText(`ПОПЫТКА ${world.attempts} · ${formatTime(world.elapsed)}`, 22, 38);

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
            const r = enforcerAttackRect(e);
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

    const camMaxY = Math.max(0, levelPixelHeight(world.level) - VIEW.h);
    drawBackdrop(ctx, r.layers, cam.x + cam.shakeX, cam.y + cam.shakeY, r.art, camMaxY);

    const ox = -Math.round(cam.x + cam.shakeX);
    const oy = -Math.round(cam.y + cam.shakeY);
    ctx.setTransform(s, 0, 0, s, ox * s, oy * s);
    gctx.setTransform(1 / GLOW_SCALE, 0, 0, 1 / GLOW_SCALE, ox / GLOW_SCALE, oy / GLOW_SCALE);

    paintWorld(gctx, world, cam, true, r.tiles);
    paintWorld(ctx, world, cam, false, r.tiles);
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

    if (world.freeze > 0) {
        ctx.fillStyle = `rgba(255, 45, 149, ${Math.min(0.5, world.freeze)})`;
        ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    }

    drawHud(ctx, world);
}

export { HERO, FOE, LEDGE, ENFORCER };
