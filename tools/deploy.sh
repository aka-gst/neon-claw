#!/usr/bin/env sh
# Выкладка игры на aka-gst.ru/claw/.
#
#   sh tools/deploy.sh                    проверить сборку и показать, что уедет
#   sh tools/deploy.sh --deploy           и выложить
#   GAME_PATH=... sh tools/deploy.sh --deploy   выложить по другому адресу
#
# Каталог игры живёт только на сервере: в дереве сайта его нет, и
# выкладывается он отсюда. Поэтому --delete здесь безопасен и нужен — он
# убирает остатки предыдущих сборок.
set -eu

DEPLOY=no
[ "${1:-}" = "--deploy" ] && DEPLOY=yes
SSH_HOST="${SSH_HOST:-bonita}"
SITE_ROOT="${SITE_ROOT:-/opt/zakriva/caddy/site}"
GAME_PATH="${GAME_PATH:-claw}"

HERE="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# index.html грузит ./src/main.js как ES-модуль, а тот тянет ассеты.
# Копируется дерево целиком, иначе на сервере будет белый экран.
SHIP="index.html src styles assets"

echo "проверка правил и структуры"
npm test --silent >/dev/null || {
  echo "ОШИБКА: тесты не проходят, выкладка отменена" >&2
  exit 1
}

for entry in $SHIP; do
  [ -e "$HERE/$entry" ] || { echo "ОШИБКА: нет $entry" >&2; exit 1; }
  cp -R "$HERE/$entry" "$STAGE/"
done

echo
echo "уедет на $SSH_HOST:$SITE_ROOT/$GAME_PATH/"
(cd "$STAGE" && find . -type f | sed 's|^\./|  |' | sort)
echo
echo "итого $(cd "$STAGE" && find . -type f | wc -l | tr -d ' ') файлов, $(du -sh "$STAGE" | cut -f1)"

# Выкладываем то, что есть в истории, а не то, что лежит в дереве. Иначе
# «на бою коммит такой-то» — неправда: рядом могли остаться несохранённые
# правки, и потом никто не восстановит, что именно уехало.
DIRTY=$(git -C "$HERE" status --porcelain)
if [ -n "$DIRTY" ]; then
  echo
  echo "ОШИБКА: дерево грязное, выкладывать нечего сверять с историей:" >&2
  echo "$DIRTY" >&2
  echo "сначала коммит, потом выкладка" >&2
  exit 1
fi
COMMIT=$(git -C "$HERE" rev-parse --short HEAD)
echo "выкладывается коммит $COMMIT"

if [ "$DEPLOY" != yes ]; then
  echo
  echo "это была проверка. чтобы выложить: sh tools/deploy.sh --deploy"
  exit 0
fi

echo
echo "выкладка"
ssh "$SSH_HOST" "mkdir -p '$SITE_ROOT/$GAME_PATH'"
rsync -a --delete "$STAGE/" "$SSH_HOST:$SITE_ROOT/$GAME_PATH/"

# Код ответа не доказывает НИЧЕГО: двести отдаёт и вчерашняя копия. Сверяем
# содержимое — считаем хеш того, что уехало, и того, что отдаёт сервер.
# Повод: соседняя сессия проверяла починку на бою, не нашла её и полезла
# читать файл руками — потому что сказать «выложено или нет» было нечем.
# Сеть рвётся на паре процентов запросов, поэтому каждому запросу ретраи.
echo "проверка живых адресов и содержимого"
BASE="https://aka-gst.ru/$GAME_PATH"
FAIL=0
for path in "/index.html" "/src/main.js" "/src/world.js" "/src/enemy.js" "/src/tuning.js" "/styles/game.css" "/assets/tiles/roofs.json"; do
  code=$(curl -s --retry 4 --retry-all-errors --max-time 20 -o /tmp/claw-live -w '%{http_code}' "$BASE$path")
  if [ "$code" != 200 ]; then
    printf '  %-34s %s  ОТВЕТ НЕ 200\n' "$path" "$code"
    FAIL=1
    continue
  fi
  want=$(shasum -a 256 "$STAGE$path" | cut -d' ' -f1)
  got=$(shasum -a 256 /tmp/claw-live | cut -d' ' -f1)
  # Если сам измеритель не отработал, оба хеша пустые — и пустое РАВНО
  # пустому, то есть проверка радостно печатает «совпало» на ровном месте.
  # Поймано вживую: песочница не пустила shasum, и сверка объявила совпавшими
  # файлы, которые отличаются на четыре килобайта. Молчащий инструмент обязан
  # быть ошибкой, а не успехом.
  if [ -z "$want" ] || [ -z "$got" ] || [ ! -s /tmp/claw-live ]; then
    printf '  %-34s %s  ПРОВЕРКА НЕ ОТРАБОТАЛА (нечем сверить)\n' "$path" "$code"
    FAIL=1
  elif [ "$want" = "$got" ]; then
    printf '  %-34s %s  совпало\n' "$path" "$code"
  else
    printf '  %-34s %s  НЕ ТО СОДЕРЖИМОЕ (уехало %s, отдаёт %s)\n' \
      "$path" "$code" "$(wc -c < "$STAGE$path" | tr -d ' ')" "$(wc -c < /tmp/claw-live | tr -d ' ')"
    FAIL=1
  fi
done
rm -f /tmp/claw-live

# Внутренние файлы наружу отдавать нельзя, и чёрный список тут не годится:
# он защищает лишь от того, что успели в него вписать.
for path in "/docs/todo.md" "/CLAUDE.md" "/package.json" "/tests/impact.test.mjs"; do
  code=$(curl -s --retry 3 --max-time 15 -o /dev/null -w '%{http_code}' "$BASE$path")
  [ "$code" = 404 ] || { printf '  %-34s %s  ДОЛЖНО БЫТЬ 404\n' "$path" "$code"; FAIL=1; }
done

[ "$FAIL" = 0 ] || { echo "ОШИБКА: бой не совпал с тем, что уехало" >&2; exit 1; }

echo
echo "готово: $BASE/ — коммит $COMMIT"
