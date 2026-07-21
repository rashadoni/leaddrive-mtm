# LeadDrive MTM — план до 100% parity

Опорный трекер до полной функциональной близости к 18 экранам SwissMed.
Критерий «полностью» — `swissmed-parity-register.md` (роли/RBAC, workflow,
адаптив, офлайн где нужно, audit, acceptance-сценарий). Текущий срез —
`parity-status.md`. Детальные фармацевтические требования (врачи, клиники,
назначения, KOL/скоринг, Target/MOI, бренд-потенциал, промо и планирование)
зафиксированы в `mtm-swissmed-parity-gaps.md`.

**Статус на 2026-07-19:** 0 полностью · 13 частично · 5 отсутствует.

**Легенда исполнителя:**
`[код]` — автономно кодом (mobile PR) ·
`[сервер]` — leaddrive-v2 PR → merge → автодеплой ·
`[гейт]` — внешний гейт (ключи / подпись / физ-устройства / acceptance) — **за владельцем** ·
`[решение]` — нужно продуктовое решение владельца перед стартом.

---

## A. Отсутствующие экраны (5) — построить с нуля

- [ ] **SWM-02 Bulk transfer** — мультивыбор, preview, transfer, audit UI. `[код]` `[сервер]` transfer-эндпоинт + audit. `[решение]` web-first vs mobile.
- [ ] **SWM-08 Плотная таблица + saved views** — data-grid, выбор колонок, серверная пагинация, экспорт, saved views. `[код]` `[сервер]` pagination/saved-views. `[решение]` web-first vs mobile.
- [ ] **SWM-09 Промо / баллы / approvals** — кампании, продукт/бренд, plan/fact, баллы, evidence, workflow. `[код]` `[сервер]` промо/commitment-контракты + approve-мутации.
- [ ] **SWM-16 Visit planning** — создание/публикация плана, фильтры кандидатов, план на уровне контактов. `[код]` `[сервер]` plan-create/publish.
- [ ] **SWM-18 Матрица контакт × дата** — контакты × даты, sticky-колонки, bulk-валидация, publish (tablet). `[код]` `[сервер]` plan-matrix.

## B. Довести «частично» (13) → «полностью»

- [ ] **SWM-01 Каталог организаций** — полная схема, гео/классификация-фильтры, статус владения, bulk, dense table. `[код]`
- [ ] **SWM-03 Карточка контакта** — редактирование/запрос, MOI/Target/психотип, история визитов контакта, полная схема. `[код]` `[сервер]` change-request/edit.
- [ ] **SWM-04 Профиль врача / потенциал** — разбивка по брендам с именами, MOI/Target/психотип, drill-down формул. `[код]` `[сервер]` brand-names в field-potential.
- [ ] **SWM-05 Мои контакты** — контекст визитов, фильтры, saved views. `[код]`
- [ ] **SWM-06 Детали организации** — полный tab-набор, отделы, персонал, отгрузки, редактирование. `[код]` `[сервер]` доп. поля.
- [ ] **SWM-07 Мои организации** — SwissMed-фильтры, last-visit/coverage, saved views, map/list toggle. `[код]` (+ карта → гейт).
- [ ] **SWM-10 GPS history** — карта, детекция стопов, фильтры по сотруднику/дате, replay. `[код]` `[гейт]` нативная карта.
- [ ] **SWM-11 Replay маршрута** — in-app карта, линия факт-маршрута, дневной replay, plan-vs-fact. `[код]` `[гейт]` нативная карта.
- [ ] **SWM-12 Live team map** — живая карта, маркеры, кластеризация, last-seen, real-time API. `[код]` `[сервер]` real-time `[гейт]` карта.
- [ ] **SWM-13 KPI дашборд** — подключить `/mobile/kpi`, server-period, формулы, графики, drill-down. `[код]` `[решение]` семантика периода (today vs week/month — блокер).
- [ ] **SWM-14 Задачи** — detail/edit, recurrence, файлы, progress, review, timeline. `[код]` `[сервер]` file-upload/review.
- [ ] **SWM-15 Home dashboard** — реальные Manager-значения, coverage drill-down, cancellation-очередь, key message. `[код]` (после KPI).
- [ ] **SWM-17 Недельный календарь** — day-column layout, 1/5/7-дневный, plan-vs-fact, Manager-селектор, офлайн-кэш. `[код]`

## C. Серверная работа (leaddrive-v2, автодеплой) — `[сервер]`

- [x] approve/reject эндпоинты (Manager approvals → рабочий workflow) — **сделано, на проде**: HRM (mobile #32), route-change + customer decision mobile-доступны (сервер leaddrive-v2 #459, mobile #33). Все три очереди approvals actionable.
- [ ] plan create/publish + acknowledgement/change-request (SWM-16/18).
- [ ] bulk transfer API + audit (SWM-02).
- [ ] promotion/points/commitment контракты + actions (SWM-09).
- [ ] dense table server pagination + saved views (SWM-08).
- [ ] task files/review, contact/org change-request/edit.
- [x] contacts entity в sync-pull (офлайн-контакты) — **сделано, на проде (#444)**.

## D. Внешние гейты (за владельцем) — `[гейт]`

- [ ] **Google Maps API key** (Android) — разблокирует карту.
- [ ] `react-native-maps` + карта маршрута/replay/live-map — после key, проверка рендера на устройстве.
- [ ] **Production-signed APK/AAB** (ключи подписи) + раскатка на устройства.
- [ ] Физические Android-планшеты и смартфоны для acceptance.
- [ ] Acceptance-сценарий по каждому из 18 SWM (реестр требует для «полностью»).

## E. Продуктовые решения (нужен выбор владельца) — `[решение]`

- [ ] KPI: период дашборда — today (текущее) vs week/month (контракт). Блокирует SWM-13/15.
- [ ] Check-in: durable офлайн — оптимистичный + geofence-conflict UX (меняет флоу).
- [ ] SWM-02/08: web-first (Manager/Admin) vs полноценно на мобиле.

---

## Рекомендуемый порядок (чистый код первым, гейты параллельно владельцем)

1. ✅ **DONE** — `[сервер]` approve/reject → `[код]` рабочий Manager approvals workflow (HRM #32 · route-change/customer сервер #459 + mobile #33, на проде).
2. `[код]` SWM-14 полные задачи (detail/edit/recurrence) + `[сервер]` file/review. ← **текущий**
3. `[решение+код]` KPI: решить период → подключить `/mobile/kpi` + графики (SWM-13/15).
4. `[сервер+код]` SWM-16 visit planning → SWM-18 матрица.
5. `[сервер+код]` SWM-09 промо/баллы/approvals.
6. `[код]` добить detail-карточки (edit, фильтры, saved views, история) — SWM-01/03/04/05/06/07.
7. `[гейт+код]` карта (после Google Maps key) — SWM-10/11/12.
8. `[сервер+код]` SWM-02 bulk, SWM-08 dense table.
9. `[гейт]` prod-signed раскатка + acceptance-прогон по 18 экранам → отметить «полностью».

**Оценка:** пункты 1–8 (чистый код + сервер) ≈ 20–30 PR, несколько сессий.
Пункт 9 и карта — внешние гейты владельца.
