/**
 * Итоги прогонов по режимам — чтобы выбирать боёвку по цифрам, а не по
 * тому, какой режим щупали последним.
 *
 * Четыре набора правил на одном уровне сравниваются только так: время,
 * попытки, тихие снятия. «Кажется, тут веселее» — это тоже довод, но он
 * работает лучше, когда рядом лежит таблица.
 *
 * Хранится локально и только у игрока. Недоступное хранилище (приватное
 * окно, запрет на данные сайта) — не ошибка: тогда итоги живут до
 * перезагрузки, и игра ведёт себя ровно так же.
 */

const KEY = 'neon-claw/results/v1';

let memory = {};

function read() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) memory = JSON.parse(raw) ?? {};
    } catch {
        // Хранилища нет — держим в памяти.
    }
    return memory;
}

function write() {
    try {
        localStorage.setItem(KEY, JSON.stringify(memory));
    } catch {
        // Молча: потеря итогов не стоит того, чтобы ронять игру.
    }
}

export const allResults = () => ({ ...read() });
export const resultFor = (modeId) => read()[modeId] ?? null;

/** Записывает прогон. Лучшим считается более быстрый — при равном счёте. */
export function recordRun(modeId, run) {
    const store = read();
    const best = store[modeId];
    store[modeId] = {
        runs: (best?.runs ?? 0) + 1,
        time: best && best.time <= run.time ? best.time : run.time,
        attempts: best && best.time <= run.time ? best.attempts : run.attempts,
        takedowns: best && best.time <= run.time ? best.takedowns : run.takedowns,
        score: Math.max(best?.score ?? 0, run.score),
        loot: Math.max(best?.loot ?? 0, run.loot),
        last: run,
    };
    memory = store;
    write();
    return store[modeId];
}

export function clearResults() {
    memory = {};
    write();
}

export function formatTime(seconds) {
    const total = Math.max(0, Math.round(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
