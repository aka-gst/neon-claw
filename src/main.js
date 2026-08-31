/**
 * Сборка игры: цикл, экраны, привязка ввода к миру.
 *
 * Шаг симуляции фиксированный (1/120), кадр отрисовки — какой дал браузер.
 * Иначе физика платформера начинает зависеть от частоты монитора: на 120 Гц
 * прыжок выходит выше, чем на 60, и настраивать его становится нечем.
 */

import { STEP, VIEW, fitView, BLADES } from './tuning.js';
import { createWorld, stepWorld } from './world.js';
import { createCamera, updateCamera } from './camera.js';
import { createRenderer, render, resizeRenderer } from './render.js';
import { createInput, readIntent } from './input.js';
import { createTouch, hasTouch } from './touch.js';
import { createAudio } from './audio.js';
import { loadTileset, loadBackdrop } from './assets.js';
import { LEVELS, DEFAULT_LEVEL, getLevel } from './levels.js';
import { recordRun, resultFor, formatTime } from './results.js';
import { pulse } from './pulse.js';

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

/** Итог прошлого прохождения — строкой на титульном экране. */
function paintResults() {
    const slot = document.getElementById('best');
    if (!slot) return;
    const best = resultFor(levelId);
    slot.textContent = best
        ? `лучший проход: ${formatTime(best.time)}, попыток ${best.attempts}`
        : '';
}

function show(name) {
    screen = name;
    overlay.dataset.show = name;
    // Кнопки управления и меню не должны существовать одновременно:
    // на телефоне они лежат в одних и тех же местах экрана.
    document.body.classList.toggle('menu-open', name !== 'none');
    if (name !== 'none') touch?.release();
    if (name === 'won') {
        pulse('level-clear', {
            level: levelId,
            attempts: world.attempts,
            seconds: Math.round(world.elapsed),
            loot: world.collected,
            of: world.totalLoot,
            score: world.score,
        });
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
            ? `лучший проход — ${formatTime(best.time)}`
            : 'это лучший проход';
        // Уровни идут цепочкой: кнопка ведёт дальше, а не в то же самое.
        const next = getLevel(levelId).next;
        const button = document.querySelector('section[data-screen="won"] button');
        button.textContent = next ? `ДАЛЬШЕ · ${LEVELS[next].name.toUpperCase()}` : 'ЕЩЁ РАЗ';
        button.dataset.action = next ? 'next' : 'start';
    }
    if (name === 'lost') {
        pulse('level-fail', {
            level: levelId,
            attempts: world.attempts,
            seconds: Math.round(world.elapsed),
            score: world.score,
        });
        document.getElementById('lost-score').textContent = String(world.score);
    }
}

let started = 0;

function restart() {
    started += 1;
    pulse('level-start', { level: levelId, run: started });
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

const swapButton = document.getElementById('tswap');

/**
 * Кнопка смены клинка на телефоне сама говорит, что сейчас в руке. На
 * маленьком экране угол с иконками теряется, а палец уже лежит на кнопке —
 * пусть подпись и будет главным указателем.
 */
function paintSwapButton(world) {
    if (!swapButton) return;
    const held = BLADES[world.player.blade];
    if (!held) return;
    if (swapButton.textContent !== held.name) swapButton.textContent = held.name;
    swapButton.classList.toggle('is-frost', held.id === 'frost');
}

function frame(now) {
    const elapsed = Math.min(0.2, (now - last) / 1000);
    last = now;

    if (input.take('restart') && screen !== 'title') restart();
    if (input.take('pause')) {
        if (screen === 'none') show('paused');
        else if (screen === 'paused') show('none');
    }

    // Серия смертей — отдельная точка выхода: бросают именно здесь, а не
    // на поражении. Отмечаем один раз за забег, чтобы не залить данные.
    if (world.attempts >= 5 && !world.reported) {
        world.reported = true;
        pulse('level-stuck', {
            level: levelId,
            attempts: world.attempts,
            seconds: Math.round(world.elapsed),
        });
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
    paintSwapButton(world);
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
    if (screen === 'title' && (event.code === 'Space' || event.code === 'Enter')) {
        event.preventDefault();
        restart();
    }
    if ((screen === 'won' || screen === 'lost') && event.code === 'Enter') restart();
});

// Обработчик один на все экраны: кнопки различает только цель. «Дальше»
// ведёт на следующий уровень, остальные начинают заново.
overlay.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    audio.unlock();
    if (button.dataset.action === 'next') {
        const next = getLevel(levelId).next;
        if (next) levelId = next;
    }
    restart();
    canvas.focus();
});

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
    audio,
    pointer,
    restart,
    show,
    paintSwapButton,
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
                // Смена клинка — тоже фронт: иначе зажатое в хуке нажатие
                // перекидывало бы клинок каждый шаг, и прогон проверял бы
                // не игру, а сам себя.
                swapDown: Boolean(keys.swapDown) && i === 0,
                bladeIndex: i === 0 ? (keys.bladeIndex ?? null) : null,
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
            blade: p.blade,
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
