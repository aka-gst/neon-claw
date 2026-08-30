# NEON CLAW — задание на звук

Задание самодостаточное. Промты по-английски — так генераторы точнее понимают
жанровые термины; пояснения и правила по-русски. У музыки два вида промта:
**строка стиля** для Suno и **развёрнутое описание** для ElevenLabs Music или
Stable Audio. Брать один из двух, не оба.

## Что за игра

Неоновый платформер про кибер-ниндзя: паркур по ночным крышам, катана, когти
и стражи, которые умеют блокировать. Двумерный вид сбоку.

Ориентиры: **Captain Claw** — по плотности уровней, фехтованию и жадности до
тайников; **Dead Cells** — по хватке боя и перекату; «Планета сокровищ» и
«Пираты тёмной воды» — по картинке.

**Главное про палитру, и оно же главное про звук: это тёплый неон, а не
холодный.** Латунь и глубокий пурпур вместо стального синего. Обычный
киберпанк-саундтрек — ледяной и стеклянный — сюда не подходит: он вернёт игру
в ту эстетику, из которой её нарочно вывели. Нужен неон с медью: аналоговые
синтезаторы с тёплым насыщением, лента, лёгкая расстройка.

Стелс отсюда передан соседней игре, поэтому крадущегося слоя в музыке не
нужно — здесь движение и высота.

## Правила выдачи

- **Музыка:** MP3, 128–160 kbps, 60–120 секунд, бесшовная петля по такту.
  Без вокала.
- **Звуки:** WAV 44.1 кГц, короткие, без хвоста тишины, пик −3 дБ.
- **Движение звучит десять раз в секунду.** Прыжки, приземления, скольжение
  повторяются постоянно, поэтому им нужно **по 3–4 варианта** каждому и
  никакого «характера»: заметный тембр надоедает за минуту игры.
- **Вес:** файлы уезжают на публичный сайт вместе с игрой.
- Один промт — один файл.

---

# Музыка

## 1. `music/rooftops.mp3` — цикл уровня

Играет постоянно, пока игрок бегает по крышам. Темп — движение, а не бой:
ровный пульс, который держит игрока в потоке и не требует внимания.

Строка стиля для Suno:

```
warm analog synthwave, 112 BPM, F minor, tape saturation, brass-tinted lead,
deep purple pads, driving arpeggio, no vocals, loopable, nocturnal, no cold
digital sheen
```

Развёрнутое описание:

```
A warm analog synthwave instrumental loop for a neon rooftop platformer.
112 BPM, F minor. A steady driving arpeggio underneath, deep warm pads, and a
restrained lead with a brass-like character. Everything runs through tape
saturation and slight detune — the sound should feel like brass and deep
purple, not like cold steel or glass. Nocturnal and forward-moving, but never
aggressive: this plays continuously while the player runs and jumps. No
vocals, no build-up, no drop. Seamless loop, 90 seconds.
```

## 2. `music/combat.mp3` — сшибка со стражей

Включается на бою и уходит, когда бой кончился. Отличается от основного трека
не громкостью, а плотностью: те же инструменты, но чаще и злее.

```
darksynth combat loop, 128 BPM, F minor, distorted bass, tight drums,
aggressive arpeggio, warm analog character, no vocals, loopable
```

Развёрнутое описание:

```
An aggressive darksynth combat loop for a neon platformer. 128 BPM, F minor,
same warm analog palette as the calmer exploration theme but denser and
harder: distorted bass, tight punchy drums, and a fast aggressive arpeggio.
Must resolve back to calm cleanly when the fight ends. No vocals. Seamless
loop, 60 seconds.
```

## 3. `music/checkpoint.mp3` и `music/death.mp3`

По 2–3 секунды, играют один раз, без петли.

Контрольная точка:

```
short warm synth sting, 2 seconds, two ascending analog tones resolving to a
major interval, tape-saturated, rewarding and brief, no vocals
```

Смерть:

```
short synth failure sting, 2 seconds, descending detuned tone collapsing into
a dull low thud, warm analog character, not comedic, no vocals
```

---

# Звуки

Сейчас всё синтезируется в `src/audio.js` — там уже есть словарь голосов
`VOICES` с готовой раскладкой по событиям. Файлы заменят его по одному, имя в
имя.

## Движение — по 3–4 варианта на файл

`sfx/jump-1..3.wav`

```
Cyber-ninja jump, 0.12 seconds. A short cloth-and-boot push-off with a faint
warm synth swell rising under it. Light, no impact, no tail. Mono.
```

