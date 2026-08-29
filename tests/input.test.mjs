import test from 'node:test';
import assert from 'node:assert/strict';

import { readIntent } from '../src/input.js';

/**
 * Клавиатура и сенсор сливаются в одно намерение до того, как о них узнает
 * игра. Здесь проверяется именно шов: миру должно быть всё равно, чем его
 * двигают, и ни одна строчка правил не должна знать про телефон.
 */

const keyboard = (held = [], pressed = []) => {
    const left = new Set(pressed);
    return {
        held: (a) => held.includes(a),
        take: (a) => (left.delete(a) ? true : false),
        peek: (a) => left.has(a),
    };
};

const pad = (state = {}, presses = []) => {
    const left = new Set(presses);
    return {
        state: {
            left: false, right: false, up: false, down: false,
            walk: false, jumpHeld: false, ...state,
        },
        take: (a) => (left.delete(a) ? true : false),
    };
};

test('без сенсора намерение читается ровно как раньше', () => {
    const intent = readIntent(keyboard(['right', 'jump'], ['attack']));
    assert.equal(intent.right, true);
    assert.equal(intent.jumpHeld, true);
    assert.equal(intent.attackDown, true);
    assert.equal(intent.walk, false);
});

test('сенсор двигает героя так же, как клавиатура', () => {
    const intent = readIntent(keyboard(), pad({ right: true, jumpHeld: true }, ['jump']));
    assert.equal(intent.right, true);
    assert.equal(intent.jumpHeld, true);
    assert.equal(intent.jumpDown, true);
});

test('глубина отклонения стика — это и есть крадущийся шаг', () => {
    const creeping = readIntent(keyboard(), pad({ right: true, walk: true }));
    assert.equal(creeping.walk, true, 'слабое отклонение не даёт тихий шаг');

    const running = readIntent(keyboard(), pad({ right: true, walk: false }));
    assert.equal(running.walk, false);
});

test('нажатие забирается один раз, чем бы его ни сделали', () => {
    const keys = keyboard([], ['attack']);
    const stick = pad({}, ['attack']);

    assert.equal(readIntent(keys, stick).attackDown, true);
    // Клавиатурное нажатие уже забрано, сенсорное — тоже.
    assert.equal(readIntent(keys, stick).attackDown, false, 'удар повторился сам собой');
});

test('одно и то же действие с двух сторон не удваивается', () => {
    const both = readIntent(keyboard(['right'], ['jump']), pad({ right: true }, ['jump']));
    assert.equal(both.right, true);
    assert.equal(both.jumpDown, true);
});
