/**
 * Дверь наружу. Обход десяти наших игр показал, что NEON CLAW была
 * единственной, где кнопок на экране НОЛЬ: с телефона нельзя было ни встать
 * на паузу, ни выйти, ни начать заново — всё висело на клавишах, которых там
 * нет. Человек в таком случае закрывает вкладку и не возвращается: он уносит
 * не «проиграл», а «игра меня заперла».
 *
 * Разметку в узле не отрисовать (правило про входной файл, который нельзя
 * импортировать), поэтому здесь ТЕКСТОВЫЙ сторож: он ловит удаление двери,
 * но не ручается за раскладку. Саму раскладку я мерил в браузере на 390×844:
 * кнопка паузы 44×44, верхний центр, со счётом и жизнями не пересекается.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('с каждого экрана есть выход, и на паузу можно встать пальцем', () => {
    const html = read('index.html');

    assert.ok(html.includes('id="pause"'),
        'нет кнопки паузы — с телефона в меню не попасть, клавиш там нет');

    const screens = html.split('<section data-screen=').slice(1);
    for (const name of ['title', 'paused']) {
        const block = screens.find((s) => s.startsWith(`"${name}"`));
        assert.ok(block, `нет экрана ${name}`);
        assert.ok(block.includes('data-action="home"'),
            `с экрана «${name}» нельзя уйти на сайт`);
    }

    const paused = screens.find((s) => s.startsWith('"paused"'));
    assert.ok(paused.includes('data-action="resume"'), 'с паузы нельзя вернуться в игру');
    assert.ok(paused.includes('data-action="start"'), 'с паузы нельзя начать заново');
});

test('выход посреди партии спрашивает подтверждение', () => {
    const main = read('src/main.js');
    assert.ok(/action === 'home'/.test(main), 'выход не обрабатывается');
    assert.ok(/world\.elapsed > 0[\s\S]{0,120}armed/.test(main),
        'выход не спрашивает при начатой партии — прогресс потеряется одним касанием');
});

test('выход — настоящая ссылка, а не кнопка на скрипте', () => {
    const html = read('index.html');
    // Ссылка работает без скрипта, открывается средним щелчком и находится
    // поиском по `a[href="/"]` — именно так витрина проверяет игры. Кнопкой
    // на обработчике дверь есть, а снаружи её как бы нет.
    assert.ok(/<a[^>]+href="\/"[^>]*data-action="home"|<a[^>]+data-action="home"[^>]*href="\/"/.test(html),
        'выход не ссылка: снаружи двери не видно');
    assert.ok(html.includes('site-home'), 'не взят общий вид кнопки выхода с сайта');
});

test('у ссылки выхода свой порог: правило про кнопки её не покрывает', () => {
    const css = read('styles/game.css');
    // Поймано замером: перейдя с button на a, выход стал 27×8 — впятеро ниже
    // порога, потому что `button { min-height }` на ссылку не действует.
    assert.ok(/\.site-home \{[\s\S]{0,400}?min-height: 44px/.test(css),
        'у ссылки выхода снят порог высоты — она схлопнется в полоску');
});

test('кнопки не тоньше сорока четырёх точек', () => {
    const css = read('styles/game.css');
    assert.ok(/button \{[\s\S]{0,400}?min-height: 44px/.test(css),
        'у кнопок снят нижний порог высоты — палец начнёт промахиваться');
});
