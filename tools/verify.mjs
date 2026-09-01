/**
 * Один вопрос — один ответ: доехало ли то, что у меня в дереве, до боя.
 *
 *   node tools/verify.mjs            → сверить бой с рабочим деревом
 *   node tools/verify.mjs --base http://localhost:4231   → сверить со сборкой
 *
 * Заведено потому, что ответить было НЕЧЕМ. Соседняя сессия искала починку на
 * живом адресе, не нашла и пошла читать файл руками — а `deploy.sh` проверял
 * только код ответа, то есть ровно «200 ≠ выложено» из нашего свода.
 *
 * Два правила, оба оплачены поломками:
 *   · сверяем СОДЕРЖИМОЕ, а не код ответа: двести отдаёт и вчерашняя копия;
 *   · молчание измерителя — ошибка, а не успех. Первая версия считала хеши
 *     подстановками в оболочке, инструменты не отработали, обе строки вышли
 *     пустыми — и «пустое равно пустому» напечатало «совпало» для файлов,
 *     отличающихся на четыре килобайта.
 *
 * Узел выбран нарочно вместо оболочки: `curl`, `shasum` и `cut` в песочнице
 * бывают недоступны поодиночке, и тогда скрипт врёт частями.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const at = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = at('--base', 'https://aka-gst.ru/claw').replace(/\/$/, '');

/** То, по чему видно версию игры. Картинки не берём: они меняются редко. */
const WATCH = [
    'index.html',
    'src/main.js', 'src/world.js', 'src/enemy.js', 'src/player.js',
    'src/tuning.js', 'src/combat.js', 'src/render.js', 'src/input.js',
    'src/level.js', 'src/levels.js', 'styles/game.css',
];

/** Наружу этого быть не должно. Проверяем прицельно, а не «ну наверное». */
const SECRET = ['CLAUDE.md', 'package.json', 'docs/todo.md', 'tests/impact.test.mjs', 'tools/deploy.sh'];

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);

/** Сеть рвётся на паре процентов запросов — ретраи обязательны каждому. */
async function fetchTwice(url, tries = 4) {
    for (let i = 0; i < tries; i += 1) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            const body = Buffer.from(await res.arrayBuffer());
            return { status: res.status, body };
        } catch {
            await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
    }
    return null;
}

const rows = [];
let плохо = 0;

for (const rel of WATCH) {
    let mine;
    try {
        mine = await readFile(new URL(`../${rel}`, import.meta.url));
    } catch {
        rows.push([rel, '—', 'НЕТ ФАЙЛА У МЕНЯ']);
        плохо += 1;
        continue;
    }
    const live = await fetchTwice(`${BASE}/${rel}`);
    if (!live) {
        rows.push([rel, '—', 'СЕТЬ НЕ ОТВЕТИЛА — проверка не отработала']);
        плохо += 1;
        continue;
    }
    if (live.status !== 200) {
        rows.push([rel, String(live.status), 'НЕ ОТДАЁТСЯ']);
        плохо += 1;
        continue;
    }
    const a = sha(mine);
    const b = sha(live.body);
    if (!a || !b || live.body.length === 0) {
        rows.push([rel, '200', 'ПУСТО — проверка не отработала']);
        плохо += 1;
    } else if (a === b) {
        rows.push([rel, '200', `совпало ${a}`]);
    } else {
        rows.push([rel, '200', `НЕ ТО: у меня ${mine.length} Б (${a}), там ${live.body.length} Б (${b})`]);
        плохо += 1;
    }
}

// На своей машине статик-сервер отдаёт весь проект — это его работа, и
// ругаться тут не на что. Проверка, которая на локальном адресе краснеет
// всегда, приучает не смотреть на неё вовсе, а потом молчит и на бою.
const БОЕВОЙ = /^https:\/\//.test(BASE);
for (const rel of БОЕВОЙ ? SECRET : []) {
    const live = await fetchTwice(`${BASE}/${rel}`);
    if (!live) {
        rows.push([rel, '—', 'СЕТЬ НЕ ОТВЕТИЛА — проверка не отработала']);
        плохо += 1;
    } else if (live.status === 404) {
        rows.push([rel, '404', 'закрыто, как надо']);
    } else {
        rows.push([rel, String(live.status), 'ОТДАЁТСЯ НАРУЖУ — так нельзя']);
        плохо += 1;
    }
}

const wide = Math.max(...rows.map((r) => r[0].length));
for (const [name, code, verdict] of rows) {
    console.log(`  ${name.padEnd(wide)}  ${code.padStart(3)}  ${verdict}`);
}
console.log();
console.log(`адрес: ${BASE}/`);
if (!БОЕВОЙ) console.log('(это не бой: закрытость внутренних файлов не проверялась)');
const где = БОЕВОЙ ? 'бой' : 'сборка';
console.log(плохо === 0
    ? `СОВПАЛО: ${где} отдаёт то же, что лежит в дереве, ${rows.length} проверок`
    : `НЕ СОВПАЛО: ${плохо} из ${rows.length} — ${где} отличается от дерева`);
process.exit(плохо === 0 ? 0 : 1);
