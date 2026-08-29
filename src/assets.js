/**
 * Загрузка внешних ассетов — и их проверка.
 *
 * Тайлсеты приходят от генератора, то есть снаружи. Доверять им нельзя:
 * одна опечатка в роли или координате — и вместо района получится каша,
 * причём молча. Поэтому всё, что пришло, сначала проверяется по той же
 * схеме, что записана в `docs/asset-request.md`, и при первом же
 * несоответствии отбрасывается целиком.
 *
 * Отсутствие ассетов — не ошибка: игра рисует встроенным способом и
 * работает ровно так же. Это важно и для тестов, и для того, чтобы
 * сломанная поставка не роняла игру.
 */

export const TILE_ROLES = new Set([
    'edge', 'side', 'body', 'detail', 'wire', 'sign', 'hot', 'loot', 'data', 'foe',
]);

export const TILE_KINDS = ['solid.top', 'solid.body', 'oneway', 'ladder', 'hazard', 'prop'];

const OPS = new Set(['line', 'rect', 'poly', 'arc']);
const BOUND = 26;

const inBounds = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -BOUND && v <= BOUND * 2;

function checkOp(op) {
    if (!op || !OPS.has(op.op) || !TILE_ROLES.has(op.role)) return false;
    if (op.op === 'line' || op.op === 'poly') {
        if (!Array.isArray(op.pts) || op.pts.length < 2) return false;
        return op.pts.every((pt) => Array.isArray(pt) && pt.length === 2 && pt.every(inBounds));
    }
    if (op.op === 'rect') return [op.x, op.y, op.w, op.h].every(inBounds);
    if (op.op === 'arc') return [op.cx, op.cy, op.r, op.a0, op.a1].every((v) => typeof v === 'number');
    return false;
}

/** Возвращает набор тайлов либо null с внятной причиной в консоли. */
export function validateTileset(data, label = 'tileset') {
    if (!data || typeof data !== 'object' || !data.kinds) {
        console.warn(`${label}: нет поля kinds — набор отброшен`);
        return null;
    }
    for (const [kind, variants] of Object.entries(data.kinds)) {
        if (!Array.isArray(variants) || variants.length === 0) {
            console.warn(`${label}: ${kind} — не массив вариантов`);
            return null;
        }
        for (const ops of variants) {
            if (!Array.isArray(ops) || !ops.every(checkOp)) {
                console.warn(`${label}: ${kind} — вариант не проходит схему`);
                return null;
            }
        }
    }
    if (!data.kinds['solid.top'] || !data.kinds['solid.body']) {
        console.warn(`${label}: нет обязательных solid.top / solid.body`);
        return null;
    }
    return data;
}

export async function loadTileset(district) {
    try {
        const res = await fetch(`./assets/tiles/${district}.json`, { cache: 'no-cache' });
        if (!res.ok) return null;
        return validateTileset(await res.json(), `tiles/${district}`);
    } catch {
        // Ассетов может не быть вовсе — это штатный случай, а не поломка.
        return null;
    }
}

function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/**
 * Слои параллакса района. Отсутствие любого из трёх отменяет весь набор:
 * два нарисованных слоя поверх одного сгенерированного выглядят хуже, чем
 * три сгенерированных, — стили не смешиваются, а спорят.
 */
export async function loadBackdrop(district) {
    const layers = await Promise.all(
        ['far', 'mid', 'near'].map((n) => loadImage(`./assets/backdrop/${district}-${n}.png`)),
    );
    return layers.every(Boolean) ? layers : null;
}

/**
 * Выбор варианта по клетке. Детерминированный: стена должна выглядеть
 * одинаково при каждом входе в комнату, иначе она мерцает при скролле.
 */
export function variantAt(col, row, count) {
    let h = (col * 73856093) ^ (row * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return count ? h % count : 0;
}
