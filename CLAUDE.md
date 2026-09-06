# leaddrive-mtm — заметки для Claude

## Порядок доставки — `docs/DELIVERY-ARCHITECTURE.md`

Этот документ главнее всего остального в том, что касается пути изменения до
полевых агентов, и действует одинаково для Claude, Codex и любых будущих сессий.
Коротко: в `main` только через PR; каждый PR разбирает агент, который его не
писал (`agent-review` — единственная обязательная проверка, своё же ревью не
считается); APK собирается в CI с fail-closed подписью; перед мержем того, что
увидит агент в поле, владельцу показывают короткий список человеческим языком и
ждут «давай».

Мобильное приложение полевых агентов LeadDrive CRM (React Native 0.84, bare,
Android-first) + admin-panel/backend (легаси, не трогать без задачи).
Приложение живёт в `MTMobileApp/`. Владелец русскоязычный — отвечать по-русски.

## Рабочий цикл релиза (локально на Mac)

- Сборка + файл на рабочий стол: `./MTMobileApp/build-local.sh`
  (release-APK, ~1–5 мин на тёплом gradle). Перед сборкой прогнать тесты.
- Тесты: `cd MTMobileApp && npx jest` (базлайн: все зелёные, ~128).
- Зависимости ставить ТОЛЬКО `npm install --legacy-peer-deps` (peer-конфликт
  @types/react у RN 0.84 — обычный `npm ci` падает).
- `npx tsc --noEmit`: базлайн ~16 строк пре-существующих ошибок (App.tsx
  Platform.Version, Ionicons types, location.ts, global в api-client.test) —
  сравнивать с базлайном, новых не добавлять.
- Эмулятор: `cd MTMobileApp && npx react-native run-android`.

## Версия — менять В ТРЁХ местах одновременно

1. `MTMobileApp/android/app/build.gradle` → versionCode + versionName
2. `MTMobileApp/App.tsx` → `ANDROID_VERSION_CODE` (Sentry-релиз)
3. `MTMobileApp/package.json` → version (его читает build-local.sh и CI)

Версия из `package.json` вдобавок штампуется в EXIF (Model) каждого полевого
фото как provenance — держать её строго `major.minor.patch` без суффиксов:
сервер валидирует тег по `/^v\d+\.\d+\.\d+$/` и иначе отклоняет загрузку с
`invalid_model`. Формат стережёт `__tests__/photo-watermark/provenance-constants.test.ts`.

## Подпись

- Релизный ключ `MTMobileApp/android/app/mtm-release.keystore` живёт только
  локально (в .gitignore). Есть локально → APK подписан релизным ключом и
  обновляет установленное приложение.
- В CI без секрета `MTM_RELEASE_KEYSTORE_B64` сборка фолбэчится на
  debug-подпись (ставится только через удаление старого приложения) —
  gradle сам предупредит.

## Контракт сервера (критично)

Сервер: leaddrive-v2 (прод https://app.leaddrivecrm.org). После LeadShelf-split
(#288/#302 в leaddrive-v2) у сервера ЕСТЬ ТОЛЬКО:
`/api/v1/mtm/mobile/{auth,ping,location,profile,notifications,sync/pull,sync/push}`,
`/api/v1/mtm/{routes,visits,tasks,customers,photos,alerts}`,
`/api/v1/mtm/agents/push-token`.
Домены заказов/SKU, планограмм/полок и оборудования УДАЛЕНЫ (ушли в проект
LeadShelf) — не добавлять их обратно в приложение.

- Ошибки API: `api.request()`/`uploadPhoto` пробрасывают `err.code`/`err.status`;
  обрабатываются коды `PHOTO_REQUIRED` (чек-аут без фото) и
  `MAX_PHOTOS_REACHED` (лимит фото) — тексты в i18n `visit.*`.
- sync/pull entities: `routes,customers,visits,tasks`; sync/push: visits
  create/update, tasks update. Полная спека контракта:
  `leaddrive-v2/docs/mtm-mobile-update-spec-2026-07-11.md` и
  `leaddrive-v2/docs/mtm-offline-sync-spec.md`.

## i18n

Три локали: `MTMobileApp/src/i18n/locales/{en,ru,az}.json` — ключи держать
в паритете во всех трёх.

## CI

`.github/workflows/build-apk.yml`: пуш в main/claude/** (с изменениями в
MTMobileApp/) → jest → assembleRelease → APK артефактом и prerelease-релизом
(`Releases` в GitHub). Архитектуры сборки: armeabi-v7a + arm64-v8a
(x86 вырезаны намеренно — время сборки).
