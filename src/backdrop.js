/**
 * Город на фоне. Три слоя параллакса, нарисованные один раз в буферы.
 *
 * Рисовать фон каждый кадр — значит платить за десятки тысяч окон ради
 * картинки, которая почти не меняется. Поэтому слои печатаются в offscreen
 * при старте, а в кадре остаётся три `drawImage` со сдвигом.
 *
 * Генератор детерминированный: город должен быть одним и тем же между
 * перезапусками, иначе «а вон там была вывеска» перестаёт работать.
 */

import { VIEW } from './tuning.js';

const LAYER_W = 960;

/** mulberry32 — короткий и предсказуемый. Ничего криптографического здесь не нужно. */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SIGN_COLORS = ['#ff2d95', '#22e8ff', '#ffc857', '#7c4dff', '#4dffb8'];

function buffer(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

function skyline(ctx, random, opts) {
    const { baseline, minH, maxH, fill, edge, windows, signs } = opts;
    let x = -40;
    while (x < LAYER_W + 40) {
        const w = 26 + random() * 54;
        const h = minH + random() * (maxH - minH);
        const top = baseline - h;

        ctx.fillStyle = fill;
        ctx.fillRect(x, top, w, h + 60);

        // Кромка крыши — единственное, что светится в силуэте.
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, top + 0.5);
        ctx.lineTo(x + w, top + 0.5);
        ctx.stroke();

        if (windows > 0) {
            const cols = Math.max(1, Math.floor(w / 8));
            const rows = Math.max(1, Math.floor(h / 11));
            for (let r = 0; r < rows; r += 1) {
                for (let c = 0; c < cols; c += 1) {
                    if (random() > windows) continue;
                    ctx.fillStyle = random() > 0.75 ? '#ff7ac1' : '#7fe8ff';
                    ctx.globalAlpha = 0.25 + random() * 0.55;
                    ctx.fillRect(x + 3 + c * 8, top + 6 + r * 11, 2.5, 4);
                }
            }
            ctx.globalAlpha = 1;
        }

        // Вертикальная вывеска — иероглифический столбик из светящихся плашек.
        if (signs && random() > 0.72 && h > 55) {
            const color = SIGN_COLORS[Math.floor(random() * SIGN_COLORS.length)];
            const sx = x + w - 7;
            const cells = 3 + Math.floor(random() * 4);
            ctx.fillStyle = color;
            for (let i = 0; i < cells; i += 1) {
                ctx.globalAlpha = 0.55 + random() * 0.4;
                ctx.fillRect(sx, top + 10 + i * 9, 4, 6);
            }
            ctx.globalAlpha = 1;
        }

        x += w + 4 + random() * 14;
    }
}

function makeFar(random) {
    const c = buffer(LAYER_W, VIEW.h);
    const ctx = c.getContext('2d');

    // Зарево над горизонтом — источник всего света в кадре.
    const glow = ctx.createRadialGradient(LAYER_W * 0.35, VIEW.h * 0.72, 12, LAYER_W * 0.35, VIEW.h * 0.72, 380);
    glow.addColorStop(0, 'rgba(255, 45, 149, 0.34)');
    glow.addColorStop(0.45, 'rgba(124, 77, 255, 0.16)');
    glow.addColorStop(1, 'rgba(5, 6, 15, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, LAYER_W, VIEW.h);

    // Планета: единственная круглая вещь в городе из прямых углов.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#7c4dff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(LAYER_W * 0.74, VIEW.h * 0.24, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#7c4dff';
    ctx.fill();
    ctx.restore();

    skyline(ctx, random, {
        baseline: VIEW.h * 0.86,
        minH: 42, maxH: 120,
        fill: '#0a0d1e', edge: 'rgba(124, 77, 255, 0.55)',
        windows: 0.10, signs: false,
    });
    return c;
}

function makeMid(random) {
    const c = buffer(LAYER_W, VIEW.h);
    const ctx = c.getContext('2d');
    skyline(ctx, random, {
        baseline: VIEW.h * 0.94,
        minH: 70, maxH: 180,
        fill: '#080a18', edge: 'rgba(34, 232, 255, 0.6)',
        windows: 0.16, signs: true,
    });
    return c;
}

function makeNear(random) {
    const c = buffer(LAYER_W, VIEW.h);
    const ctx = c.getContext('2d');
    skyline(ctx, random, {
        baseline: VIEW.h + 24,
        minH: 110, maxH: 230,
        fill: '#05060f', edge: 'rgba(255, 45, 149, 0.42)',
        windows: 0.07, signs: true,
    });

    // Провисающие кабели — то, что делает город обжитым, а не построенным.
    ctx.strokeStyle = 'rgba(120, 160, 220, 0.22)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i += 1) {
        const x0 = random() * LAYER_W;
        const y0 = 24 + random() * 110;
        const span = 110 + random() * 160;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x0 + span / 2, y0 + 30 + random() * 26, x0 + span, y0 - 6 + random() * 18);
        ctx.stroke();
    }
    return c;
}

export function createBackdrop(seed = 20260829) {
    return [
        { canvas: makeFar(rng(seed)), px: 0.12, py: 0.05, dy: -14, haze: 0.30 },
        { canvas: makeMid(rng(seed + 991)), px: 0.30, py: 0.11, dy: -4, haze: 0.20 },
        { canvas: makeNear(rng(seed + 7717)), px: 0.55, py: 0.22, dy: 12, haze: 0.08 },
    ];
}

/**
 * Нарисованный слой кладётся в половину своего размера: исходник в 1920×540
 * рассчитан на два экрана по высоте, а показывать надо один. Уменьшение
 * вдвое заодно делает кромки чётче, чем они были в файле.
 */
function drawArtLayer(ctx, art, layer, camX, camY, camMaxY) {
    const w = art.width / 2;
    const h = art.height / 2;
    const offset = ((-camX * layer.px) % w + w) % w;
    // Отсчёт от НИЗА уровня, а не от нуля камеры: игра идёт по земле, и
    // город должен стоять на месте именно там, поднимаясь, когда лезешь вверх.
    const y = VIEW.h - h + (camMaxY - camY) * layer.py + (layer.dy ?? 0);
    for (let x = offset - w; x < VIEW.w; x += w) ctx.drawImage(art, x, y, w, h);
}

/**
 * Воздушная перспектива. Нарисованные слои почти черны — как и небо, — и
 * без дымки силуэты в них не читаются вовсе. Пелена кладётся ПОСЛЕ каждого
 * слоя, поэтому накапливается: дальнее выцветает сильнее ближнего, и
 * глубина получается сама, без единого градиента внутри объектов.
 */
function haze(ctx, amount) {
    if (!amount) return;
    ctx.fillStyle = `rgba(38, 28, 74, ${amount})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
}

export function drawBackdrop(ctx, layers, camX, camY, art = null, camMaxY = 0) {
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    sky.addColorStop(0, '#05060f');
    sky.addColorStop(0.55, '#0a0b1c');
    sky.addColorStop(1, '#120a22');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    layers.forEach((layer, i) => {
        if (art?.[i]) {
            drawArtLayer(ctx, art[i], layer, camX, camY, camMaxY);
            haze(ctx, layer.haze);
            return;
        }
        const offset = ((-camX * layer.px) % LAYER_W + LAYER_W) % LAYER_W;
        const y = (camMaxY - camY) * layer.py;
        ctx.drawImage(layer.canvas, offset - LAYER_W, y);
        ctx.drawImage(layer.canvas, offset, y);
        if (offset + LAYER_W < VIEW.w) ctx.drawImage(layer.canvas, offset + LAYER_W, y);
    });
}

export { LAYER_W };
