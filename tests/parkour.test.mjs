import test from 'node:test';
import assert from 'node:assert/strict';

import { parseLevel } from '../src/level.js';
import { createPlayer, updatePlayer } from '../src/player.js';
import { TILE, STEP, PLAYER, WALL, DASH } from '../src/tuning.js';
import { intent, FLAT } from './helpers.mjs';

/**
 * Паркур — то, ради чего перемещение должно быть интересным само по себе.
 * Тесты держат за руку три глагола: стена, рывок, подкат.
 */

const SHAFT = [
    '.....#....',
    '.....#....',
    '.....#....',
    '.....#....',
    '.....#....',
    'p....#....',
    '##########',
    '##########',
];

const CRAWL = [
    '..........',
    '..........',
    '..........',
    '....####..',
    'p.........',
    '##########',
];

const run = (level, player, keys, seconds, once = {}) => {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i += 1) {
        updatePlayer(player, level, intent({
            ...keys,
            jumpDown: Boolean(once.jump) && i === 0,
            dashDown: Boolean(once.dash) && i === 0,
        }), STEP);
    }
};

/** Ставит героя в воздух вплотную к левой грани стены из SHAFT. */
function atWall() {
    const level = parseLevel(SHAFT);
    const player = createPlayer(level.spawn);
    player.body.x = 5 * TILE - PLAYER.w / 2 - 1;
    player.body.y = 3 * TILE;
    player.body.vy = 60;
    player.facing = 1;
    return { level, player };
}

test('стена ловит падение и превращает его в сползание', () => {
    const { level, player } = atWall();
    run(level, player, { right: true }, 0.05);
    assert.equal(player.state, 'wall', 'герой не прижался к стене');

    run(level, player, { right: true }, 0.3);
    assert.ok(player.body.vy <= WALL.slide + 1, `сползание быстрее заданного: ${player.body.vy}`);
    assert.ok(player.body.vy > 0, 'герой завис на стене');
});

test('толчок от стены уносит в сторону, и стена его не отменяет', () => {
    const { level, player } = atWall();
    run(level, player, { right: true }, 0.1);
    assert.equal(player.state, 'wall');

    // Клавиша к стене остаётся зажатой — так и играют, и толчок обязан выжить.
    run(level, player, { right: true }, 0.12, { jump: true });
    assert.equal(player.state, 'move');
    assert.ok(player.body.vx < -WALL.jumpX * 0.5, `толчок съеден вводом: ${player.body.vx}`);
    assert.ok(player.body.vy < 0, 'толчок не поднял');
    assert.equal(player.facing, -1, 'герой не развернулся от стены');
});

test('на стене не надо держаться: прижался — висишь', () => {
    const { level, player } = atWall();
    run(level, player, { right: true }, 0.1);
    assert.equal(player.state, 'wall');

    // Клавишу отпустили — палец нужен на прыжке, а не на стене.
    run(level, player, {}, 0.3);
    assert.equal(player.state, 'wall', 'герой отвалился, едва отпустили клавишу');

    // А вот увести в другую сторону — это сознательный уход.
    run(level, player, { left: true }, 0.05);
    assert.equal(player.state, 'move');
});

test('прижаться можно и на взлёте, не только на падении', () => {
    const level = parseLevel(SHAFT);
    const player = createPlayer(level.spawn);
    player.body.x = 5 * TILE - PLAYER.w / 2 - 1;
    player.body.y = 4 * TILE;
    player.body.vy = -120;   // ещё летит вверх
    player.facing = 1;
    run(level, player, { right: true }, 0.05);
    assert.equal(player.state, 'wall', 'на взлёте стена не ловит — нужен точный апекс');
});

test('сорвался со стены — толчок ещё засчитывается', () => {
    const { level, player } = atWall();
    run(level, player, { right: true }, 0.1);
    assert.equal(player.state, 'wall');

    // Уводим от стены и жмём прыжок с опозданием.
    run(level, player, { left: true }, 0.02);
    assert.equal(player.state, 'move');
    run(level, player, {}, WALL.coyote * 0.6);
    // Кнопку надо и удерживать: иначе сработает обрезание высоты, и
    // тест будет мерить не толчок, а короткий прыжок.
    run(level, player, { jumpHeld: true }, 0.02, { jump: true });
    assert.ok(player.body.vy < -WALL.jumpY * 0.8,
        `опоздавший толчок не сработал: vy ${player.body.vy.toFixed(0)}`);
});

test('стена возвращает рывок — на ней и держится зигзаг вверх', () => {
    const { level, player } = atWall();
    player.dashReady = false;
    run(level, player, { right: true }, 0.05);
    assert.equal(player.state, 'wall');
    assert.equal(player.dashReady, true);
});

test('рывок берёт два тайла по горизонтали и один на отрыв', () => {
    const level = parseLevel(FLAT);
    const player = createPlayer(level.spawn);
    const start = player.body.x;

    run(level, player, { right: true }, 0.02);
    const before = player.body.x;
    run(level, player, {}, DASH.time, { dash: true });
    const travelled = player.body.x - before;

    assert.ok(travelled > TILE * 2, `рывок короче двух тайлов: ${travelled.toFixed(1)}`);
    assert.ok(travelled < TILE * 3, `рывок длиннее двух тайлов: ${travelled.toFixed(1)}`);
    assert.ok(player.body.x > start);

    // Второго рывка в том же отрыве нет — он привязан к касанию опоры.
    player.body.onGround = false;
    player.dashReady = false;
    const held = player.body.x;
    run(level, player, {}, 0.1, { dash: true });
    assert.ok(player.body.x - held < TILE, 'второй рывок сработал без опоры');
});

test('подкат проходит там, где бег упирается лбом', () => {
    const running = parseLevel(CRAWL);
    const walker = createPlayer(running.spawn);
    run(running, walker, { right: true }, 2);
    assert.ok(walker.body.x < 4 * TILE, `бегом пролез под потолок: ${walker.body.x}`);

    const crawling = parseLevel(CRAWL);
    const slider = createPlayer(crawling.spawn);
    run(crawling, slider, { right: true }, 0.5);
    run(crawling, slider, { right: true, down: true }, 2, { dash: true });
    assert.ok(slider.body.x > 8 * TILE, `подкатом не пролез: ${slider.body.x}`);
});

test('из подката не встают под потолком', () => {
    const level = parseLevel(CRAWL);
    const player = createPlayer(level.spawn);
    run(level, player, { right: true }, 0.5);
    run(level, player, { right: true, down: true }, 0.9, { dash: true });

    if (player.body.x > 4 * TILE && player.body.x < 8 * TILE) {
        assert.equal(player.state, 'slide', 'герой встал внутри щели');
        assert.ok(player.body.h < PLAYER.h);
    }
});
