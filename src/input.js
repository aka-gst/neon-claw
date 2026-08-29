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
    // Ctrl под «красться» — идиома Thief и Splinter Cell, руки её знают.
    walk: ['ControlLeft', 'ControlRight'],
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

/** Намерение игрока на один шаг симуляции. */
export function readIntent(input) {
    return {
        left: input.held('left'),
        right: input.held('right'),
        up: input.held('up'),
        down: input.held('down'),
        jumpHeld: input.held('jump'),
        jumpDown: input.take('jump'),
        attackDown: input.take('attack'),
        dashDown: input.take('dash'),
        walk: input.held('walk'),
    };
}

export { BINDINGS };
