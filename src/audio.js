/**
 * Звук — синтезом, без единого файла.
 *
 * Платформер без щелчка прыжка и звона о гарду ощущается мёртвым, но
 * тащить ради этого мегабайты сэмплов в проект без сборки не хочется.
 * Десяток огибающих на осцилляторах закрывает вопрос и заодно попадает
 * в стиль: неон и должен звучать синтетически.
 *
 * Контекст создаётся только по первому нажатию — иначе браузер его
 * заблокирует, и первые пять секунд игры пройдут в тишине.
 */

let ctx = null;
let master = null;
let noiseBuffer = null;

function ensure() {
    if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);

    const frames = Math.floor(ctx.sampleRate * 0.4);
    noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
}

function tone({ from, to = from, dur = 0.12, type = 'square', gain = 0.25, delay = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
}

function hiss({ dur = 0.12, gain = 0.2, freq = 2400, q = 1, delay = 0 }) {
    if (!ctx || !noiseBuffer) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(env).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
}

const VOICES = {
    jump: () => tone({ from: 300, to: 640, dur: 0.11, type: 'triangle', gain: 0.18 }),
    land: () => tone({ from: 140, to: 70, dur: 0.09, type: 'sine', gain: 0.22 }),
    swing: () => hiss({ dur: 0.09, gain: 0.12, freq: 3200, q: 0.7 }),
    ledge: () => tone({ from: 520, to: 380, dur: 0.07, type: 'triangle', gain: 0.14 }),
    // Толчок от стены звучит короче прыжка: он не взлёт, а отскок.
    walljump: () => {
        tone({ from: 380, to: 700, dur: 0.08, type: 'triangle', gain: 0.17 });
        hiss({ dur: 0.12, gain: 0.13, freq: 2600, q: 1.2 });
    },
    dash: () => {
        hiss({ dur: 0.16, gain: 0.16, freq: 1800, q: 0.5 });
        tone({ from: 620, to: 240, dur: 0.14, type: 'sawtooth', gain: 0.11 });
    },
    slide: () => hiss({ dur: 0.34, gain: 0.13, freq: 1100, q: 0.9 }),
    scrape: () => hiss({ dur: 0.06, gain: 0.05, freq: 3400, q: 2.2 }),
    // «Тебя услышали» — короткий вопрос, а не тревога: ещё можно уйти.
    heard: () => {
        tone({ from: 700, to: 900, dur: 0.09, type: 'triangle', gain: 0.15 });
        tone({ from: 900, to: 760, dur: 0.1, type: 'triangle', gain: 0.11, delay: 0.09 });
    },
    takedown: () => {
        hiss({ dur: 0.09, gain: 0.14, freq: 5200, q: 2.4 });
        tone({ from: 240, to: 90, dur: 0.16, type: 'sine', gain: 0.2 });
    },
    checkpoint: () => {
        [523, 784].forEach((f, i) => tone({ from: f, dur: 0.14, type: 'triangle', gain: 0.13, delay: i * 0.08 }));
    },
    retry: () => tone({ from: 180, to: 420, dur: 0.16, type: 'square', gain: 0.14 }),
    // Натяжение слышно как нарастающее напряжение, выстрел — как срыв.
    'bow.draw': () => tone({ from: 160, to: 300, dur: 0.5, type: 'triangle', gain: 0.07 }),
    'bow.release': () => {
        hiss({ dur: 0.08, gain: 0.12, freq: 2800, q: 1.4 });
        tone({ from: 520, to: 200, dur: 0.1, type: 'triangle', gain: 0.1 });
    },
    'arrow.hit': () => {
        tone({ from: 900, to: 500, dur: 0.07, type: 'square', gain: 0.12 });
        hiss({ dur: 0.06, gain: 0.09, freq: 3600, q: 2 });
    },

    hit: () => {
        tone({ from: 180, to: 60, dur: 0.14, type: 'square', gain: 0.26 });
        hiss({ dur: 0.1, gain: 0.18, freq: 1400, q: 0.8 });
    },
    // Звон должен раздражать ровно настолько, чтобы в следующий раз выждать.
    clang: () => {
        tone({ from: 1750, to: 1500, dur: 0.22, type: 'square', gain: 0.13 });
        tone({ from: 2600, to: 2350, dur: 0.18, type: 'square', gain: 0.08, delay: 0.01 });
        hiss({ dur: 0.14, gain: 0.14, freq: 4200, q: 1.6 });
    },
    kill: () => {
        tone({ from: 320, to: 40, dur: 0.34, type: 'sawtooth', gain: 0.24 });
        hiss({ dur: 0.3, gain: 0.16, freq: 900, q: 0.5 });
    },

    pickup: () => tone({ from: 880, to: 1320, dur: 0.1, type: 'square', gain: 0.13 }),
    core: () => {
        tone({ from: 660, to: 990, dur: 0.14, type: 'triangle', gain: 0.18 });
        tone({ from: 990, to: 1480, dur: 0.18, type: 'triangle', gain: 0.14, delay: 0.08 });
    },
    hurt: () => {
        tone({ from: 420, to: 90, dur: 0.26, type: 'sawtooth', gain: 0.26 });
        hiss({ dur: 0.16, gain: 0.16, freq: 700, q: 0.6 });
    },
    fall: () => tone({ from: 500, to: 60, dur: 0.42, type: 'sawtooth', gain: 0.22 }),
    win: () => {
        [523, 659, 784, 1047].forEach((f, i) =>
            tone({ from: f, dur: 0.22, type: 'triangle', gain: 0.16, delay: i * 0.1 }));
    },
    lose: () => {
        [392, 330, 262, 196].forEach((f, i) =>
            tone({ from: f, dur: 0.3, type: 'sawtooth', gain: 0.16, delay: i * 0.14 }));
    },
};

export function createAudio() {
    let muted = false;
    return {
        unlock: ensure,
        get muted() { return muted; },
        toggle() {
            muted = !muted;
            if (master) master.gain.value = muted ? 0 : 0.3;
            return muted;
        },
        play(name) {
            if (muted || !VOICES[name]) return;
            if (!ensure()) return;
            VOICES[name]();
        },
    };
}
