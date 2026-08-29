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

if [ "$DEPLOY" != yes ]; then
  echo
  echo "это была проверка. чтобы выложить: sh tools/deploy.sh --deploy"
  exit 0
fi

echo
echo "выкладка"
ssh "$SSH_HOST" "mkdir -p '$SITE_ROOT/$GAME_PATH'"
rsync -a --delete "$STAGE/" "$SSH_HOST:$SITE_ROOT/$GAME_PATH/"

echo "проверка живых адресов"
BASE="https://aka-gst.ru/$GAME_PATH"
for path in "/" "/src/main.js" "/styles/game.css" "/assets/tiles/roofs.json" "/assets/backdrop/roofs-far.png"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  printf '  %-40s %s\n' "$path" "$code"
  [ "$code" = 200 ] || { echo "ОШИБКА: $BASE$path отдаёт $code" >&2; exit 1; }
done

echo
echo "готово: $BASE/"
