# MTM parity — быстрый статус (на 2026-07-22)

Быстрая справка «что частично / что отсутствует» по 18 экранам SwissMed.
Источник истины и полные критерии «есть/нет» — `swissmed-parity-register.md` (v0.4).

**Итог: 1 полностью · 14 частично · 3 отсутствует.**

## Полностью (1)

- **SWM-02 Bulk transfer** — Manager/Admin выбирает текущего владельца и контакты,
  получает authoritative preview конфликтов и выполняет atomic/idempotent
  effective-dated перенос с audit. Manager runtime подтверждён на Android-планшете.

## Частично (14) — есть ✅ / осталось ❌

- **SWM-01 Каталог организаций** — ✅ поиск, server pagination, география/классификация,
  статус владения, saved views, configurable columns, bulk assignment и полный
  agent offline scope · ❌ отделения/персонал/файлы и управляемая форма полной карточки (GAP-009).
- **SWM-03 Карточка контакта** — ✅ полные личные/профессиональные поля, все каналы
  связи и адрес, effective-dated места работы, offline snapshot, direct edit для
  Manager/Admin, review-заявки Agent, duplicate mastering, consent/preference,
  source и audit history · ❌ MOI/Target/психотип, per-brand раскрытие и единый
  timeline визитов/задач/промо/файлов закрываются GAP-004…006.
- **SWM-04 Профиль врача / потенциал** — ✅ агрегат потенциал/покрытие/% на карточках · ❌ разбивка по брендам с именами, MOI/Target/психотип, drill-down формул.
- **SWM-05 Мои контакты** — ✅ список контактов (поиск, офлайн-кэш) · ❌ контекст визитов, фильтры, saved views.
- **SWM-06 Детали организации** — ✅ карточка (реквизиты, контакты, история визитов, потенциал) · ❌ полный tab-набор, отделы, персонал, отгрузки, редактирование.
- **SWM-07 Мои организации** — ✅ SwissMed-фильтры, saved views, phone cards,
  tablet list/detail, ownership и offline scope · ❌ last-visit/coverage и map/list toggle.
- **SWM-08 Плотная таблица + saved views** — ✅ серверная пагинация, настраиваемые
  колонки, сохранённые представления и tablet master/detail · ❌ экспорт и отдельный
  desktop-grade data-grid остаются вне текущего mobile slice.
- **SWM-10 GPS history** — ✅ фоновый GPS, heartbeat, `getLocationHistory()` · ❌ экран истории, карта, фильтры, детекция стопов, replay.
- **SWM-11 Replay маршрута** — ✅ маршрут, статусы точек, дистанции, внешняя навигация, офлайн-кэш · ❌ in-app карта, линия факт-маршрута, дневной replay, plan-vs-fact.
- **SWM-12 Live team map** — ✅ Manager workspace, снимки локаций, external map links · ❌ живая карта, маркеры, кластеризация, last-seen, real-time API.
- **SWM-13 KPI дашборд** — ✅ виджеты, локальные агрегаты visits/tasks/photos · ❌ подключение `/mobile/kpi`, server-period, формулы, графики, drill-down.
- **SWM-14 Задачи** — ✅ список, статусы, старт/завершение, durable мутации + офлайн, **detail-экран + timeline жизненного цикла**, **Manager-редактирование** (title/description/priority, gated TEAM_DECIDE + scope), **recurrence-авторинг** (rule/interval; completion спавнит следующую), **дублирование** (Manager, PENDING-копия с провенансом), **progress %** (own-task отчёт исполнителя, бар + степпер; колонка `MtmTask.progress`), **review/return** (Manager возвращает completed→IN_PROGRESS с причиной, result сохраняется, баннер; колонка `returnReason`), **dueDate-редактирование** (относительный quick-set: Сегодня/Завтра/+3д/+нед/+мес/Очистить — без native date-picker), **bulk-переназначение** (мульти-выбор long-press + agent-picker; `POST /mobile/tasks/bulk-reassign`, TEAM_DECIDE + scope), **файлы/evidence — чтение** (секция «Файлы» из `GET /mobile/tasks/:id/documents`) · ❌ точная дата dueDate/recurrenceUntil + загрузка файлов/камера — **device-gated** (native date-picker / camera capture, проверка на физ-устройстве).
- **SWM-15 Home dashboard** — ✅ настраиваемая главная 1–6 виджетов (телефон/планшет, порядок, reset) · ❌ реальные Manager-значения, coverage drill-down, cancellation-очередь.
- **SWM-17 Недельный календарь** — ✅ вкладка «Неделя» (сводка + агенда, навигация недель, «Сегодня») · ❌ 1/5/7-дневный переключатель, day-column, plan-vs-fact, Manager-селектор, офлайн-кэш.

## Отсутствует (3)

- **SWM-09 Промо / баллы / approvals** — кампании, продукт/бренд, plan/fact, баллы, evidence, workflow согласования.
- **SWM-16 Visit planning** — создание/публикация планов визитов, фильтры кандидатов, планирование на уровне контактов.
- **SWM-18 Матрица контакт × дата** — контакты × даты, sticky-колонки, bulk-валидация, publish.

## План — что дальше

Текущий production-инкремент — **GAP-003: полная карточка и форма контакта**.
После его release-gate следующий — **GAP-004: фармацевтический скоринг врача**;
далее GAP-005…GAP-016 выполняются последовательно с тем же gate:
tests/build → PR/CI → merge → production smoke → Android runtime обеих ролей.
