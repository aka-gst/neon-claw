/**
 * Сборка игры: цикл, экраны, привязка ввода к миру.
 *
 * Шаг симуляции фиксированный (1/120), кадр отрисовки — какой дал браузер.
 * Иначе физика платформера начинает зависеть от частоты монитора: на 120 Гц
 * прыжок выходит выше, чем на 60, и настраивать его становится нечем.
 */

import { STEP, VIEW, fitView } from './tuning.js';
import { createWorld, stepWorld } from './world.js';
import { createCamera, updateCamera } from './camera.js';
import { createRenderer, render, resizeRenderer } from './render.js';
import { createInput, readIntent } from './input.js';
import { createTouch, hasTouch } from './touch.js';
import { createAudio } from './audio.js';
import { loadTileset, loadBackdrop } from './assets.js';
import { LEVELS, LEVEL_ORDER, DEFAULT_LEVEL, getLevel } from './levels.js';
import { recordRun, resultFor, formatTime } from './results.js';

const canvas = document.getElementById('screen');
const overlay = document.getElementById('overlay');
const input = createInput(window);
const audio = createAudio();
// Сенсорные кнопки появляются только там, где есть сенсор: на планшете с
// клавиатурой и на узком окне рабочего стола они мешают, а не помогают.
// Класс ставится до первого замера: от него зависит размер кадра.
const touchRoot = document.getElementById('touch');
const touch = hasTouch() ? createTouch(touchRoot) : null;
if (touch) {
    touchRoot.hidden = false;
    document.body.classList.add('has-touch');
}

const frameBox = document.querySelector('.frame');

/**
 * Подгонка мира под форму экрана. Пересобирает рендер целиком: и буфер
 * свечения, и слои фона печатаются от размеров кадра, а он только что
 * изменился. Загруженные ассеты переносятся — их незачем качать заново.
 */
function fitToFrame(previous = null) {
    fitView(frameBox.clientWidth, frameBox.clientHeight);
    const next = createRenderer(canvas);
    if (previous) {
        next.tiles = previous.tiles;
        next.art = previous.art;
        next.debug = previous.debug;
    }
    return next;
}

let renderer = fitToFrame();

// Поворот телефона меняет форму кадра, а с ней и то, сколько видно мира.
// Пересобираем — но не чаще одного раза на кадр отрисовки.
let refitQueued = false;
const queueRefit = () => {
    if (refitQueued) return;
    refitQueued = true;
    requestAnimationFrame(() => {
        refitQueued = false;
        const before = `${VIEW.w}x${VIEW.h}`;
        fitView(frameBox.clientWidth, frameBox.clientHeight);
        if (`${VIEW.w}x${VIEW.h}` === before) return;
        renderer = fitToFrame(renderer);
    });
};
window.addEventListener('resize', queueRefit);
window.addEventListener('orientationchange', queueRefit);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


let levelId = DEFAULT_LEVEL;
let world = createWorld(getLevel(levelId).rows);

// Ассеты подгружаются фоном: до их прихода игра рисует встроенным способом
// и работает точно так же. Украшение, а не условие — поэтому и грузится
// после того, как мир уже собран.
const district = getLevel(levelId).district;
loadTileset(district).then((tiles) => { renderer.tiles = tiles; });
loadBackdrop(district).then((art) => { renderer.art = art; });
let camera = createCamera(world);
let screen = 'title';

/** Итоги прошлых прогонов прямо на карточке уровня. */
function paintResults() {
    for (const slot of document.querySelectorAll('[data-best]')) {
        const best = resultFor(slot.dataset.best);
        slot.textContent = best
            ? `лучшее ${formatTime(best.time)} · попыток ${best.attempts}`
                + (best.takedowns ? ` · тихо ${best.takedowns}` : '')
            : '';
    }
}

/** Уровень тоже переключается на ходу: правила надо сравнивать на обоих. */
function setLevel(next) {
    if (!LEVELS[next]) return;
    levelId = next;
    for (const el of document.querySelectorAll('[data-level]')) {
        el.classList.toggle('is-on', el.dataset.level === levelId);
    }
    paintResults();
    restart();
}

