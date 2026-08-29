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
import { createAudio } from './audio.js';

const canvas = document.getElementById('screen');
const overlay = document.getElementById('overlay');
const input = createInput(window);
const audio = createAudio();
const renderer = createRenderer(canvas);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let world = createWorld();
let camera = createCamera(world);
let screen = 'title';

function show(name) {
    screen = name;
    overlay.dataset.show = name;
    if (name === 'won') {
        document.getElementById('won-score').textContent = String(world.score);
        document.getElementById('won-loot').textContent = `${world.collected} / ${world.totalLoot}`;
    }
    if (name === 'lost') {
        document.getElementById('lost-score').textContent = String(world.score);
    }
}

function restart() {
    world = createWorld();
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
            stepWorld(world, readIntent(input), STEP);
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
    if (screen === 'none') show('paused');
});

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
    restart,
    advance(keys = {}, seconds = 1) {
        const base = {
            left: false, right: false, up: false, down: false,
            jumpHeld: false, jumpDown: false, attackDown: false,
        };
        const steps = Math.max(1, Math.round(seconds / STEP));
        for (let i = 0; i < steps; i += 1) {
            stepWorld(world, {
                ...base,
                ...keys,
                jumpDown: Boolean(keys.jumpDown) && i === 0,
                attackDown: Boolean(keys.attackDown) && i === 0,
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
        };
    },
};

show('title');
requestAnimationFrame(frame);

export { world, renderer, VIEW };
