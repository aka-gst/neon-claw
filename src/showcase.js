/**
 * Постановочные состояния для витрины.
 *
 * Сцена не рисует «красивый» кадр поверх игры: она ставит бойцов и проходит
 * настоящий шаг мира. Поэтому при смене боя не останется старой подделки
 * попадания, которую игра сама больше не умеет произвести.
 */

import { footingAt, solidAtPoint } from './level.js';
import { BLADES, TILE, SWORD, VIEW, PLAYER } from './tuning.js';

const COUNTER_OF = { heat: 'frost', frost: 'heat' };

const IMPACT_GAP = 14;
/** Откуда начинается заход: далеко за пределом зрения стража. */
const SNEAK_FROM = 170;
/** С какого разрыва бить: дальше слепой зоны, ближе досягаемости клинка. */
const SNEAK_GAP = 24;

/** Узнаёт только известные сцены: чужой параметр не меняет обычную игру. */
const SCENES = new Set(['impact', 'backstab']);

export function sceneFromSearch(search = '') {
    const name = new URLSearchParams(search).get('scene');
    return SCENES.has(name) ? name : null;
}

/**
 * Ставит первый доступный бой на миг настоящего попадания.
 *
 * `step` передаётся снаружи, чтобы браузер и тест вели мир одним путём.
 */
export function stageImpact(world, step) {
    const foe = world.enemies.find((enemy) => enemy.state !== 'dead');
    if (!foe) throw new Error('сцене удара нужен живой страж');

    const p = world.player;
    p.body.x = foe.body.x - IMPACT_GAP;
    p.body.y = foe.body.y;
    p.body.vx = 0;
    p.body.vy = 0;
    p.body.onGround = true;
    p.facing = 1;
    p.attack.phase = 'none';
    p.attack.t = 0;
    p.attack.hits.clear();
    foe.state = 'patrol';
    foe.t = 0;
    foe.alert = 0;
    foe.cooldown = 0;
    foe.body.vx = 0;
    foe.body.vy = 0;
    world.events.length = 0;
    world.sparks.length = 0;
    world.rings.length = 0;
    world.shake = 0;

    for (let i = 0; i < 90; i += 1) {
        step({ attackDown: i === 0 });
        if (world.events.includes('hit')) {
            return { name: 'impact', events: [...world.events] };
        }
    }
    throw new Error('сцена удара не дошла до попадания');
}

/**
 * Проходим ли путь к спине стража с этой стороны: под ногами земля, на
 * уровне груди нет стены. Одного пола мало — у первого стража пол есть, а
 * подойти нельзя: дорогу перекрывает уступ, на котором стоит сосед.
 *
 * `side` — куда пойдёт герой: +1 вправо (значит начинает слева), −1 влево.
 */
function reachableFromBehind(world, foe, from, side) {
    for (let k = 1; k <= from / (TILE / 2); k += 1) {
        const x = foe.body.x - side * k * (TILE / 2);
        if (!footingAt(world.level, x, foe.body.y + 2)) return false;
        // По ВСЕЙ высоте героя, а не по одной точке груди. Первая версия
        // щупала только `y - 14` и пропустила низкий потолок на подходе
        // справа: путь считался проходимым, а герой упирался головой и за
        // двести шагов сдвигался на восемнадцать пикселей — в другую сторону.
        for (let dy = -PLAYER.h + 2; dy < 0; dy += 6) {
            if (solidAtPoint(world.level, x - PLAYER.w / 2, foe.body.y + dy)) return false;
            if (solidAtPoint(world.level, x + PLAYER.w / 2, foe.body.y + dy)) return false;
        }
    }
    return true;
}

/** Влезет ли страж в кадр целиком: у края карты камера упирается. */
function framesWell(world, foe) {
    const width = world.level.rows[0].length * TILE;
    return Math.min(foe.body.x, width - foe.body.x) >= VIEW.w / 2;
}

/** Первый страж, к которому можно подойти сзади; кадр в центре — лучше. */
function pickTarget(world) {
    const варианты = [];
    for (const foe of world.enemies) {
        if (foe.state === 'dead') continue;
        for (const side of [1, -1]) {
            if (reachableFromBehind(world, foe, SNEAK_FROM, side)) {
                варианты.push({ foe, side, хорошийКадр: framesWell(world, foe) });
            }
        }
    }
    return варианты.find((v) => v.хорошийКадр) ?? варианты[0] ?? null;
}

/**
 * Заход со спины и тихое снятие — для карточки на витрине.
 *
 * Показывает настоящую механику, а не постановку: страж смотрит в другую
 * сторону и сзади видит только вплотную (слепая зона 14 при досягаемости
 * клинка 30 — окно между ними и есть весь приём). Прыжок в конце не
 * украшение: он сокращает последний отрезок, оставаясь вне зрения.
 *
 * Сцена ОБЯЗАНА падать, если снятие не засчиталось. Иначе она покажет
 * обычное добивание в лицо под видом захода за спину — то есть пообещает
 * то, чего в кадре нет.
 */
