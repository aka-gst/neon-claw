/**
 * Тела и камень. Никакого DOM, никакой отрисовки — только движение.
 *
 * Тело задано так: `x` — середина, `y` — подошвы. Это неудобно для
 * математики и очень удобно для всего остального: приземление, стойка на
 * карнизе, спавн «поставь сюда» — всё это про ноги, а не про угол рамки.
 *
 * Оси разводятся: сначала целиком по горизонтали, потом по вертикали.
 * Одновременное решение обеих осей ловит углы и застревает в стыках тайлов —
 * а разведённое даёт скольжение вдоль стены бесплатно.
 */

import { TILE, LEDGE } from './tuning.js';
import { AIR, SOLID, ONEWAY, tileAt, colAt, rowAt, solidInRect } from './level.js';

/** Шаг разбиения хода. Меньше тайла — иначе тонкая стенка проскакивается. */
const SUBSTEP = TILE / 4;

export function makeBody(x, y, w, h) {
    return {
        x, y, w, h,
        vx: 0,
        vy: 0,
        onGround: false,
        hitWall: 0,
        hitCeiling: false,
        /** Пока тикает, помосты не держат — это спрыгивание вниз. */
        dropTimer: 0,
    };
}

export const bodyLeft = (b) => b.x - b.w / 2;
export const bodyTop = (b) => b.y - b.h;

function blocked(level, b, x, y) {
    return solidInRect(level, x - b.w / 2, y - b.h, b.w, b.h);
}

export function moveX(level, b, dx) {
    b.hitWall = 0;
    if (dx === 0) return;
    const steps = Math.max(1, Math.ceil(Math.abs(dx) / SUBSTEP));
    const inc = dx / steps;
    for (let i = 0; i < steps; i += 1) {
        const nx = b.x + inc;
        if (!blocked(level, b, nx, b.y)) {
            b.x = nx;
            continue;
        }
        if (inc > 0) b.x = colAt(nx + b.w / 2) * TILE - b.w / 2 - 0.01;
        else b.x = (colAt(nx - b.w / 2) + 1) * TILE + b.w / 2 + 0.01;
        b.hitWall = inc > 0 ? 1 : -1;
        b.vx = 0;
        return;
    }
}

/**
 * Помост держит только при движении сверху вниз и только если подошвы
 * действительно пересекли его кромку за этот шаг. Отсюда бесплатно
 * получаются оба привычных поведения: снизу сквозь него можно прыгнуть,
 * а «вниз + прыжок» роняет с него, потому что таймер отключает проверку.
 */
function onewayTop(level, b, fromY, toY) {
    if (b.dropTimer > 0 || toY <= fromY) return null;
    const c0 = colAt(b.x - b.w / 2);
    const c1 = colAt(b.x + b.w / 2 - 0.001);
    for (let row = rowAt(fromY); row <= rowAt(toY); row += 1) {
        const top = row * TILE;
        if (fromY > top || toY <= top) continue;
        for (let col = c0; col <= c1; col += 1) {
            if (tileAt(level, col, row) === ONEWAY) return top;
        }
    }
    return null;
}

export function moveY(level, b, dy) {
    b.onGround = false;
    b.hitCeiling = false;
    if (dy === 0) {
        // Стоя на месте всё равно нужно знать, есть ли опора под ногами.
        b.onGround = blocked(level, b, b.x, b.y + 1) || onewayTop(level, b, b.y, b.y + 1) !== null;
        return;
    }
    const steps = Math.max(1, Math.ceil(Math.abs(dy) / SUBSTEP));
    const inc = dy / steps;
    for (let i = 0; i < steps; i += 1) {
        const ny = b.y + inc;

        const shelf = onewayTop(level, b, b.y, ny);
        if (shelf !== null) {
            b.y = shelf;
            b.vy = 0;
            b.onGround = true;
            return;
        }

        if (!blocked(level, b, b.x, ny)) {
            b.y = ny;
            continue;
        }

        if (inc > 0) {
            b.y = rowAt(ny - 0.001) * TILE;
            b.onGround = true;
        } else {
            b.y = (rowAt(ny - b.h) + 1) * TILE + b.h;
            b.hitCeiling = true;
        }
        b.vy = 0;
        return;
    }
    if (inc > 0) {
        b.onGround = blocked(level, b, b.x, b.y + 1) || onewayTop(level, b, b.y, b.y + 1) !== null;
    }
}

/**
 * Поиск кромки перед лицом.
 *
 * Возвращает, куда встать в вис и куда подтянуться, либо null. Окно сверху
 * заметно щедрее, чем снизу: игрок целится глазами по краю стены, а не по
 * собственной макушке, и промах в полтайла он читает как поломку, а не как
 * свою ошибку.
 */
export function findLedge(level, b, facing) {
    if (b.vy < -LEDGE.maxRise) return null;

    const head = b.y - b.h;
    const probeX = b.x + facing * (b.w / 2 + 3);
    const col = colAt(probeX);
    const first = rowAt(head - LEDGE.above);
    const last = rowAt(head + LEDGE.below);

    for (let row = first; row <= last; row += 1) {
        if (tileAt(level, col, row) !== SOLID) continue;
        // Кромка — это камень, над которым пусто. Середина стены не считается.
        if (tileAt(level, col, row - 1) !== AIR) continue;

        const top = row * TILE;
        if (head < top - LEDGE.above || head > top + LEDGE.below) return null;

        const face = facing > 0 ? col * TILE : (col + 1) * TILE;
        const hangX = face - facing * (b.w / 2 + 1);
        const hangY = top + LEDGE.handOffset + b.h;
        const standX = col * TILE + TILE / 2;

        // Некуда подтягиваться — не за что и цепляться.
        if (blocked(level, { ...b, x: standX, y: top }, standX, top)) return null;
        if (blocked(level, b, hangX, hangY)) return null;

        return { hangX, hangY, standX, standY: top, col, row, facing };
    }
    return null;
}

export const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const bodyRect = (b) => ({ x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h });

export { SOLID, ONEWAY, AIR };
