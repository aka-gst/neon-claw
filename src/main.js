/**
 * Сборка игры: цикл, экраны, привязка ввода к миру.
 *
 * Шаг симуляции фиксированный (1/120), кадр отрисовки — какой дал браузер.
 * Иначе физика платформера начинает зависеть от частоты монитора: на 120 Гц
 * прыжок выходит выше, чем на 60, и настраивать его становится нечем.
 */

import { STEP, VIEW } from './tuning.js';
import { createWorld, stepWorld } from './world.js';
import { createCamera, updateCamera } from './camera.js';
import { createRenderer, render, resizeRenderer } from './render.js';
import { createInput, readIntent } from './input.js';
import { createTouch, hasTouch } from './touch.js';
import { createAudio } from './audio.js';
import { MODES, MODE_ORDER, DEFAULT_MODE } from './combat.js';
import { loadTileset, loadBackdrop } from './assets.js';
import { LEVELS, LEVEL_ORDER, DEFAULT_LEVEL, getLevel } from './levels.js';
import { recordRun, resultFor, formatTime } from './results.js';

const canvas = document.getElementById('screen');
const overlay = document.getElementById('overlay');
const input = createInput(window);
const audio = createAudio();
const renderer = createRenderer(canvas);

// Сенсорные кнопки появляются только там, где есть сенсор: на планшете с
// клавиатурой и на узком окне рабочего стола они мешают, а не помогают.
const touchRoot = document.getElementById('touch');
const touch = hasTouch() ? createTouch(touchRoot) : null;
if (touch) {
    touchRoot.hidden = false;
    document.body.classList.add('has-touch');
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


let modeId = DEFAULT_MODE;
let levelId = DEFAULT_LEVEL;
let world = createWorld(getLevel(levelId).rows, modeId);

// Ассеты подгружаются фоном: до их прихода игра рисует встроенным способом
// и работает точно так же. Украшение, а не условие — поэтому и грузится
// после того, как мир уже собран.
const district = getLevel(levelId).district;
loadTileset(district).then((tiles) => { renderer.tiles = tiles; });
loadBackdrop(district).then((art) => { renderer.art = art; });
let camera = createCamera(world);
let screen = 'title';

/**
 * Режим боя выбирается кнопкой или цифрой и меняется мгновенно, прямо
 * посреди забега. Сравнивать ощущения имеет смысл только так: один
 * уровень, одни руки, разные правила подряд.
 */
function setMode(next) {
    if (!MODES[next]) return;
    modeId = next;
    for (const el of document.querySelectorAll('[data-mode]')) {
        el.classList.toggle('is-on', el.dataset.mode === modeId);
    }
    restart();
}

/** Уровень тоже переключается на ходу: правила надо сравнивать на обоих. */
function setLevel(next) {
    if (!LEVELS[next]) return;
    levelId = next;
    for (const el of document.querySelectorAll('[data-level]')) {
        el.classList.toggle('is-on', el.dataset.level === levelId);
    }
    paintModeResults();
    restart();
}

function show(name) {
    screen = name;
    overlay.dataset.show = name;
    if (name === 'won') {
        const best = recordRun(`${levelId}:${world.mode.id}`, {
            time: world.elapsed,
            attempts: world.attempts,
            takedowns: world.takedowns,
            score: world.score,
            loot: world.collected,
        });
        document.getElementById('won-score').textContent = String(world.score);
        document.getElementById('won-loot').textContent = `${world.collected} / ${world.totalLoot}`;
        document.getElementById('won-mode').textContent = world.mode.name;
        document.getElementById('won-tries').textContent = String(world.attempts);
        document.getElementById('won-time').textContent = formatTime(world.elapsed);
        document.getElementById('won-quiet').textContent = String(world.takedowns);
        document.getElementById('won-best').textContent = best.time < world.elapsed - 0.5
            ? `лучший проход в этом режиме — ${formatTime(best.time)}`
            : 'это лучший проход в режиме';
        paintModeResults();
    }
    if (name === 'lost') {
        document.getElementById('lost-score').textContent = String(world.score);
        document.getElementById('lost-mode').textContent = world.mode.name;
    }
}

function restart() {
    world = createWorld(getLevel(levelId).rows, modeId);
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
            stepWorld(world, readIntent(input, touch), STEP);
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

window.addEventListener('keydown', (event) => {
    audio.unlock();
    if (event.code === 'KeyM') audio.toggle();
    if (event.code === 'F2') renderer.debug = !renderer.debug;
    const slot = /^Digit([1-4])$/.exec(event.code);
    if (slot) setMode(MODE_ORDER[Number(slot[1]) - 1]);
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

for (const button of document.querySelectorAll('[data-mode]')) {
    button.addEventListener('click', () => {
        audio.unlock();
        setMode(button.dataset.mode);
        canvas.focus();
    });
}

window.addEventListener('blur', () => {
    touch?.release();
    if (screen === 'none') show('paused');
});

// Первое касание разблокирует звук: браузер не даст его иначе.
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

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
    restart,
    setMode,
    setLevel,
    show,
    advance(keys = {}, seconds = 1) {
        const base = {
            left: false, right: false, up: false, down: false,
            jumpHeld: false, jumpDown: false, attackDown: false, dashDown: false, walk: false,
        };
        const steps = Math.max(1, Math.round(seconds / STEP));
        for (let i = 0; i < steps; i += 1) {
            stepWorld(world, {
                ...base,
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
            mode: world.mode.id, attempts: world.attempts, takedowns: world.takedowns,
        };
    },
};

// Кнопки режимов строятся из самих правил: иначе список в разметке
// и список в `combat.js` разъедутся на первой же правке баланса.
const modesBox = document.getElementById('modes');
MODE_ORDER.forEach((id, i) => {
    const mode = MODES[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode';
    button.dataset.mode = id;
    button.innerHTML = `<b>${i + 1}. ${mode.name}</b><i>${mode.kin}</i>`
        + `<span>${mode.blurb}</span><em data-best="${id}"></em>`;
    button.addEventListener('click', () => {
        audio.unlock();
        setMode(id);
        canvas.focus();
    });
    modesBox.append(button);
});

/** Итоги прошлых прогонов прямо на карточках: выбирать удобнее рядом с цифрами. */
function paintModeResults() {
    for (const slot of document.querySelectorAll('[data-best]')) {
        const best = resultFor(`${levelId}:${slot.dataset.best}`);
        slot.textContent = best
            ? `лучшее ${formatTime(best.time)} · попыток ${best.attempts}`
                + (best.takedowns ? ` · тихо ${best.takedowns}` : '')
            : '';
    }
}

const levelsBox = document.getElementById('levels');
LEVEL_ORDER.forEach((id) => {
    const level = LEVELS[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode level';
    button.dataset.level = id;
    button.innerHTML = `<b>${level.name}</b><span>${level.hint}</span>`;
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

paintModeResults();
for (const el of document.querySelectorAll('[data-mode]')) {
    el.classList.toggle('is-on', el.dataset.mode === modeId);
}
show('title');
requestAnimationFrame(frame);

export { world, renderer, VIEW };
