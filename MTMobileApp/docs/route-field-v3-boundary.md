# LeadDrive Route Field v3 — граница отдельного APK

**Статус:** v3.0.4 выпускается через signed GitHub prerelease; этот документ
фиксирует его границы и release-инварианты.

## Что это

`LeadDrive Route Field` — новый Android APK для полевого выполнения маршрута:
маршруты, точки, визиты, полевые задачи, назначенные организации/контакты,
фото-доказательства и навигация. Он использует только LeadDrive Field BFF.

Это не LeadShelf и не вариация LeadShelf. Коммерческий каталог, заказы,
полки, planogram и их sync не входят в этот APK. Они остаются отдельным
продуктом и не могут задерживать полевые операции.

## Граница с HRM

- `workforce-hrm` — отдельный модуль и отдельный будущий APK.
- Route Field не читает и не сверяет HRM-смену, не создаёт HRM-заявки или HRM
  outbox. Его собственная минимальная field-сессия (`MtmAgentWorkday`) нужна
  только для порядка «начать день → начать маршрут → выполнить визит».
- Менеджерское планирование и approvals остаются web-first; Route Field
  рассчитан на полевого исполнителя.
- GPS запускается только после подтверждённой сервером field-сессии, а не по
  HRM-смене или login. Для непрерывного трекинга Android использует location
  foreground service с видимым системным уведомлением; `ACCESS_BACKGROUND_LOCATION`
  не запрашивается автоматически.

## Безопасный переход со старого MTM APK

- Route Field сохраняет shipping package ID `com.mtmobileapp` и существующую
  release-подпись. Это обычное обновление установленного APK, а не второй
  параллельный клиент.
- Существующие token, cache, media и v1 outbox остаются в Android sandbox и
  не копируются, не очищаются и не переписываются этой работой. Новые v3
  manifest/cursor keys получают отдельный префикс рядом с ними.
- Отдельный package ID потребуется будущему HRM APK; его нельзя занять или
  выбрать за Route Field без отдельного release/signing решения.
- До physical-device acceptance старый APK остаётся рабочим v1-клиентом.
- Route Field сохраняет v1 mutation path. Sync v2 подключается только к
  server-enrolled device cohort и только для read-only streams. Два
  авторитетных пути записи не запускаются.

## Контракт с сервером

1. `/api/v1/mtm/mobile/bootstrap` возвращает server-authoritative `manifest`.
2. Для этого APK обязательны `manifest.modules.routeField.enabled === true`,
   principal с точной ролью `AGENT` и capability `FIELD_EXECUTE`. Сервер может
   выдать route permission менеджеру для web/другого клиента, но это не
   открывает Route Field APK. Если manifest присутствует, но некорректен,
   связан с другим tenant/principal или не проходит эту проверку, shell и
   detail-stack остаются закрыты. Для старого сервера без manifest допустим
   только узкий v1 fallback: одновременно legacy `modules.routes.enabled` и
   `FIELD_EXECUTE`.
3. `commercial` всегда выключен; `workforceHrm` не делает Route Field
   HRM-клиентом.
4. Переданные запросы несут стабильный непрозрачный per-installation
   `x-field-device-id` и версию APK; id не выводится из agent/tenant и не
   является credential. При временной ошибке хранилища v1 продолжает работать
   без cohort header, а не создаёт новый id на каждый запрос.
5. Отключённые streams не запрашиваются. Сервер проверяет entitlement и
   permission на каждом API-вызове независимо от UI.
6. v2 routes включается только тогда, когда **текущий** manifest одновременно
   advertises `protocol.preferred: 2`, `syncV2.routes: true` и непустой
   `routesEpoch`. Это shadow-read pilot: v1 продолжает быть источником
   текущего UI и единственным путём mutation/outbox. V2 хранит отдельный key
   `@leaddrive_route_field_v3:sync-v2:routes:<tenant>:<agent>` и никогда не
   меняет v1 cache, outbox или media.
7. v2 cursors непрозрачны и device-bound. Snapshot pages сначала собираются в
   отдельный staged state; committed cursor появляется только после
   `complete: true`. Delta page atomically сохраняет merge с tombstones и
   следующий cursor в одном AsyncStorage значении. За один supervisor pass
   запрашивается не более трёх страниц, чтобы один tenant/device не занимал
   очередь.
8. `409`/invalid cursor удаляют только v2 routes cache/cursor и требуют
   resnapshot; outbox/media/v1 cache не очищаются. `413` повторяет тот же
   opaque cursor с меньшим page size. `429`/`503` получают отдельный
   stream-local backoff и не блокируют v1 push, v1 pull или media. При точном
   cohort `403` v2 cache удаляется, v1 остаётся рабочим, а v2 не опрашивается
   повторно, пока свежий manifest не принесёт новый epoch.

## Доступная поверхность APK

- Только вкладки полевого исполнителя: Today, Calendar, Route, Tasks и More.
  При отзыве admission navigator пересоздаётся, поэтому сохранённая detail
  карточка не остаётся открытой поверх нового tenant/capability состояния.
- Calendar показывает только собственные маршрутные данные — без командного
  расписания и `getTeamSchedule`.
- Задачи не дают переназначать, копировать, редактировать или возвращать
  чужие задачи. Исполнитель может менять только разрешённый статус своей
  задачи и отмечать прогресс. Статусная запись по-прежнему идёт через
  существующий идемпотентный v1 outbox; прогресс задаётся абсолютным значением
  и сервер проверяет, что задача принадлежит исполнителю.
- Карточка контакта — read-only маршрутная: базовые данные, места работы и
  связь. Brand Potential, assessment/scoring и коммерческие mutations не
  монтируются. Карточки организации и визита также не показывают commercial
  potential.
- Самостоятельное планирование маршрута разрешается только server policy
  `canPlanOwnRoutes`; текущая реализация использует legacy-named component в
  строго `self` режиме. Командный путь в нём не регистрируется navigator’ом;
  выделение self-only реализации остаётся отдельным source-size cleanup, а не
  основанием расширять права этого APK.

## Проверка нативной границы

`react-native-background-actions` обслуживает только активную подтверждённую
field-сессию. Для target SDK 36 app manifest явно объявляет его location
foreground service и разрешения `FOREGROUND_SERVICE` /
`FOREGROUND_SERVICE_LOCATION`; runtime не делает автоматический запрос
`ACCESS_BACKGROUND_LOCATION`. Удалять автолинкованную зависимость без native
build evidence было бы небезопасно.

## Нерешённые release-gates

- production signing identity и distribution channel обновления существующего
  Route Field package ID. `npm run verify:release-profile` проверяет, что
  package ID и версия согласованы между profile, Gradle и package.json;
  `build-local.sh` затем откажется собирать release без
  `android/app/mtm-release.keystore`. Debug-signing fallback не является
  допустимым update APK и не используется;
- physical Android: offline → online, process death, scope loss и два
  устройства;
- cohort-only v2 read comparison и S6 staging/chaos evidence.

Ни один из этих пунктов не считается выполненным только по исходному коду.
