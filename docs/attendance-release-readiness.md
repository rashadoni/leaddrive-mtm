# Отдельный выпуск LeadDrive Time 1042

Состояние на 24 октября 2026: **PREPARED_AWAITING_REAL24H**. Публичный выпуск не создан; PR #196 остаётся draft. Разрешение пользователя на выпуск после всех проверок сохраняется. Реальный суточный тест не ускоряется и не перезапускается ради выпуска.

## Проверенная сборка

- Приложение: LeadDrive Time, `com.leaddrive.attendance`, Android 1.0.0 / 1042.
- Исходный код APK: `2ec1bc791c77b53d64bff680284f4ce3636d5d4f`.
- GitHub Actions: standalone run `40028532558`, job `120670703011`, artifact `12534142203`.
- SHA-256 APK: `5ca1e258a5b9c58c0eeb2590d0bad9f2c75b4cf3b3982ef7f9de2e3472ea470f`.
- Подпись: exact-source hosted `apksigner` и pin сертификата; inplace-установка этой сборки на телефон прошла. При подготовке пакета сертификат повторно локально не извлекался; проверено байтовое совпадение с установленным кандидатом.
- Подготовленная копия и checksum: `/mnt/HC_Volume_106454338/codex-alt-data/tmp/time-release-candidate-1042/`. APK имеет собственное имя `leaddrive-time-v1.0.0-1042.apk`. Исходные build-time metadata не переписаны: более поздние native результаты хранятся отдельно.

## Разделение с Route & Field

Time использует отдельную точку входа AttendanceApp и не запускает обновлятор Route & Field. Пакет Route & Field — `com.mtmobileapp`. В этом выпуске доставка Time — отдельный APK; автоматический канал обновлений Time пока отсутствует.

Проверен фактически развёрнутый CRM selector `src/lib/mtm/field-app-release.ts` из backend SHA `64356065f3878a547bdd5fa87cbf9f789f1f92a2`, exact Git blob `883181b81de24398d32c876eddd220b35acef6dc`. Проверка выполняет сам selector, а не его копию: в настоящем окне 50 GitHub releases он выбирает RF 3.11.53 / 1795. Только предполагаемый Time release возвращает null; добавление Time первым в это же окно сохраняет RF 1795. Для проверки имени assets у Time намеренно задано `(branch main)` в body. Публичный GET `/api/v1/public/field-app/latest` также вернул RF 1795.

План отдельного выпуска: tag `time-v1.0.0-build1042`, только Time APK и его checksum, `prerelease=true`, `make_latest=false`. Не использовать `leaddrive-mtm-*` для Time и не прикладывать RF AAB. Перед реальной публикацией повторно проверить актуальный selector/backend, отсутствие такого tag, состав assets и соответствие проверенного кода reviewed main. Отдельная новая проверенная сборка потребуется, если runtime приложения изменится; проверенный APK нельзя молча заменить.

Артефакты проверки: `release-isolation-check-sanitized.json`, `public-field-channel-sanitized.json`, `release-manifest.json` и `release-notes-draft.md` в указанном приватном каталоге. Это подготовка, не GitHub release и не изменение CRM.

## Оставшийся обязательный gate

Текущая неизменяемая попытка: `physical-soak-20261024-v11`. Начало офлайна `2026-10-23T22:42:14Z`; не раньше `2026-10-25T02:44:14+04:00` (Баку), затем восстановление связи и проверка доставки. Три отметки PAUSE/RESUME/FINISH уже сохранены; повторно их не создавать.

Каталог результата: `/mnt/HC_Volume_106454338/codex-alt-data/tmp/mtm-maestro-device-20261021/physical-soak-20261024-v11/`. Требуются **оба PASS**: `result-sanitized.json` и `release-acceptance-sanitized.json`. Независимый reviewer проверяет непрерывность device/HR streams, читаемое доказательство очереди, истечение допуска, исходные claimedAt, отсутствие дублей и восстановление сети/разрешений. GPS в этом тесте запрещён; результат не доказывает INSIDE. Физический USB disconnect/deep sleep отдельно не квалифицирован.

После PASS: проверить актуальные CI и backend compatibility, довести PR #196 до reviewed main, затем опубликовать отдельный подписанный Time APK по прежнему разрешению. Тестовый контур только фиктивный; принятый Route & Field визит не повторять.

Полные локальные builds/Jest/TypeScript/browser E2E: **NOT RUN** по Contabo host contract. Использованы ранее полученные hosted результаты точной сборки; текущая локальная проверка ограничена одним pure selector и контрольной суммой APK.
