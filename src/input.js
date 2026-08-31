/**
 * Клавиатура. Коды, а не символы: на русской раскладке `key` приходит
 * кириллицей, и WASD перестаёт работать ровно у тех, для кого игра делается.
 *
 * Нажатия «на фронте» (прыжок, удар) копятся до тех пор, пока их не заберёт
 * шаг симуляции. Кадр отрисовки и шаг игры не совпадают, и без этого
 * буфера один прыжок из десяти просто теряется между ними.
 */

const BINDINGS = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['Space', 'ArrowUp', 'KeyW'],
    attack: ['KeyJ', 'KeyX'],
    dash: ['ShiftLeft', 'ShiftRight', 'KeyK'],
    bow: ['KeyF', 'KeyE'],
    // Клинки меняются мгновенно: Q перекидывает, 1 и 2 берут нужный
    // напрямую. Колеса выбора нет — оно крадёт ровно тот темп, ради
    // которого стихии и заводились.
    swap: ['KeyQ'],
    blade1: ['Digit1'],
    blade2: ['Digit2'],
    pause: ['Escape', 'KeyP'],
    restart: ['KeyR'],
};

const ACTION_OF = new Map();
for (const [action, codes] of Object.entries(BINDINGS)) {
    for (const code of codes) {
        if (!ACTION_OF.has(code)) ACTION_OF.set(code, []);
        ACTION_OF.get(code).push(action);
    }
}

export function createInput(target = window) {
    const held = new Set();
    const pressed = new Set();

    const onDown = (event) => {
        const actions = ACTION_OF.get(event.code);
        if (!actions) return;
        if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
        if (event.repeat) return;
        for (const a of actions) {
            held.add(a);
            pressed.add(a);
        }
    };

    const onUp = (event) => {
        const actions = ACTION_OF.get(event.code);
        if (!actions) return;
        for (const a of actions) held.delete(a);
    };

    // Alt-Tab посреди прыжка не должен оставлять клавишу зажатой навсегда.
    const onBlur = () => held.clear();

    target.addEventListener('keydown', onDown);
    target.addEventListener('keyup', onUp);
    target.addEventListener('blur', onBlur);

    return {
        held: (action) => held.has(action),
        /** Забрать нажатие. Второй раз за кадр оно уже не придёт. */
        take: (action) => {
            if (!pressed.has(action)) return false;
            pressed.delete(action);
            return true;
        },
        peek: (action) => pressed.has(action),
        clear: () => { held.clear(); pressed.clear(); },
        dispose: () => {
            target.removeEventListener('keydown', onDown);
            target.removeEventListener('keyup', onUp);
            target.removeEventListener('blur', onBlur);
        },
    };
}

/**
 * Намерение игрока на один шаг симуляции.
 *
 * Клавиатура и сенсор сливаются здесь, а не в игре: миру всё равно, чем
 * его двигают, и ни одна строчка правил не должна знать про телефон.
 */
export function readIntent(input, touch = null, pointer = null) {
    const t = touch?.state;
    const aimLen = Math.hypot(t?.aimX ?? 0, t?.aimY ?? 0);
    // Забирать нажатия надо с обеих сторон и до сравнения: `||` замыкается,
    // и оставленное в очереди сенсорное нажатие выстрелит следующим кадром.
    const jump = input.take('jump');
    const attack = input.take('attack');
    const dash = input.take('dash');
    const padJump = Boolean(touch?.take('jump'));
    const padAttack = Boolean(touch?.take('attack'));
    const padDash = Boolean(touch?.take('dash'));
    // Снимать нажатия надо до сравнений — по той же причине, что и выше.
    const swap = input.take('swap');
    const padSwap = Boolean(touch?.take('swap'));
    const pick1 = input.take('blade1');
    const pick2 = input.take('blade2');
    return {
        swapDown: swap || padSwap,
        bladeIndex: pick1 ? 0 : (pick2 ? 1 : null),
        left: input.held('left') || Boolean(t?.left),
        right: input.held('right') || Boolean(t?.right),
        up: input.held('up') || Boolean(t?.up),
        down: input.held('down') || Boolean(t?.down),
        jumpHeld: input.held('jump') || Boolean(t?.jumpHeld),
        jumpDown: jump || padJump,
        attackDown: attack || padAttack,
        dashDown: dash || padDash,
        bowHeld: input.held('bow') || Boolean(t?.bowHeld) || Boolean(pointer?.active),
        // Куда целиться. С клавиатуры — стрелками, с сенсора — наклоном
        // стика: у лука нет своего направления, он берёт его у движения.
        aimX: pointer?.active ? pointer.x : (t?.aimX ?? ((input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0))),
        aimY: pointer?.active ? pointer.y : (t?.aimY ?? ((input.held('down') ? 1 : 0) - (input.held('up') ? 1 : 0))),
        /**
         * Сила натяжения одним жестом вместе с углом — так в Bowman, и это
         * лучше отдельного таймера: рука уже показала, куда и насколько.
         * Клавиатуре жеста взять неоткуда, там сила по-прежнему от времени.
         */
        aimPower: pointer?.active
            ? pointer.power
            : (t?.bowHeld && aimLen > 0.15 ? Math.min(1, aimLen) : null),
    };
}

export { BINDINGS };