export function stageBackstab(world, step, { пошагово = false } = {}) {
    const выбор = pickTarget(world);
    if (!выбор) throw new Error('сцене снятия нужен страж, к спине которого есть проход');
    const { foe, side } = выбор;

    const p = world.player;
    // Здоровье НЕ трогаем. Раньше сцена срезала его до четырёх, чтобы
    // верный клинок добивал с одного удара, — иначе снятия не выходило.
    // С 7 сентября удар в спину убивает разом при любом здоровье, и
    // ослаблять стража значит показывать в кадре неправду: ровно то, за
    // что оператор корил себя за вчерашнюю петлю.
    foe.state = 'patrol';
    foe.alert = 0;
    foe.facing = side;          // смотрит прочь от того, откуда идёт герой
    foe.turning = 0;
    foe.body.vx = 0;
    foe.body.vy = 0;

    p.blade = COUNTER_OF[foe.element] ?? p.blade;
    p.body.x = foe.body.x - side * SNEAK_FROM;
    p.body.y = foe.body.y;
    p.body.vx = 0;
    p.body.vy = 0;
    p.body.onGround = true;
    p.facing = side;
    p.attack.phase = 'none';
    p.attack.t = 0;
    p.attack.hits.clear();
    world.events.length = 0;
    world.sparks.length = 0;
    world.rings.length = 0;
    world.shake = 0;
    world.notice = null;        // подсказки лезут поверх боя и портят кадр
    const снятийДо = world.takedowns;

    // Пошаговый режим для съёмки: сцена только РАССТАВЛЯЕТ и отдаёт план,
    // а заход и удар оператор ведёт сам, снимая кадры. Обычный режим
    // отыгрывает всё до возврата, и процесса в нём не видно — а Сергей
    // просит видеть, как герой подходит и убивает.
    if (пошагово) {
        return {
            name: 'backstab',
            пошагово: true,
            цель: foe.id,
            сторона: side,
            куда: side > 0 ? 'right' : 'left',
            разрыв: () => Math.round(Math.abs(foe.body.x - p.body.x)),
            бить: () => Math.abs(foe.body.x - p.body.x) <= SNEAK_GAP,
            снялось: () => world.takedowns > снятийДо,
            подсказка: `держать {${side > 0 ? 'right' : 'left'}: true}, бить при разрыве ≤ ${SNEAK_GAP}`,
        };
    }

    const вперёд = side > 0 ? { right: true } : { left: true };
    const дальше = () => Math.abs(foe.body.x - p.body.x);
    // Страж на время захода стоит. Это постановка, и она названа: в патруле
    // он уходит от подходящего с той же примерно скоростью, и разрыв не
    // сокращается вовсе — замерено, 139 пикселей за двести шагов. Стоящий
    // на месте страж — обычная пауза патруля, а не выдуманное поведение.
    const место = foe.body.x;
    const держатьЦель = () => {
        foe.body.x = место;
        foe.body.vx = 0;
        foe.facing = side;
    };

    // 1. Подход по земле: страж смотрит в другую сторону и не оборачивается.
    for (let i = 0; i < 200 && дальше() > SNEAK_FROM / 2; i += 1) {
        держатьЦель();
        step({ ...вперёд });
    }

    // 2. Прыжок сокращает последний отрезок, оставаясь вне зрения.
    держатьЦель();
    step({ ...вперёд, jumpDown: true, jumpHeld: true });
    for (let i = 0; i < 200 && (дальше() > SNEAK_GAP || !p.body.onGround); i += 1) {
        держатьЦель();
        step({ ...вперёд, jumpHeld: i < 8 });
    }
    держатьЦель();

    const разрыв = Math.round(дальше());
    if (разрыв > SWORD.reach) throw new Error(`сцена снятия: не подошёл, разрыв ${разрыв}`);

    // 3. Удар в спину. Смотреть надо ВПЕРЁД по ходу захода: герой подошёл
    //    сзади и остался с той же стороны, страж перед ним.
    p.facing = side;
    for (let i = 0; i < 90; i += 1) {
        step({ attackDown: i === 0 });
        if (world.events.includes('kill')) {
            if (world.takedowns === снятийДо) {
                throw new Error('сцена снятия: страж успел обернуться, удар пришёлся не в спину');
            }
            // Чекпоинт по дороге успевает показать подсказку, и она лезет
            // поверх боя. В кадре ей не место.
            world.notice = null;
            return { name: 'backstab', разрыв, снятий: world.takedowns - снятийДо, сторона: side };
        }
    }
    throw new Error('сцена снятия не дошла до добивания');
}
