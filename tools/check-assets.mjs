/**
 * Приёмка поставки данных.
 *
 *   node tools/check-assets.mjs <каталог>
 *
 * Проверяет не только формат, но и **содержание**: одинаковые уровни,
 * повторяющиеся глифы, реплики, скопированные всем врагам подряд. Формат
 * научиться соблюдать легко, и поставка, где пять уровней — это одна и та
 * же карта под разными именами, проходит любую проверку схемы.
 *
 * Поэтому здесь считается не «есть ли поле», а «сколько тут разного».
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? '.';
const problems = [];
const notes = [];

const fail = (what) => problems.push(what);
const ok = (what) => notes.push(what);

function read(rel) {
    const path = join(root, rel);
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        fail(`${rel}: не разбирается как JSON — ${error.message}`);
        return null;
    }
}

/** Геометрия без имён: два предмета с разными id и одной формой — это один предмет. */
const shape = (value) => JSON.stringify(value, (k, v) => (
    ['id', 'name', 'district', 'title', 'role'].includes(k) ? undefined : v
));

function distinct(label, items, minShare) {
    const shapes = new Set(items.map(shape));
    const share = items.length ? shapes.size / items.length : 1;
    if (share < minShare) {
        fail(`${label}: ${items.length} штук, но различных форм только ${shapes.size}`
            + ` (${Math.round(share * 100)}%, нужно от ${Math.round(minShare * 100)}%)`);
    } else {
        ok(`${label}: ${shapes.size} различных из ${items.length}`);
    }
}

/* ------------------------------------------------------------------ фигуры */

const FIGURES = ['ninja', 'guard', 'heavy', 'scout', 'sniper', 'hound'];
const HERO_POSES = [
    'idle', 'walk', 'run', 'jump.rise', 'jump.fall', 'land', 'hurt', 'death',
    'wall.slide', 'wall.push', 'ledge.hang', 'ledge.climb', 'dash', 'slide',
    'attack', 'bow.draw', 'bow.release', 'crouch',
];
/** Меньше этого фигура беднее той, что уже нарисована кодом. Смысла нет. */
const MIN_STROKES = 12;

function checkFigures() {
    const widths = [];
    for (const name of FIGURES) {
        const fig = read(`assets/figures/${name}.json`);
        if (!fig) { fail(`figures/${name}.json: нет файла`); continue; }

        const poses = Object.entries(fig.poses ?? {});
        if (!poses.length) { fail(`figures/${name}: нет ни одной позы`); continue; }

        if (name === 'ninja') {
            const missing = HERO_POSES.filter((p) => !fig.poses[p]);
            if (missing.length) fail(`figures/ninja: нет поз — ${missing.join(', ')}`);
            const attack = fig.poses.attack?.frames?.length ?? 0;
            if (attack < 3) fail(`figures/ninja: у удара ${attack} кадра, нужно от трёх`);
        }

        let thin = 0;
        let frames = 0;
        let maxCoord = 0;
        for (const [, pose] of poses) {
            for (const frame of pose.frames ?? []) {
                frames += 1;
                if ((frame.strokes?.length ?? 0) < MIN_STROKES) thin += 1;
                for (const st of frame.strokes ?? []) {
                    for (const pt of st.pts ?? []) {
                        maxCoord = Math.max(maxCoord, Math.abs(pt[0]), Math.abs(pt[1]));
                    }
                }
            }
        }
        if (maxCoord > 3) fail(`figures/${name}: координаты до ${maxCoord} — это пиксели, а нужны доли роста`);
        if (thin) {
            fail(`figures/${name}: ${thin} из ${frames} кадров беднее ${MIN_STROKES} штрихов`);
        } else {
            ok(`figures/${name}: ${frames} кадров, все плотнее ${MIN_STROKES} штрихов`);
        }
        widths.push([name, fig.width ?? 0]);
    }

    // Силуэты обязаны различаться формой, а не только цветом.
    const w = widths.map(([, v]) => v);
    if (w.length && Math.max(...w) - Math.min(...w) < 0.25) {
        fail(`figures: все шестеро одной ширины (${w.join(', ')}) — силуэты не различить`);
    }
}

/* ------------------------------------------------------------------- глифы */

function checkGlyphs() {
    const g = read('assets/glyphs/ui.json');
    if (!g) return fail('glyphs/ui.json: нет файла');
    const icons = Object.entries(g.icons ?? {});
    if (icons.length < 20) fail(`glyphs: иконок ${icons.length}, ожидалось от двадцати`);
    distinct('glyphs', icons.map(([, ops]) => ops), 0.8);
    const thin = icons.filter(([, ops]) => ops.length < 3).map(([k]) => k);
    if (thin.length) fail(`glyphs: слишком просты (меньше трёх примитивов) — ${thin.join(', ')}`);
}

/* ------------------------------------------------------------------ тексты */