function show(name) {
    screen = name;
    overlay.dataset.show = name;
    // Кнопки управления и меню не должны существовать одновременно:
    // на телефоне они лежат в одних и тех же местах экрана.
    document.body.classList.toggle('menu-open', name !== 'none');
    if (name !== 'none') touch?.release();
    if (name === 'won') {
        const best = recordRun(levelId, {
            time: world.elapsed,
            attempts: world.attempts,
            takedowns: world.takedowns,
            score: world.score,
            loot: world.collected,
        });
        document.getElementById('won-score').textContent = String(world.score);
        document.getElementById('won-loot').textContent = `${world.collected} / ${world.totalLoot}`;
        document.getElementById('won-tries').textContent = String(world.attempts);
        document.getElementById('won-time').textContent = formatTime(world.elapsed);
        document.getElementById('won-quiet').textContent = String(world.takedowns);
        document.getElementById('won-best').textContent = best.time < world.elapsed - 0.5
            ? `лучший проход в этом режиме — ${formatTime(best.time)}`
            : 'это лучший проход в режиме';
        paintResults();
    }
    if (name === 'lost') {
        document.getElementById('lost-score').textContent = String(world.score);
    }
}

function restart() {
    world = createWorld(getLevel(levelId).rows);
    camera = createCamera(world);
    show('none');
}

function drainSound() {
    for (const event of world.events) audio.play(event);
    world.events.length = 0;
}

let last = performance.now();
let accumulator = 0;

function frame(now) {
    const elapsed = Math.min(0.2, (now - last) / 1000);
    last = now;

    if (input.take('restart') && screen !== 'title') restart();
    if (input.take('pause')) {
        if (screen === 'none') show('paused');
        else if (screen === 'paused') show('none');
    }

    if (screen === 'none') {
        accumulator += elapsed;
        let steps = 0;
        while (accumulator >= STEP && steps < 8) {
            stepWorld(world, readIntent(input, touch, pointer), STEP);
            accumulator -= STEP;
            steps += 1;
        }
        if (accumulator > STEP * 8) accumulator = 0;
        if (reduceMotion) world.shake = 0;
        drainSound();

        if (world.phase === 'won') show('won');
        else if (world.phase === 'lost') show('lost');
    }

    updateCamera(camera, world, elapsed);
    resizeRenderer(renderer);
    render(renderer, world, camera);
    requestAnimationFrame(frame);
}

/**
 * Прицел мышью. Угол и сила одним движением: чем дальше от героя курсор,
 * тем сильнее натянуто. Так в Bowman, и это лучше отдельного таймера —
 * рука уже показала и куда, и насколько, а дуга подтверждает.
 *
 * Отсчёт ведётся в мире, а не в пикселях экрана: кадр подстраивается под
 * телефон, и привязка к экрану врала бы при каждом повороте.
 */
const pointer = { active: false, x: 0, y: 0, power: 0 };

function aimAt(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const worldX = camera.x + ((event.clientX - rect.left) / rect.width) * VIEW.w;
    const worldY = camera.y + ((event.clientY - rect.top) / rect.height) * VIEW.h;
    const body = world.player.body;
    const dx = worldX - body.x;
    const dy = worldY - (body.y - body.h * 0.62);
    const len = Math.hypot(dx, dy) || 1;
    pointer.x = dx / len;
    pointer.y = dy / len;
    pointer.power = Math.max(0, Math.min(1, (len - 18) / 130));
}

canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || screen !== 'none') return;
    event.preventDefault();
    pointer.active = true;
    aimAt(event);
    try {
        canvas.setPointerCapture(event.pointerId);
    } catch {
        // Не вышло — прицел просто перестанет следить за курсором вне холста.
    }
});
canvas.addEventListener('pointermove', (event) => {
    if (pointer.active) aimAt(event);
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    canvas.addEventListener(type, () => { pointer.active = false; });
}
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

window.addEventListener('keydown', (event) => {
    audio.unlock();
    if (event.code === 'KeyM') audio.toggle();
    if (event.code === 'F2') renderer.debug = !renderer.debug;
    if (event.code === 'KeyL') {
        setLevel(LEVEL_ORDER[(LEVEL_ORDER.indexOf(levelId) + 1) % LEVEL_ORDER.length]);
    }
    if (screen === 'title' && (event.code === 'Space' || event.code === 'Enter')) {
        event.preventDefault();
        restart();
    }
    if ((screen === 'won' || screen === 'lost') && event.code === 'Enter') restart();
});

for (const button of document.querySelectorAll('[data-action="start"]')) {
    button.addEventListener('click', () => {
        audio.unlock();
        restart();
        canvas.focus();
    });
}

window.addEventListener('blur', () => {
    touch?.release();
    if (screen === 'none') show('paused');
});

// Первое касание разблокирует звук: браузер не даст его иначе.
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// Safari на iOS увеличивает щипком, что бы ни стояло в мета-теге. Гасим
// жест руками: в игре нет ничего, что имело бы смысл разглядывать ближе.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}

// Двойной тап по игре тоже увеличивает — но только если браузер успел
// решить, что это тап. Второе касание подряд отменяем.
let lastTap = 0;
document.addEventListener('touchend', (event) => {
    const now = event.timeStamp;
    if (now - lastTap < 320) event.preventDefault();
    lastTap = now;
}, { passive: false });

/**
 * Отладочный доступ. Игра идёт на requestAnimationFrame, а он замирает в
 * скрытой вкладке — снимать кадры и мерить баланс через него невозможно.
 * `advance` прогоняет симуляцию синхронно и рисует результат: этим удобно
 * и снимать скриншоты, и проверять правки в балансе, не гоняя руками.
 */
window.NEON = {
    get world() { return world; },
    get camera() { return camera; },
    renderer,
    input,
    touch,
    pointer,
    restart,
    setLevel,
    show,
    /**
     * Прогон без кадров. Ввод берётся общим путём — вместе с сенсором и
     * мышью: хук, который строит намерение по-своему, проверяет не игру,
     * а сам себя.
     */
    advance(keys = {}, seconds = 1) {
        const steps = Math.max(1, Math.round(seconds / STEP));
        for (let i = 0; i < steps; i += 1) {
            stepWorld(world, {
                ...readIntent(input, touch, pointer),
                ...keys,
                jumpDown: Boolean(keys.jumpDown) && i === 0,
                attackDown: Boolean(keys.attackDown) && i === 0,
                dashDown: Boolean(keys.dashDown) && i === 0,
            }, STEP);
            world.events.length = 0;
            updateCamera(camera, world, STEP);
        }
        resizeRenderer(renderer);
        render(renderer, world, camera);
        const p = world.player;
        return {
            x: Math.round(p.body.x), y: Math.round(p.body.y),
            state: p.state, hp: p.hp, score: world.score, phase: world.phase,
            attempts: world.attempts, takedowns: world.takedowns,
        };
    },
};

/**
 * Запуск. Обёрнут намеренно: ошибка на верхнем уровне модуля обрывает его
 * до цикла отрисовки, и игрок видит чёрный прямоугольник без единого слова.
 * Молчаливый отказ — худшее, что может случиться на живом сайте, поэтому
 * сломанный запуск обязан сказать о себе.
 */
try {
    const levelsBox = document.getElementById('levels');
    LEVEL_ORDER.forEach((id) => {
        const level = LEVELS[id];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mode level';
        button.dataset.level = id;
        button.innerHTML = `<b>${level.name}</b><span>${level.hint}</span>`
            + `<em data-best="${id}"></em>`;
        button.addEventListener('click', () => {
            audio.unlock();
            setLevel(id);
            canvas.focus();
        });
        levelsBox.append(button);
    });
    for (const el of document.querySelectorAll('[data-level]')) {
        el.classList.toggle('is-on', el.dataset.level === levelId);
    }

    paintResults();
    show('title');
    requestAnimationFrame(frame);

} catch (error) {
    overlay.dataset.show = 'title';
    overlay.innerHTML = '<section style="display:block">'
        + '<h2>НЕ ЗАПУСКАЕТСЯ</h2>'
        + '<p class="lead">Игра не смогла стартовать. Сообщение ниже поможет починить.</p>'
        + `<p class="hint">${String(error && error.message ? error.message : error)}</p>`
        + '</section>';
    throw error;
}

export { renderer, VIEW };
