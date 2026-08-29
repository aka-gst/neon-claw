import test from 'node:test';
import assert from 'node:assert/strict';

import { recordRun, resultFor, clearResults, formatTime } from '../src/results.js';

/**
 * Итоги нужны, чтобы выбирать боёвку по цифрам. Значит, они обязаны
 * переживать сравнение: лучший прогон не должен затираться худшим.
 */

test('лучшим остаётся более быстрый прогон, а счёт копится по максимуму', () => {
    clearResults();
    recordRun('edge', { time: 120, attempts: 5, takedowns: 1, score: 300, loot: 4 });
    recordRun('edge', { time: 90, attempts: 2, takedowns: 3, score: 250, loot: 9 });
    recordRun('edge', { time: 150, attempts: 9, takedowns: 0, score: 900, loot: 2 });

    const best = resultFor('edge');
    assert.equal(best.runs, 3, 'прогоны не считаются');
    assert.equal(best.time, 90, 'лучшее время затёрлось');
    assert.equal(best.attempts, 2, 'попытки не от лучшего прогона');
    assert.equal(best.takedowns, 3);
    assert.equal(best.score, 900, 'счёт должен браться максимальный');
    assert.equal(best.loot, 9);
    assert.equal(best.last.time, 150, 'последний прогон не сохранён');
});

test('режимы не путаются между собой', () => {
    clearResults();
    recordRun('duel', { time: 100, attempts: 1, takedowns: 0, score: 10, loot: 1 });
    assert.equal(resultFor('edge'), null);
    assert.equal(resultFor('duel').time, 100);
});

test('время читается как время', () => {
    assert.equal(formatTime(0), '0:00');
    assert.equal(formatTime(9.4), '0:09');
    assert.equal(formatTime(125), '2:05');
});

test('без хранилища браузера игра не падает', () => {
    // В node `localStorage` не существует вовсе — это и есть проверка.
    clearResults();
    assert.doesNotThrow(() => recordRun('mix', { time: 1, attempts: 1, takedowns: 0, score: 0, loot: 0 }));
    assert.equal(resultFor('mix').time, 1);
});