function checkText() {
    const t = read('assets/text/ru.json');
    if (!t) return fail('text/ru.json: нет файла');

    const all = [];
    for (const [who, states] of Object.entries(t.barks ?? {})) {
        for (const [state, lines] of Object.entries(states)) {
            if (lines.length < 6) fail(`text/barks/${who}/${state}: реплик ${lines.length}, нужно от шести`);
            const long = lines.filter((l) => l.split(/\s+/).length > 5);
            if (long.length) fail(`text/barks/${who}/${state}: длиннее пяти слов — ${JSON.stringify(long[0])}`);
            all.push(...lines);
        }
    }
    // Манера у каждого типа своя: общий словарь на всех — это не характеры.
    const unique = new Set(all);
    if (all.length && unique.size / all.length < 0.85) {
        fail(`text/barks: ${all.length} реплик, уникальных ${unique.size}`
            + ' — типы стражей говорят одно и то же');
    } else if (all.length) {
        ok(`text/barks: ${unique.size} уникальных из ${all.length}`);
    }

    const shards = t.shards ?? [];
    if (shards.length < 12) fail(`text/shards: ${shards.length}, нужно от двенадцати`);
    const short = shards.filter((s) => (s.body ?? '').split(/[.!?]/).filter(Boolean).length < 2);
    if (short.length) fail(`text/shards: короче двух предложений — ${short.length} штук`);
    const numbered = shards.filter((s) => /^Обрывок \d+$/.test(s.title ?? ''));
    if (numbered.length) fail(`text/shards: заголовки-заглушки «Обрывок N» — ${numbered.length} штук`);
}

/* ------------------------------------------------------------------- декор */

function checkProps() {
    const sets = [];
    for (const district of ['roofs', 'warehouse', 'market']) {
        const p = read(`assets/props/${district}.json`);
        if (!p) { fail(`props/${district}.json: нет файла`); continue; }
        const props = p.props ?? [];
        if (props.length < 14) fail(`props/${district}: предметов ${props.length}, нужно от четырнадцати`);
        distinct(`props/${district}`, props, 0.85);
        sets.push([district, props]);
    }
    // Район узнаётся по вещам. Одинаковые формы под разными именами — не район.
    for (let i = 0; i < sets.length; i += 1) {
        for (let j = i + 1; j < sets.length; j += 1) {
            if (shape(sets[i][1]) === shape(sets[j][1])) {
                fail(`props: ${sets[i][0]} и ${sets[j][0]} — одни и те же формы под разными именами`);
            }
        }
    }
}

/* ------------------------------------------------------------------ уровни */

function checkLevels() {
    const maps = [];
    for (const id of ['02-warehouse', '03-market', '04-roofs', '05-warehouse', '06-market']) {
        const l = read(`assets/levels/${id}.json`);
        if (!l) continue;
        const map = l.map ?? [];
        const widths = new Set(map.map((r) => r.length));
        if (widths.size !== 1) fail(`levels/${id}: строки разной длины (${[...widths].join('/')})`);
        const legend = new Set(Object.keys(l.legend ?? {}).concat(['.']));
        const used = new Set(map.join(''));
        const alien = [...used].filter((c) => !legend.has(c));
        if (alien.length) fail(`levels/${id}: обозначения вне легенды — ${alien.join('')}`);
        for (const mark of ['p', 'X']) {
            if (!used.has(mark)) fail(`levels/${id}: нет обязательной метки «${mark}»`);
        }
        if (map.join('').split('C').length - 1 < 2) fail(`levels/${id}: меньше двух чекпоинтов`);
        if ((l.route ?? []).length < 3) fail(`levels/${id}: маршрут описан ${(l.route ?? []).length} шагами`);
        maps.push([id, map]);
    }
    for (let i = 0; i < maps.length; i += 1) {
        for (let j = i + 1; j < maps.length; j += 1) {
            if (JSON.stringify(maps[i][1]) === JSON.stringify(maps[j][1])) {
                fail(`levels: ${maps[i][0]} и ${maps[j][0]} — одна и та же карта`);
            }
        }
    }
}

/* -------------------------------------------------------------- звук, эффекты */

function checkAudio() {
    const a = read('assets/audio/kit.json');
    if (!a) return fail('audio/kit.json: нет файла');
    const voices = Object.entries(a.voices ?? {});
    if (voices.length < 20) fail(`audio: голосов ${voices.length}, ожидалось от двадцати`);
    distinct('audio', voices.map(([, v]) => v), 0.85);
}

function checkEffects() {
    const e = read('assets/effects/kit.json');
    if (!e) return fail('effects/kit.json: нет файла');
    const recipes = Object.entries(e.effects ?? e);
    if (recipes.length < 10) fail(`effects: рецептов ${recipes.length}, ожидалось от десяти`);
    distinct('effects', recipes.map(([, v]) => v), 0.8);
}

function checkWeapons() {
    const w = read('assets/figures/weapons.json');
    if (!w) return fail('figures/weapons.json: нет файла');
    const items = Object.entries(w.weapons ?? w);
    const thin = items.filter(([, v]) => (v.strokes ?? []).length < 3).map(([k]) => k);
    if (thin.length) fail(`weapons: меньше трёх штрихов — ${thin.join(', ')}`);
    distinct('weapons', items.map(([, v]) => v), 0.85);
}

for (const check of [checkFigures, checkGlyphs, checkText, checkProps, checkLevels, checkAudio, checkEffects, checkWeapons]) {
    try {
        check();
    } catch (error) {
        fail(`${check.name}: проверка сорвалась — ${error.message}`);
    }
}

for (const note of notes) console.log('  ✓', note);
if (problems.length) {
    console.log();
    for (const p of problems) console.log('  ✗', p);
    console.log(`\n${problems.length} замечаний — поставка не принята.`);
    process.exit(1);
}
console.log('\nПоставка принята.');
