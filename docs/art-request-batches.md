# NEON CLAW — заказ картинок по одной

Прошлый заход провалился предсказуемо: у генератора попросили тридцать
файлов сразу, и он отдал **один контактный лист** — превью серии с
подписями и с прозрачностью, запечённой в серую шахматку. Из такого листа
ничего не вырезать: и размер вшестеро меньше нужного, и альфы уже нет.

Поэтому здесь каждый запрос — **отдельное сообщение, отдельный файл**.
Ничего не объединяй, не отправляй два подряд в одном сообщении.

## Что изменилось в объёме

**Иконок в этом заказе нет.** Пятнадцать штук — это пятнадцать ручных
пересылок ради картинок, которые всё равно надо будет уменьшать до
16 пикселей, где от рисованного объекта ничего не останется. Иконки
переехали в `asset-request.md`, очередь 3: там они заказываются данными у
кодовой модели, рисуются кодом и масштабируются без потерь.

Осталось тринадцать обязательных запросов и четыре необязательных.

## Как проверять перед сохранением

1. Пришёл **один** файл, а не сетка и не коллаж.
2. Размер совпадает попиксельно.
3. Где заявлена прозрачность — фон действительно прозрачный. Серая
   шахматка **внутри** картинки означает, что альфы нет и файл негодный.
4. На изображении нет ни одной буквы и ни одной подписи.

Складывай всё в `~/dev/Zakriva/deliverables/` зипом — разберу сам.

---

# Очередь A — фоны. Девять запросов

Девять отдельных сообщений. В каждом меняются только две вещи: **район** и
**слой**. Ниже готовый текст, подставляй по таблице.

| № | Файл | Район | Слой |
|---|---|---|---|
| A1 | `roofs-far.png` | крыши | дальний |
| A2 | `roofs-mid.png` | крыши | средний |
| A3 | `roofs-near.png` | крыши | ближний |
| A4 | `warehouse-far.png` | склад | дальний |
| A5 | `warehouse-mid.png` | склад | средний |
| A6 | `warehouse-near.png` | склад | ближний |
| A7 | `market-far.png` | рынок | дальний |
| A8 | `market-mid.png` | рынок | средний |
| A9 | `market-near.png` | рынок | ближний |

Текст запроса (подставь описание района и слоя из таблиц ниже):

```
Verne one single PNG file, exactly 1920 x 540 pixels, with a real alpha
channel. Do NOT return a contact sheet, a grid, a preview collage, or
multiple variants — one image only. No captions, no labels, no filename
text baked into the picture.

Subject: a horizontal strip of cyberpunk city at night, seen from the
side, for a side-scrolling game parallax layer.
<СЛОЙ>
<РАЙОН>

Style: flat black building silhouettes, colors between #05060f and
#0a0b1c, with a thin glowing neon rim on roof edges. Small lit windows in
cyan #22e8ff and magenta #ff2d95. Neon signs are glowing colored bars and
panels only — absolutely no letters, no glyphs, no writing of any kind.
Night. No sun, no fog, no rain, no wet reflections, no lens flare.
Graphic and flat, not painterly, heavy blacks.

Everything above and around the silhouette must be fully transparent —
the sky is drawn by the game engine, not by you. No ground plane, no
frame, no border, no watermark, no characters.
```

**Подставь слой:**

- дальний: `Distant small towers, silhouette height about one quarter of the frame, cold violet #7c4dff rim light, very few windows, no signs.`
- средний: `Mid-distance buildings, silhouette height about half the frame, cyan rim light, more windows, some vertical glowing sign panels.`
- ближний: `Large dark masses filling most of the frame, magenta rim light, few windows, sagging cables and antennas on top.`

**Подставь район:**

- крыши: `District: rooftops. Towers of varying heights with wide gaps between them, open sky, antennas and satellite dishes.`
- склад: `District: cargo warehouses. Low wide hangars, long horizontals, gantry cranes, pipes and vents on the roofs, sparse lights.`
- рынок: `District: night market. Dense packed low buildings with no gaps, jutting awnings, strings of small lights, very many tiny glowing points.`

---

# Очередь B — ключевой арт. Два запроса

**B1 → `title.png`, 1920 × 1080.** Уйдёт фоном под меню, поэтому середина
кадра обязана быть тёмной и пустой: поверх лягут название и карточки.

```
Return one single PNG file, exactly 1920 x 1080 pixels. Not a contact
sheet, not a grid, not variants — one image. No text anywhere in the
picture, no logo, no watermark, no caption.

A cyberpunk ninja stands on a rooftop edge at night, seen from behind and
slightly below, small in the frame, in the lower left third. Dark
silhouette with a thin cyan rim light. Hooded, long scarf trailing in the
wind, katana on the back, climbing claws on the forearms.

Beyond and below — a dense neon city, magenta and cyan signs, all signs
are glowing bars and panels with no readable letters.

The center of the image must stay dark and uncluttered — user interface
will be placed over it. Flat graphic style, heavy blacks, no painterly
rendering, no rain, no wet reflections, no lens flare.
```

**B2 → `social.png`, 1200 × 630.** То же самое, но горизонтальнее и
плотнее: это карточка для ссылок, её видят маленькой.

---

# Очередь C — референсы персонажей. Два запроса

Это **не для игры**, а руководство, по которому я правлю позы в коде.
Поэтому нужен разворот одной и той же фигуры, а не красивая иллюстрация.

**C1 → `ninja.png`, 1024 × 1024:**

```
Return one single PNG file, exactly 1024 x 1024 pixels, transparent
background. One image only, no grid of variants, no text, no labels,
no watermark.

Character reference: three views of the SAME character side by side —
front, side, back. Full body, standing neutral pose, same proportions in
all three views.

Cyberpunk ninja: hood, dark bodysuit, long trailing scarf, katana on the
back, climbing claws on the forearms, one glowing cyan visor slit instead
of a face. Flat graphic style, dark silhouette with thin cyan rim light.
No background, no ground shadow, no frame.
```

**C2 → `enforcer.png`, 1024 × 1024.** То же самое, но тяжелее и шире:
шлем с гребнем, одна красная щель визора `#ff3b5c`, броневые пластины,
клинок на поясе, красная подсветка вместо циановой.

---

# Очередь D — текстуры. Необязательно

Четыре файла по 128 × 128, бесшовные: `concrete`, `metal`, `fabric`,
`grate`. Лягут очень слабым слоем внутрь массивов — это фактура, а не
рисунок, и без них игра выглядит ровно так же. Бери, только если первые
три очереди уже пришли.

```
Return one single PNG file, exactly 128 x 128 pixels, seamlessly
tileable. One image only, no grid, no text, no watermark.

Seamless dark texture of <поверхность>, flat top-down, almost black
(#0a0b1c), very low contrast, subtle surface detail only. No lighting,
no highlights, no color tint, no visible seams at the edges.
```

Стык проверю укладкой 2×2 — если шов виден, файл вернётся.
