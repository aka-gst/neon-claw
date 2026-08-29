/**
 * Камера. Смотрит вперёд по бегу и не дёргается на каждом прыжке.
 *
 * Мёртвая зона по вертикали здесь важнее упреждения по горизонтали:
 * платформер — это постоянные короткие прыжки, и камера, честно следящая
 * за каждым, укачивает через минуту.
 */

import { CAMERA, VIEW } from './tuning.js';
import { levelPixelWidth, levelPixelHeight } from './level.js';

export const createCamera = (world) => {
    const p = world.player.body;
    return { cx: p.x, cy: p.y - p.h / 2, x: 0, y: 0, shakeX: 0, shakeY: 0 };
};

export function updateCamera(cam, world, dt) {
    const p = world.player.body;
    const wantX = p.x + world.player.facing * CAMERA.lookahead;
    const wantY = p.y - p.h / 2;

    const k = 1 - Math.exp(-CAMERA.ease * dt);
    cam.cx += (wantX - cam.cx) * k;

    const dy = wantY - cam.cy;
    if (Math.abs(dy) > CAMERA.deadzoneY) {
        const excess = dy - Math.sign(dy) * CAMERA.deadzoneY;
        cam.cy += excess * k;
    }
    // На земле камера подтягивается к ногам: после долгого падения герой
    // не должен остаться прижатым к нижнему краю кадра.
    if (p.onGround) cam.cy += (wantY - cam.cy) * k * 0.35;

    const maxX = Math.max(0, levelPixelWidth(world.level) - VIEW.w);
    const maxY = Math.max(0, levelPixelHeight(world.level) - VIEW.h);
    cam.x = Math.min(maxX, Math.max(0, cam.cx - VIEW.w / 2));
    cam.y = Math.min(maxY, Math.max(0, cam.cy - VIEW.h / 2));

    const s = world.shake;
    cam.shakeX = s ? (Math.random() * 2 - 1) * s : 0;
    cam.shakeY = s ? (Math.random() * 2 - 1) * s : 0;
}
