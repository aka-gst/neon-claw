/** Мелкие сборки для тестов: маленькие карты и «нажатия» без браузера. */

export const NO_INPUT = {
    left: false, right: false, up: false, down: false,
    jumpHeld: false, jumpDown: false, attackDown: false, dashDown: false,
};

export const intent = (over = {}) => ({ ...NO_INPUT, ...over });

/** Ровная площадка с потолком открытым: удобно мерить прыжок. */
export const FLAT = [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    'p...................',
    '####################',
    '####################',
];
