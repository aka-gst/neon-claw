/**
 * Постановочные состояния для витрины.
 *
 * Сцена не рисует «красивый» кадр поверх игры: она ставит бойцов и проходит
 * настоящий шаг мира. Поэтому при смене боя не останется старой подделки
 * попадания, которую игра сама больше не умеет произвести.
 */

const IMPACT_GAP = 14;

/** Узнаёт только известные сцены: чужой параметр не меняет обычную игру. */
export function sceneFromSearch(search = '') {
    return new URLSearchParams(search).get('scene') === 'impact' ? 'impact' : null;
}

/**
 * Ставит первый доступный бой на миг настоящего попадания.
 *
 * `step` передаётся снаружи, чтобы браузер и тест вели мир одним путём.
 */
export function stageImpact(world, step) {
    const foe = world.enemies.find((enemy) => enemy.state !== 'dead');
    if (!foe) throw new Error('сцене удара нужен живой страж');

    const p = world.player;
    p.body.x = foe.body.x - IMPACT_GAP;
    p.body.y = foe.body.y;
    p.body.vx = 0;
    p.body.vy = 0;
    p.body.onGround = true;
    p.facing = 1;
    p.attack.phase = 'none';
    p.attack.t = 0;
    p.attack.hits.clear();
    foe.state = 'patrol';
    foe.t = 0;
    foe.alert = 0;
    foe.cooldown = 0;
    foe.body.vx = 0;
    foe.body.vy = 0;
    world.events.length = 0;
    world.sparks.length = 0;
    world.rings.length = 0;
    world.shake = 0;

    for (let i = 0; i < 90; i += 1) {
        step({ attackDown: i === 0 });
        if (world.events.includes('hit')) {
            return { name: 'impact', events: [...world.events] };
        }
    }
    throw new Error('сцена удара не дошла до попадания');
}
