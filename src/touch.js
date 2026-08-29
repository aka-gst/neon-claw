/**
 * Сенсорное управление. Не «кнопки поверх игры», а отдельная раскладка.
 *
 * Действий много, а места мало, поэтому у стика двойная работа: он и
 * ведёт героя, и целится из лука — глубина наклона задаёт силу натяжения.
 *
 * Стик безосевой: он появляется там, где палец коснулся экрана, а не в
 * заранее нарисованном кружке. На телефоне не видно, куда ты кладёшь палец,
 * и попадать в нарисованное место — отдельная работа, которой быть не должно.
 */

/**
 * Захват указателя нужен, чтобы палец, уехавший за край зоны, всё ещё
 * управлял стиком. Но браузер отказывается захватывать указатель, которого
 * не существует, — и роняет весь обработчик. Один отказ не должен ломать
 * управление целиком.
 */
function capture(el, event) {
    try {
        el.setPointerCapture(event.pointerId);
    } catch {
        // Не вышло — стик просто перестанет слушаться за пределами зоны.
    }
}

/** Мёртвая зона: случайное дрожание пальца не должно быть вводом. */
const DEAD_X = 8;
const DEAD_Y = 18;
/** Опорный радиус стика для прицеливания. */
const AIM_R = 64;

export function createTouch(root) {
    const state = {
        left: false, right: false, up: false, down: false,
        jumpHeld: false, bowHeld: false,
        /** Наклон стика как вектор: им же целятся из лука. */
        aimX: 0, aimY: 0,
    };
    const pressed = new Set();
    /** Палец, который сейчас держит стик. Остальные — кнопки. */
    let stick = null;

    const clearStick = () => {
        stick = null;
        state.left = false;
        state.right = false;
        state.up = false;
        state.down = false;
        state.aimX = 0;
        state.aimY = 0;
    };

    const pad = root.querySelector('[data-touch="pad"]');

    pad.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        capture(pad, event);
        stick = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });

    pad.addEventListener('pointermove', (event) => {
        if (!stick || event.pointerId !== stick.id) return;
        const dx = event.clientX - stick.x;
        const dy = event.clientY - stick.y;
        state.left = dx < -DEAD_X;
        state.right = dx > DEAD_X;
        state.down = dy > DEAD_Y;
        state.up = dy < -DEAD_Y;
        // Вектор прицела нормируется по опорному радиусу: дальше него
        // наклон уже ничего не добавляет, а палец устаёт.
        state.aimX = Math.max(-1, Math.min(1, dx / AIM_R));
        state.aimY = Math.max(-1, Math.min(1, dy / AIM_R));
    });

    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
        pad.addEventListener(type, (event) => {
            if (stick && event.pointerId === stick.id) clearStick();
        });
    }

    for (const button of root.querySelectorAll('[data-touch]:not([data-touch="pad"])')) {
        const action = button.dataset.touch;
        button.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            capture(button, event);
            button.classList.add('is-down');
            pressed.add(action);
            if (action === 'jump') state.jumpHeld = true;
            if (action === 'bow') state.bowHeld = true;
        });
        const release = () => {
            button.classList.remove('is-down');
            if (action === 'jump') state.jumpHeld = false;
            if (action === 'bow') state.bowHeld = false;
        };
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
            button.addEventListener(type, release);
        }
    }

    return {
        state,
        /** Забрать нажатие. Второй раз за кадр оно уже не придёт. */
        take(action) {
            if (!pressed.has(action)) return false;
            pressed.delete(action);
            return true;
        },
        /** Уход со вкладки не должен оставлять палец «зажатым» навсегда. */
        release() {
            clearStick();
            pressed.clear();
            state.jumpHeld = false;
            state.bowHeld = false;
            for (const b of root.querySelectorAll('[data-touch]')) b.classList.remove('is-down');
        },
    };
}

/**
 * Показывать ли сенсорные кнопки. Смотрим на наличие сенсора, а не на
 * ширину: на планшете с клавиатурой они лишние, а на узком окне рабочего
 * стола — тем более.
 */
export const hasTouch = () => (
    typeof navigator !== 'undefined'
    && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
);
