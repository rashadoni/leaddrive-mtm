# Route & Field — оставшиеся находки, 24 октября 2026

## Начальная точка

Пользователь после отчёта об исправленных и открытых багах поручил: «начинай работу». Продолжаем оставшиеся находки: фактическая версия APK в серверной телеметрии, ошибка страницы менеджера после утверждения GPS и композиция Today в landscape. Ранее принятые задача, запрос GPS, визит и фото не повторяются.

Предыдущие результаты и исходные FAIL сохраняются в `/mnt/HC_Volume_106454338/codex-alt-data/worktrees/mtm-route-field-negative-e2e/docs/route-field-testing-session-log.md`. RF3.11.53/1795 уже выпущен/установлен. Суточный Time1042/v11 продолжает работать отдельно; до завершения окна и восстановления scope нельзя устанавливать другую RF/Time APK, менять сеть, разрешения или создавать новые отметки.

Новый чистый worktree `/mnt/HC_Volume_106454338/codex-alt-data/worktrees/mtm-route-field-followups`, ветка `codex/route-field-followups`, origin `https://github.com/rashadoni/leaddrive-mtm.git`, base main `48e873551e0c95da8b2d829fbd3f48779307bdc9`. Предыдущие worktree/локальные checkpoints сохранены. Mobile release — штатный GitHub Actions; production CRM не является целью мобильной сборки.

## План и ограничения

1. Установить все потребители версии APK и серверное влияние заголовка. Регрессией воспроизвести устаревшую версию; брать версию/код из установленной Android-сборки без ручного обновления константы при каждом CI run. Сохранить identity отдельного Time и отсутствие зависимости между допусками.
2. Разобрать сохранённый сбой менеджера и текущий код очереди координат. Воспроизвести минимальным тестом, затем исправить подтверждённую причину. Одно успешное последующее открытие не считается исправлением редкого сбоя. Серверная диагностика ведётся отдельно в `crm-route-field-gps-review` от текущего64356065f.
3. Для landscape сначала проверить прежние снимки/размеры и текущий Today, затем внести небольшую композиционную правку с сохранением всех действий.
4. Узкие последовательные проверки после RAM/disk/pressure preflight; полные Jest/TypeScript/Android/browser E2E только GitHub/допустимый worker. Draft PR при итерациях; не считать skipped gates успешными. Установка и native приёмка нового APK после окончания Time window. Не выдавать программную проверку за физический150м check-in.

Точка продолжения: причины и регрессии ещё исследуются, новых исправлений/публикаций нет. Последнее действие — созданы отдельные чистые ветки от актуальных main. Следующее — версия APK и очередь GPS-утверждения.


## 2026-10-24T08:13:06.038506+00:00 — версия APK и короткая горизонтальная шапка подготовлены

- Подтверждён старый literal3.11.4+61 во всех API/push/Sentry потребителях. Новый профиль читает native package/version/build через уже установленный react-native-device-info; проверяет именно com.mtmobileapp, формат и положительный Android versionCode. Недоступная/чужая identity становится unknown, а не версией старого APK. Токены, tenant, device и права не менялись; на сервере этот заголовок — диагностический claim, не замена server authority. Time в работающем1042 не менялся.
- Настоящий RED:9 новых cases получили старый3.11.4+61 вместо native значения/unknown. После исправления3suites/105tests PASS; дополнительно push и build-guard3suites/30PASS. Устаревший pre-build guard требовал ручного JS versionCode, который не мог совпасть и с local99, и с CI. Он теперь сохраняет package/namespace/Gradle version/signing/exclusions и проверяет привязку native getter;4 исполняемых negative/positive CLI tests проверяют drift/другой пакет/возврат literal.
- По исходному landscape PNG проверена высокая колонка bell/sync/refresh. В short landscape(height<560,width>height) включена существующая компактная компоновка: статус слева, refresh+bell справа в одной строке под приветствием, меньший нижний отступ. Все элементы/подписи/действия сохранены, обычные портрет и высокий планшет не затронуты. Использованы layout+impeccable и существующий .impeccable.md. Native просмотр нового результата NOT RUN до завершения Time v11.
- Подготовлена версия3.11.54 согласованно в package.json/lock/Gradle. Первоначальная команда bump имела неверный cwd и ничего не изменила; затем выполнена корректно. Случайное JSON unicode-экранирование emoji в lock исправлено; dependency graph не менялся.
- После version/layout текущие9suites/178tests PASS2.581s, release-profile CLI PASS3.11.54. Линтер исходного main Today отдельно подтвердил2 старые exhaustive-deps errors; в затронутом callback явно выделен тот же стабильный reload, удалена неиспользуемая memo dependency. Теперь targetedlint0errors/7 прежнихwarnings. Полные Jest/TS/Android локально NOT RUN по host contract; следующий этап — GitHub CI/signed candidate.
- GPS review: два новых isolated real-Leaflet render cases PASS на неизменённом server UI: удаление одной из двух карт и последней карты с parent refresh/ожиданием таймера. Это NO_REPRODUCTION, не исправление исходной ошибки. Отдельная bounded browser probe с глобальным запретом настоящих writes отказала до виртуального approve: RF_SIMULATED_MAPS_NOT_READY. Исходныйv1 сохранён; v2 дополнительно сохраняет page/errors/interception на отказе. Production решений/запросов/визитов не повторяли.