`sfx/land-1..3.wav`

```
Landing on a metal rooftop, 0.15 seconds. A dull low thud with a short metal
resonance and cloth settle. Dry, close, no reverb. Mono.
```

`sfx/walljump-1..3.wav` — толчок от стены звучит короче прыжка: это не взлёт,
а отскок.

```
Wall kick-off, 0.1 seconds. A sharp scuff of a boot against concrete with a
quick upward air rush. Clearly shorter and tighter than a normal jump. Mono.
```

`sfx/dash.wav`

```
Fast dash, 0.18 seconds. A tight compressed air rush with a warm synth
downsweep behind it. Punchy, dry, no tail. Mono.
```

`sfx/slide.wav`

```
Sliding along a metal surface, 0.4 seconds. A continuous friction scrape with
a faint metallic ring, even in level and ready to be cut at any point. Mono.
```

`sfx/ledge.wav` — зацеп за карниз.

```
Hand grabbing a ledge, 0.1 seconds. A short gloved slap on concrete with a
faint cloth strain. Quiet, dry. Mono.
```

## Катана и когти

`sfx/swing-1..3.wav`

```
Katana swing through air, 0.12 seconds. A thin fast whoosh with a bright
metallic edge at the start. Short, no tail. Mono.
```

`sfx/hit-flesh.wav`

```
Blade cutting into a body, 0.25 seconds. A wet slice with a short low thud
underneath. Close and dry, no reverb, not cartoonish. Mono.
```

`sfx/clang.wav` — страж заблокировал удар. Звон должен раздражать ровно
настолько, чтобы в следующий раз игрок выждал.

```
Sword blocked by a guard's weapon, 0.3 seconds. A bright hard metallic clang
with a ringing tail that lingers slightly too long. Sharp and mildly
irritating by design. Mono.
```

`sfx/claw.wav`

```
Steel claws raking across metal, 0.2 seconds. Three fast bright scrapes
overlapping, with a thin ring. Dry, close. Mono.
```

`sfx/kill.wav`

```
Enemy death in a neon action game, 0.4 seconds. A wet body impact followed by
a descending warm synth collapse. Dry, close, no reverb. Mono.
```

## Лук

Дальнобойное оружие делается по референсам браузерных дуэлей лучников: дуга с
гравитацией, снаряд втыкается и остаётся в теле. Звук должен продавать именно
физику — натяжение, срыв, втыкание.

`sfx/bow-draw.wav`

```
Bow being drawn, 0.5 seconds. Creaking tension of a string and limb, rising
slowly and evenly. Must feel like stored energy. Dry, close. Mono.
```

`sfx/bow-release.wav`

```
Bow release, 0.15 seconds. A sharp string snap followed by a fast air whoosh
departing. Dry, close, no tail. Mono.
```

`sfx/arrow-hit-body.wav`

```
Arrow striking a body, 0.2 seconds. A wet thud with a short shaft vibration
after it. Close, dry. Mono.
```

`sfx/arrow-hit-wall.wav`

```
Arrow striking concrete, 0.25 seconds. A hard dry knock with a brief buzzing
shaft resonance. Close, dry. Mono.
```

## Интерфейс и тайники

`sfx/pickup-coin.wav` — жадность до тайников взята из Captain Claw, и звук
подбора отвечает за неё целиком.

```
Treasure pickup chime, 0.25 seconds. Two bright ascending metallic tones with
a warm analog shimmer, like small coins. Immediately satisfying, clean, short.
Mono.
```

`sfx/secret.wav` — найден тайник.

```
Hidden secret discovered, 0.8 seconds. A warm rising synth arpeggio resolving
to a major chord with a brief shimmer tail. Rewarding, not fanfare-loud. Mono.
```

`sfx/ui-select.wav`

```
UI tick for a neon game menu, 0.06 seconds. A single short warm synth blip.
Very quiet. Mono.
```

---

# Что делать с готовыми файлами

1. Музыку положить в `music/`, звуки — в `assets/sfx/`.
2. `src/audio.js` уже разложен по событиям — словарь `VOICES` содержит те же
   имена, что и файлы выше (`jump`, `land`, `walljump`, `dash`, `slide`,
   `clang`, `kill`, `bow.draw`, `bow.release`, `arrow.hit`). Заменять синтез на
   файлы можно по одному, не трогая игровой код.
3. Начинать стоит с боя: `swing`, `clang`, `hit-flesh`. Вертикальный срез
   отвечает на единственный вопрос — приятно ли щупать, — и звон блока даёт
   больше половины этого ответа.
