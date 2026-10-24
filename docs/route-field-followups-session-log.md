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


## 2026-10-24T08:16:20.400634+00:00 — опубликован draft PR201, реальная веб-сессия восстановлена отдельно от телефона

- Runtime checkpoint5d0ef98 опубликован в origin/codex/route-field-followups. Создан и прикреплён https://github.com/rashadoni/leaddrive-mtm/pull/201 (draft). Полные hosted gates и подписанный APK ожидаются; merge/public release/install пока не выполнялись. После финального узкого изменения hook dependency/бампа дополнительно4suites/33tests PASS, в том числе return-to-workday/provenance/release-profile.
- Browser probe v2 сохранила реальную причину preflight: страница /login,0карт,0виртуальных decisions,0runtime exceptions/0write requests. Это истёкшая веб-сессия менеджера, не воспроизведение GPS render bug. Оба первоначальных refusals сохранены. Нормальным credentials flow восстановлена ровно прежняя роль manager/компания в новом приватном cookie jar; исходный jar и вход на телефоне не трогались, credentials не выводились. V3 использует эту сессию и global write interception; результат ещё ожидается.


## 2026-10-24T08:36:51.137624+00:00 — полный app CI зелёный; порядок последующего выпуска

- PR201 head5d0ef98: actualCI40077225306/jobs120823119557 SUCCESS. Логи подтверждают275suites/2447PASS+1TODO и выполненный TypeScript. Android40077225284/build801 ещё в Gradle при последнем чтении; package/signature/artifact/upload пока не объявляются PASS. Это candidate до интеграции с ещё не merged TimePR196.
- Порядок без подмены принятого Time1042: дождаться finalv11/release-acceptance и закончить TimePR196/его отдельный выпуск; затем включить актуальный main с Time в RF201 обычным merge, сохранить оба applicationId/Time1.0.0/Field3.11.54 и пройти новые exact-head CI/build/native проверки RF. Нельзя выдать текущий801 за окончательный post-integration APK. Это source preparation, новых установок в суточном окне нет.
- GPS render root теперь воспроизведён в browser и настоящем Leaflet regression; исправление подготовлено отдельно в crm-route-field-gps-review/b00fe90d6. Полное описание: /mnt/HC_Volume_106454338/codex-alt-data/worktrees/crm-route-field-gps-review/docs/route-field-gps-review-session-log.md. Production backend64356065f остаётся прежним до завершения Time window.


## 2026-10-24T08:54:57.182272+00:00 — проверенный QA1801 и подготовка единого final mobile source

- QA1801 verification PASS: artifact12554115912, run40077225284/job120823092981. Source5d0ef98c71e441f65791c61b97d6bb0c64993a42 и фактический checkout7db63b546834a94e7e25533678a9983f2a2c2f30 имеют одинаковые app/build trees. ZIPsha5bdc6d8695ad619f8ccb7273680ac757db960de0bf161c3a520e9d996cddd9f9 совпал с GitHubAPI digest; APKsha796be54bf3bd11cd3b7b7f12ce05bea39746bc9158ee77d8422debf886c7eb81 совпал с archive/checksum/hostedlog. Пакетcom.mtmobileapp/version3.11.54/code1801/ARM64, hosted pinned apksigner gatePASS, AABdigest также сверена. Публикация PR APK SKIPPED штатно, установки нет. Proof: /mnt/HC_Volume_106454338/codex-alt-data/tmp/route-field-followups-20261024/qa1801/verification-sanitized.json.
- Порядок предыдущего раздела уточнён и superseded: отдельный merge TimePR196 первым автоматически запустил бы промежуточный Field release без последних follow-ups. Вместо этого готовим одну финальную мобильную ветку RF201, включающую собственные Time commits и последние Field corrections. Репозиторий по-прежнему собирает ДВА разных APK/идентичности; никакой установки во время v11. Только RF worktree принимает ordinary merge Timebranch, исходный Time worktree/controller/phone остаются нетронутыми. После настоящего TimePASS и native проверки окончательного интегрированного Field candidate — один reviewed main merge/Field release и отдельная публикация точного протестированного Time1042. TimePR196 остаётся связанным источником/историей; коммиты сохраняются без squash/force.
- Нужны новые exact-head full CI/Android для интегрированного source; прежний275/2447 и1801 не выдаются за новый post-integration PASS. Штатные versionName3.11.54 и conditional Time1.0.0 сохраняются, новая Time APK не заменяет1042.
