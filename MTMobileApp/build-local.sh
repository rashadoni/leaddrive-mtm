#!/usr/bin/env bash
# Локальная сборка релизного APK → сразу на рабочий стол.
#
# Зачем: локальная сборка в разы быстрее CI — тёплый gradle-демон и
# инкрементальная компиляция дают ~1-3 минуты на повторную сборку против
# ~10-20 минут холодного CI. Плюс на Mac лежит настоящий
# mtm-release.keystore, поэтому APK подписывается тем же релизным ключом и
# обновляет уже установленное приложение. Без этого ключа скрипт завершается
# до Gradle: debug fallback намеренно запрещён.
#
# Использование (на Mac):
#   cd ~/projects/leaddrive-v2/leaddrive-mtm/MTMobileApp
#   ./build-local.sh
# или одной строкой для Codex/Claude: "запусти MTMobileApp/build-local.sh"
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(node -p "require('./package.json').version")
echo "▶ Сборка LeadDrive Route Field v${VERSION}…"

npm run verify:release-profile

if [ ! -f android/app/mtm-release.keystore ]; then
  echo "❌ android/app/mtm-release.keystore не найден"
  echo "   Подписанный update APK нельзя собирать без исходного release key."
  echo "   Debug fallback отключён, чтобы не выпустить неустанавливаемое обновление."
  exit 1
fi

# node_modules ставим только если их нет или package.json свежее
if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ]; then
  echo "▶ npm install…"
  npm install --legacy-peer-deps --no-audit --no-fund
fi

echo "▶ gradle assembleRelease…"
(cd android && ./gradlew assembleRelease)

OUT="$HOME/Desktop/leaddrive-route-field-v${VERSION}.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
echo ""
echo "✅ Готово: $OUT"
ls -lh "$OUT"
