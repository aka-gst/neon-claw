import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Приёмка изображений. Читаем заголовок PNG напрямую: зависимостей в
 * проекте нет и не будет, а проверять размеры и альфу надо — прошлая
 * поставка пришла контактным листом без прозрачности, и заметить это
 * глазами удалось только потому, что файлов было мало.
 */

const at = (rel) => new URL(`../${rel}`, import.meta.url);

/** Ширина, высота и тип цвета из IHDR. 6 и 4 — это форматы с альфой. */
function readPng(rel) {
    const buf = readFileSync(at(rel));
    assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${rel}: не PNG`);
    return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
        alpha: [4, 6].includes(buf[25]),
    };
}

const BACKDROPS = ['roofs', 'warehouse', 'market'].flatMap(
    (d) => ['far', 'mid', 'near'].map((l) => `assets/backdrop/${d}-${l}.png`),
);

test('слои параллакса на месте, нужного размера и с прозрачностью', () => {
    for (const rel of BACKDROPS) {
        assert.ok(existsSync(at(rel)), `нет файла ${rel}`);
        const png = readPng(rel);
        assert.equal(png.width, 1920, `${rel}: ширина ${png.width}`);
        assert.equal(png.height, 540, `${rel}: высота ${png.height}`);
        assert.ok(png.alpha, `${rel}: без альфы — небо будет закрашено`);
    }
});

test('у каждого района все три слоя: полукомплект хуже, чем ни одного', () => {
    for (const district of ['roofs', 'warehouse', 'market']) {
        const layers = ['far', 'mid', 'near']
            .filter((l) => existsSync(at(`assets/backdrop/${district}-${l}.png`)));
        assert.equal(layers.length, 3, `${district}: слоёв ${layers.length}`);
    }
});

test('ключевой арт нужного размера', () => {
    const title = readPng('assets/key/title.png');
    assert.equal(title.width, 1920);
    assert.equal(title.height, 1080);

    const social = readPng('assets/key/social.png');
    assert.equal(social.width, 1200);
    assert.equal(social.height, 630);
});

test('текстуры квадратные и мелкие — иначе они не фактура, а рисунок', () => {
    for (const name of ['concrete', 'metal', 'fabric', 'grate']) {
        const png = readPng(`assets/texture/${name}.png`);
        assert.equal(png.width, 128, `${name}: ширина ${png.width}`);
        assert.equal(png.height, 128, `${name}: высота ${png.height}`);
    }
});
