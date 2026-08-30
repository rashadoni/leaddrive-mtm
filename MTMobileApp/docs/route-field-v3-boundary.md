# LeadDrive Route Field v3 — граница отдельного APK

**Статус:** implementation baseline; APK пока не собран и не распространялся.

## Что это

`LeadDrive Route Field` — новый Android APK для полевого выполнения маршрута:
маршруты, точки, визиты, полевые задачи, назначенные организации/контакты,
фото-доказательства и навигация. Он использует только LeadDrive Field BFF.

Это не LeadShelf и не вариация LeadShelf. Коммерческий каталог, заказы,
полки, planogram и их sync не входят в этот APK. Они остаются отдельным
продуктом и не могут задерживать полевые операции.

## Граница с HRM

- `workforce-hrm` — отдельный модуль и отдельный будущий APK.
- Route Field не читает и не сверяет HRM-смену, не создаёт переходы рабочего
  дня, HRM-заявки или HRM outbox.
- Менеджерское планирование и approvals остаются web-first; Route Field
  рассчитан на полевого исполнителя.
- Наследованный background GPS, включавшийся по HRM-смене, удалён из runtime и
  Android manifest. До отдельного server-first контракта маршрута/визита этот
  APK оставляет только явные foreground-геоданные для полевых действий.

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
6. v2 cursors непрозрачны, device-bound и применяются только после
   локального завершения страницы. `409 resnapshot` удаляет только cache и
   cursor соответствующего stream, никогда не outbox/media.

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

`react-native-background-actions` пока остаётся зависимостью до проверки
merged Android manifest на Mac/CI. Runtime уже останавливает унаследованное
tracking, а manifest не запрашивает background location и не регистрирует
background service. Удалять автолинкованную зависимость без native build
evidence было бы небезопасно.

## Нерешённые release-gates

- production signing identity и distribution channel обновления существующего
  Route Field package ID;
- physical Android: offline → online, process death, scope loss и два
  устройства;
- cohort-only v2 read comparison и S6 staging/chaos evidence.

Ни один из этих пунктов не считается выполненным только по исходному коду.
