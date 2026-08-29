/**
 * Правила боя — набором, а не одним вариантом.
 *
 * Спорить о том, «однохитовая лучше или дуэль», в переписке бессмысленно:
 * это вопрос ощущения, а ощущение проверяется руками. Поэтому режим —
 * это данные, уровень один и тот же, а переключение мгновенное. Пять минут
 * подряд в трёх режимах отвечают на вопрос лучше, чем час рассуждений.
 *
 * Что различают режимы:
 *
 *   player.hp     сколько ошибок прощается
 *   player.retry  «конец игры» или мгновенный откат к чекпоинту
 *   enemy.hp      сколько ударов держит страж в лоб
 *   enemy.guard   'meter' — гарда, которая продлевается от ударов; 'none' — нет
 *   enemy.parry   в лоб не взять вообще, пока страж не раскрылся замахом
 *   takedown      снятие с одного удара со спины и сверху
 *
 * Раскрытым страж считается, пока идёт его собственная атака: замах, удар и
 * возврат. Отсюда ритм «вымани — сними», из-за которого лобовая стычка
 * перестаёт быть обменом ударами и становится вопросом одного тайминга.
 */

export const MODES = {
    duel: {
        id: 'duel',
        name: 'Дуэль',
        kin: 'Captain Claw',
        blurb: 'Пять жизней. Страж держит три удара и закрывается гардой. Ошибка стоит дёшево.',
        player: { hp: 5, retry: 'gameover' },
        enemy: { hp: 3, guard: 'meter', parry: false },
        takedown: { back: false, above: false },
    },

    edge: {
        id: 'edge',
        name: 'Лезвие',
        kin: 'Katana Zero',
        blurb: 'Все умирают с одного удара. В лоб не взять — только со спины, сверху или выманив замах.',
        player: { hp: 1, retry: 'checkpoint' },
        enemy: { hp: 1, guard: 'none', parry: true },
        takedown: { back: true, above: true },
    },

    shadow: {
        id: 'shadow',
        name: 'Тень',
        kin: 'Tenchu',
        blurb: 'Ты — с одного удара. Страж — с одного со спины или сверху, иначе долгий бой.',
        player: { hp: 1, retry: 'checkpoint' },
        enemy: { hp: 3, guard: 'meter', parry: false },
        takedown: { back: true, above: true },
    },

    mix: {
        id: 'mix',
        name: 'Смесь',
        kin: 'рекомендую',
        blurb: 'Одна ошибка прощается, вторая нет. Со спины и сверху — сразу, в лоб — вдвое дольше.',
        player: { hp: 2, retry: 'checkpoint' },
        enemy: { hp: 2, guard: 'meter', parry: false },
        takedown: { back: true, above: true },
    },
};

export const MODE_ORDER = ['duel', 'edge', 'shadow', 'mix'];
export const DEFAULT_MODE = 'mix';

export const getMode = (id) => MODES[id] ?? MODES[DEFAULT_MODE];

/**
 * Как именно пришёл удар. Со спины — если оба смотрят в одну сторону:
 * значит, герой зашёл сзади. Сверху — если он в воздухе и выше головы.
 */
export function strikeKind(player, enemy) {
    const above = !player.body.onGround
        && player.body.y <= enemy.body.y - enemy.body.h * 0.55;
    if (above) return 'above';
    if (player.facing === enemy.facing) return 'back';
    return 'front';
}

/** Раскрыт ли страж — то есть занят ли он собственной атакой. */
export const OPEN_STATES = new Set(['windup', 'active', 'recover']);
export const isOpen = (enemy) => OPEN_STATES.has(enemy.state);
