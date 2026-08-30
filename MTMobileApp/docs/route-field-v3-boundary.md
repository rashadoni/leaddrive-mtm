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
- Route Field может получить от bootstrap только серверное read-only состояние
  смены, если оно необходимо для объяснения блокировки визита.
- Route Field не создаёт переходы рабочего дня, HRM-заявки или HRM outbox.
- Менеджерское планирование и approvals остаются web-first; Route Field
  рассчитан на полевого исполнителя.

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
2. Для этого APK обязательна `manifest.modules.routeField.enabled === true`.
3. `commercial` всегда выключен; `workforceHrm` не делает Route Field
   HRM-клиентом.
4. Отключённые streams не запрашиваются. Сервер проверяет entitlement и
   permission на каждом API-вызове независимо от UI.
5. v2 cursors непрозрачны, device-bound и применяются только после
   локального завершения страницы. `409 resnapshot` удаляет только cache и
   cursor соответствующего stream, никогда не outbox/media.

## Нерешённые release-gates

- production signing identity и distribution channel нового package ID;
- physical Android: offline → online, process death, scope loss и два
  устройства;
- cohort-only v2 read comparison и S6 staging/chaos evidence.

Ни один из этих пунктов не считается выполненным только по исходному коду.
