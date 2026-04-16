# MTM — Атомарные тикеты для доведения продукта до продакшна

> Каждый тикет = 1 действие, 1 файл/модуль, 1 проверяемый результат.
> После выполнения каждого тикета — чеклист самопроверки.

---

## ФАЗА 1: Починить сломанные API (Backend)

### TICKET-001: Исправить customers.router.ts — field mismatches
**Файл:** `backend/src/modules/customers/customers.router.ts`
**Проблема:** Prisma запросы используют `latitude`/`longitude`, а в schema.prisma поля `lat`/`lng`
**Действия:**
- [ ] Строки 48-49: `latitude: true, longitude: true` → `lat: true, lng: true`
- [ ] Строки 86-87: то же самое в findUnique select
- [ ] Строки 115, 129-130: в body destructuring и create data `latitude→lat`, `longitude→lng`
- [ ] Строки 144, 153-154: в body destructuring и update data `latitude→lat`, `longitude→lng`
**Проверка:**
- [ ] `curl GET /api/customers` → 200, массив клиентов
- [ ] `curl GET /api/customers/:id` → 200, объект клиента
- [ ] Поля `lat`/`lng` присутствуют в ответе

---

### TICKET-002: Исправить routes.router.ts — field mismatches
**Файл:** `backend/src/modules/routes/routes.router.ts`
**Проблема:** `latitude/longitude` в Customer select, `order` вместо `orderIndex`, `plannedArrival` вместо `plannedTime`
**Действия:**
- [ ] Строки 99-100: Customer select `latitude→lat`, `longitude→lng`
- [ ] Строка 104: orderBy `order→orderIndex`
- [ ] Строка 136: create RoutePoint `order→orderIndex`
- [ ] Строка 137: create RoutePoint `plannedArrival→plannedTime`
- [ ] Строки 218, 230: update/orderBy `order→orderIndex`
**Проверка:**
- [ ] `curl GET /api/routes` → 200
- [ ] `curl GET /api/routes/:id` → 200 с points отсортированными по orderIndex

---

### TICKET-003: Исправить visits.router.ts — field mismatches
**Файл:** `backend/src/modules/visits/visits.router.ts`
**Проблема:** `routePoint` relation не существует, `routePointId` нет в модели, `durationMinutes` → `duration`
**Действия:**
- [ ] Строка 41: убрать `routePoint: true` из include (relation не существует)
- [ ] Строка 78: убрать `routePointId` из create data
- [ ] Строка 65: убрать `routePointId` из body destructuring
- [ ] Строка 110: `durationMinutes→duration` в update data
- [ ] Строки 149-157: `durationMinutes→duration` в aggregate query
**Проверка:**
- [ ] `curl GET /api/visits` → 200
- [ ] `curl POST /api/visits/check-in` → 201, создаёт визит
- [ ] `curl GET /api/visits/stats` → 200

---

### TICKET-004: Исправить photos.router.ts — field mismatches + schema migration
**Файл:** `backend/src/modules/photos/photos.router.ts` + `prisma/schema.prisma`
**Проблема:** Photo модель не имеет полей `description`, `metadata`, `customerId`, `approvedAt/By`, `rejectedAt/By/Reason`
**Решение:** Добавить недостающие поля в schema.prisma
**Действия:**
- [ ] В schema.prisma добавить к модели Photo:
  ```
  description   String?
  approvedAt    DateTime?
  approvedBy    String?
  rejectedAt    DateTime?
  rejectedBy    String?
  rejectionReason String?
  ```
- [ ] Строка 24: убрать `customerId` из where (нет в модели) — фильтровать через visit.customerId
- [ ] Строка 33: убрать `customer` из include (нет relation) — использовать `visit: { include: { customer: true } }`
- [ ] Строки 59, 71: убрать `customerId` и `metadata` из create data
**Проверка:**
- [ ] `prisma db push` — без ошибок
- [ ] `curl GET /api/photos` → 200
- [ ] `curl PUT /api/photos/:id/approve` → 200
- [ ] `curl PUT /api/photos/:id/reject` → 200

---

### TICKET-005: Исправить alerts.router.ts — field mismatches + schema migration
**Файл:** `backend/src/modules/alerts/alerts.router.ts` + `prisma/schema.prisma`
**Проблема:** `status` не существует, `userId` → `agentId`, нет `readAt`, `resolvedAt`, `resolvedBy`, `resolution`
**Решение:** Добавить недостающие поля в schema.prisma
**Действия:**
- [ ] В schema.prisma добавить к модели Alert:
  ```
  readAt        DateTime?
  resolvedAt    DateTime?
  resolvedBy    String?
  resolution    String?
  ```
- [ ] Строка 23: `status` фильтр → переписать на `isRead`/`isResolved` логику
- [ ] Строка 25: `userId→agentId` в where
- [ ] Строка 33: `user→agent` в include relation
- [ ] Строки 59-68: mark read → `isRead: true, readAt: new Date()`
- [ ] Строки 82-93: resolve → `isResolved: true, resolvedAt: new Date(), resolvedBy, resolution`
- [ ] Строки 122-132: mark all read → `isRead` вместо `status`, `readAt: new Date()`
**Проверка:**
- [ ] `prisma db push` — без ошибок
- [ ] `curl GET /api/alerts` → 200
- [ ] `curl PUT /api/alerts/:id/read` → 200
- [ ] `curl PUT /api/alerts/:id/resolve` → 200

---

### TICKET-006: Исправить reports.router.ts — field mismatches
**Файл:** `backend/src/modules/reports/reports.router.ts`
**Проблема:** `durationMinutes→duration`, `checkInLatitude→checkInLat`, `routePointId` не существует
**Действия:**
- [ ] Строки 122-123: `durationMinutes→duration` в aggregate
- [ ] Строка 175-181: убрать или переписать `routePointId` фильтр (поле не существует в Visit)
- [ ] Строка 214: `checkInLatitude→checkInLat`
- [ ] Строка 215: `checkOutLatitude→checkOutLat`
- [ ] Строки 238-248: `checkInLatitude→checkInLat`, `checkInLongitude→checkInLng`
**Проверка:**
- [ ] `curl GET /api/reports/route-execution` → 200
- [ ] `curl GET /api/reports/gps-tracking` → 200
- [ ] `curl GET /api/reports/performance` → 200 (уже работал, проверить что не сломали)

---

### TICKET-007: Исправить auth.router.ts — enum + token expiry
**Файл:** `backend/src/modules/auth/auth.router.ts`
**Проблема:** `role: 'USER'` не существует в enum; JWT expiry хардкод '24h' вместо env; login response неполный
**Действия:**
- [ ] Строка 33: `expiresIn: '24h'` → `expiresIn: process.env.JWT_EXPIRES_IN || '7d'`
- [ ] Строка 76: register `role: 'USER'` → `role: 'AGENT'` (дефолтная роль)
- [ ] Строка 84: то же в register
- [ ] Строки 38-45: login response добавить `phone`, `status`, `createdAt`, `updatedAt`
- [ ] Строка 112-117: /me response добавить `phone`, `createdAt`, `updatedAt`
**Проверка:**
- [ ] `curl POST /api/auth/login` → token с expiry 7d
- [ ] Response содержит user с полями phone, status, createdAt, updatedAt
- [ ] `curl POST /api/auth/register` → создаёт пользователя с role AGENT

---

### TICKET-008: Исправить users.router.ts — enum
**Файл:** `backend/src/modules/users/users.router.ts`
**Проблема:** `role: 'USER'` default в create
**Действия:**
- [ ] Найти `role: 'USER'` → заменить на `role: 'AGENT'`
**Проверка:**
- [ ] `curl POST /api/users` → создаёт юзера с role AGENT по умолчанию

---

### TICKET-009: Prisma migration — добавить недостающие поля
**Файл:** `backend/prisma/schema.prisma`
**Зависимости:** Нужно перед TICKET-004 и TICKET-005
**Действия:**
- [ ] Добавить в Photo: `description String?`, `approvedAt DateTime?`, `approvedBy String?`, `rejectedAt DateTime?`, `rejectedBy String?`, `rejectionReason String?`
- [ ] Добавить в Alert: `readAt DateTime?`, `resolvedAt DateTime?`, `resolvedBy String?`, `resolution String?`
- [ ] Запустить `npx prisma db push` на сервере
- [ ] Запустить `npx prisma generate`
**Проверка:**
- [ ] `prisma db push` — Success, no errors
- [ ] `prisma studio` — новые поля видны в таблицах

---

### TICKET-010: Деплой Фазы 1 на сервер + полный тест
**Зависимости:** TICKET-001 через TICKET-009
**Действия:**
- [ ] `rsync` обновлённого backend на сервер
- [ ] `npm ci` на сервере
- [ ] `npx prisma generate && npx prisma db push`
- [ ] `pm2 restart mtm-backend`
- [ ] Протестировать ВСЕ 18 эндпоинтов
**Проверка:**
- [ ] GET /api/customers → 200
- [ ] GET /api/visits → 200
- [ ] GET /api/photos → 200
- [ ] GET /api/alerts → 200
- [ ] GET /api/reports/route-execution → 200
- [ ] GET /api/reports/gps-tracking → 200
- [ ] Все остальные 12 эндпоинтов → 200
- [ ] 0 ошибок 500

---

## ФАЗА 2: Подключить админ-панель к реальным API

### TICKET-011: Users page — подключить к API
**Файл:** `admin-panel/src/app/(dashboard)/users/page.tsx`
**Действия:**
- [ ] Убрать массив `mockUsers`
- [ ] Добавить `useEffect` → `api.getUsers()` при загрузке
- [ ] useState для users, loading, pagination
- [ ] Привязать search/filter к API параметрам
- [ ] Create user modal → `api.createUser()`
- [ ] Edit → `api.updateUser()`
- [ ] Delete → `api.deleteUser()`
**Проверка:**
- [ ] Страница загружает реальных юзеров из БД
- [ ] Поиск работает через API
- [ ] CRUD операции сохраняются в БД

---

### TICKET-012: Customers page — подключить к API
**Файл:** `admin-panel/src/app/(dashboard)/customers/page.tsx`
**Действия:**
- [ ] Убрать `mockCustomers`
- [ ] `useEffect` → `api.getCustomers()` с pagination
- [ ] Search/filter через API params
- [ ] Create/Edit/Delete модалки → реальные API вызовы
**Проверка:**
- [ ] 8 seed клиентов отображаются
- [ ] Пагинация работает
- [ ] CRUD сохраняется

---

### TICKET-013: Customer detail page — подключить к API
**Файл:** `admin-panel/src/app/(dashboard)/customers/[id]/page.tsx`
**Действия:**
- [ ] Убрать `mockCustomers` объект
- [ ] `useEffect` → `api.getCustomer(id)` по URL param
- [ ] История визитов → `api.getVisits({customerId: id})`
- [ ] Убрать фейковый `monthlyTrend`
**Проверка:**
- [ ] Страница загружает реального клиента по ID
- [ ] Визиты отображаются из БД

---

### TICKET-014: Tasks page — подключить к API
**Файл:** `admin-panel/src/app/(dashboard)/tasks/page.tsx`
**Действия:**
- [ ] Убрать `mockTasks`
- [ ] `useEffect` → `api.getTasks()` с фильтрами
- [ ] Create task → `api.createTask()`
- [ ] Update status → `api.updateTaskStatus()`
- [ ] Delete → `api.deleteTask()`
**Проверка:**
- [ ] 4 seed задачи отображаются
- [ ] Фильтры по status/priority работают
- [ ] Изменение статуса сохраняется

---

### TICKET-015: Routes page — подключить к API
**Файл:** `admin-panel/src/app/(dashboard)/routes/page.tsx`
**Действия:**
- [ ] Убрать `mockAgents`, `mockTemplates`, `availableCustomers`
- [ ] Загружать маршруты из `api.getRoutes()`
- [ ] Загружать клиентов из `api.getCustomers()` для выбора
- [ ] Загружать агентов из `api.getUsers({role: 'AGENT'})`
- [ ] Create route → `api.createRoute()`
**Проверка:**
- [ ] 2 seed маршрута отображаются
- [ ] Создание нового маршрута сохраняется

---

### TICKET-016: Photos page — подключить к API
**Файл:** `admin-panel/src/app/(dashboard)/photos/page.tsx`
**Действия:**
- [ ] Убрать `mockPhotos`
- [ ] `useEffect` → `api.getPhotos()` с фильтрами
- [ ] Approve → `api.approvePhoto(id)`
- [ ] Reject → `api.rejectPhoto(id)`
**Проверка:**
- [ ] Фото загружаются из БД (если есть)
- [ ] Approve/Reject обновляют статус

---

### TICKET-017: Alerts page — подключить к API
**Файл:** `admin-panel/src/app/(dashboard)/alerts/page.tsx`
**Действия:**
- [ ] Убрать `mockAlerts`
- [ ] `useEffect` → `api.getAlerts()` с фильтрами
- [ ] Mark read → `api.markAlertRead(id)`
- [ ] Resolve → `api.resolveAlert(id)`
- [ ] Mark all read → `api.markAllAlertsRead()`
**Проверка:**
- [ ] 4 seed алерта отображаются
- [ ] Mark read/resolve работает

---

### TICKET-018: Activity page — подключить к API
**Файл:** `admin-panel/src/app/(dashboard)/activity/page.tsx`
**Действия:**
- [ ] Убрать `mockActivities`
- [ ] `useEffect` → `fetch('/api/recent-activities')` (endpoint уже работает)
- [ ] Auto-refresh каждые 30 секунд
**Проверка:**
- [ ] Реальные активности за 24 часа отображаются
- [ ] Обновляются автоматически

---

### TICKET-019: Dashboard — подключить к реальным данным
**Файл:** `admin-panel/src/app/(dashboard)/dashboard/page.tsx`
**Действия:**
- [ ] Убрать `mockStats`, `weeklyTrendData`, `agentPerformanceData`, `hourlyVisitsData`, `photoDistribution`
- [ ] KPI карточки: считать из `api.getVisitStats()` + tasks count + routes count
- [ ] Графики: `api.getDailyReport()` за последнюю неделю
- [ ] Список агентов: уже из realtime store (оставить)
**Проверка:**
- [ ] KPI показывают реальные числа
- [ ] Графики отражают реальные данные
- [ ] При 0 данных показывают 0, а не фейк

---

### TICKET-020: Agent detail page — подключить к API
**Файл:** `admin-panel/src/app/(dashboard)/agents/[id]/page.tsx`
**Действия:**
- [ ] Убрать `mockAgents` объект
- [ ] Загружать агента из `api.getUser(id)`
- [ ] GPS история из `api.getAgentLocations()` или raw SQL
- [ ] Визиты из `api.getVisits({agentId: id})`
- [ ] Убрать фейковый `weeklyPerformance`
**Проверка:**
- [ ] Реальный агент отображается по ID
- [ ] GPS точки из БД

---

### TICKET-021: Reports — подключить 6 страниц к API
**Файлы:** `admin-panel/src/app/(dashboard)/reports/*/page.tsx`
**Действия:**
- [ ] daily/page.tsx → `api.getDailyReport({startDate, endDate})`
- [ ] performance/page.tsx → `api.getPerformanceReport()`
- [ ] route-execution/page.tsx → `api.getRouteExecutionReport()`
- [ ] gps-tracking/page.tsx → `api.getGpsTrackingReport()`
- [ ] customer-visits/page.tsx → `api.getVisits()` с фильтрами
- [ ] photo-audit/page.tsx → `api.getPhotos()` с фильтрами
- [ ] В каждом убрать mock массивы
**Проверка:**
- [ ] Каждый отчёт загружает данные из API
- [ ] Date range picker фильтрует через API

---

### TICKET-022: Analytics + Leaderboard — подключить
**Файлы:** `analytics/page.tsx`, `leaderboard/page.tsx`
**Действия:**
- [ ] Analytics: считать из reports API + visits stats
- [ ] Leaderboard: считать рейтинг из visits completion + tasks done
- [ ] Убрать все mock массивы
**Проверка:**
- [ ] Графики отражают реальные данные
- [ ] Рейтинг агентов основан на реальных метриках

---

### TICKET-023: Audit page — подключить + новый эндпоинт
**Файлы:** `audit/page.tsx` + `backend/src/modules/audit/audit.router.ts` (новый)
**Действия:**
- [ ] Создать `audit.router.ts` с GET /api/audit-logs (читать из AuditLog модели)
- [ ] Подключить роутер в index.ts
- [ ] Убрать `mockAuditLogs` из фронта
- [ ] Загружать из `api.getAuditLogs()` с пагинацией и фильтрами
**Проверка:**
- [ ] GET /api/audit-logs → 200
- [ ] Страница показывает реальные логи

---

### TICKET-024: Деплой Фазы 2 — пересобрать и задеплоить фронтенд
**Зависимости:** TICKET-011 через TICKET-023
**Действия:**
- [ ] `cd admin-panel && npm run build`
- [ ] `rsync .next/standalone/ root@server:/opt/mtm/frontend/`
- [ ] `ssh root@server "pm2 restart mtm-frontend"`
**Проверка:**
- [ ] Все страницы загружают реальные данные
- [ ] Нет mock массивов в коде
- [ ] Console без ошибок

---

## ФАЗА 3: Подключить мобилку к реальным данным

### TICKET-025: VisitScreen — реальный GPS вместо хардкода
**Файл:** `MTMobileApp/src/screens/visit/VisitScreen.tsx`
**Действия:**
- [ ] Строки 39-41: заменить `40.3793 + Math.random()` на `locationService.getLastLocation()`
- [ ] Строки 72-73: то же для check-out
- [ ] Добавить import `locationService`
- [ ] Обработать случай когда GPS ещё не получен
**Проверка:**
- [ ] Check-in отправляет реальные координаты
- [ ] Check-out отправляет реальные координаты
- [ ] При отсутствии GPS — показывает предупреждение

---

### TICKET-026: CameraScreen — реальный GPS в watermark
**Файл:** `MTMobileApp/src/screens/photos/CameraScreen.tsx`
**Действия:**
- [ ] Строка 144: заменить хардкод `GPS: 40.3793, 49.8310` на реальные координаты
- [ ] Получать из `locationService.getLastLocation()`
- [ ] Обновлять watermark при изменении позиции
**Проверка:**
- [ ] Watermark показывает реальные GPS координаты
- [ ] Координаты обновляются

---

### TICKET-027: LocationTracker — реальный battery level
**Файл:** `MTMobileApp/src/services/location-tracker.ts`
**Действия:**
- [ ] Строка 96: заменить хардкод `100` на реальный battery
- [ ] Добавить `import DeviceInfo from 'react-native-device-info'`
- [ ] `const battery = Math.round((await DeviceInfo.getBatteryLevel()) * 100)`
**Проверка:**
- [ ] В WebSocket отправляется реальный уровень батареи
- [ ] На карте админки battery показывает правильное значение

---

### TICKET-028: MapScreen — загрузка маршрута из API
**Файл:** `MTMobileApp/src/screens/route/MapScreen.tsx`
**Действия:**
- [ ] Убрать `mockPoints` (строки 19-25)
- [ ] Получать route ID через navigation params
- [ ] Загружать из `api.getRoute(routeId)`
- [ ] Маппить RoutePoint в формат для карты
- [ ] Реальная GPS позиция пользователя (уже через locationService)
**Проверка:**
- [ ] Карта показывает реальные точки маршрута из БД
- [ ] Позиция пользователя реальная

---

### TICKET-029: RouteScreen — убрать fallback mock
**Файл:** `MTMobileApp/src/screens/route/RouteScreen.tsx`
**Действия:**
- [ ] Строки 31-40: в catch вместо mock данных → показать error message
- [ ] Добавить retry button при ошибке
- [ ] Показать пустой список если маршрутов нет
**Проверка:**
- [ ] При ошибке API — показывает сообщение, не фейковые данные
- [ ] При пустом маршруте — "Маршрут не назначен"

---

### TICKET-030: TasksScreen — убрать fallback mock
**Файл:** `MTMobileApp/src/screens/tasks/TasksScreen.tsx`
**Действия:**
- [ ] Убрать `mockTasks` (строки 8-13)
- [ ] В catch → показать error toast
- [ ] При пустых задачах → "Tapşırıq yoxdur"
**Проверка:**
- [ ] Задачи загружаются из API
- [ ] При ошибке — error message
- [ ] Смена статуса сохраняется на сервере

---

### TICKET-031: OrderScreen — подключить к 1C/inventory API
**Файл:** `MTMobileApp/src/screens/visit/OrderScreen.tsx`
**Действия:**
- [ ] Убрать `mockProducts` (строки 21-32)
- [ ] Загружать продукты из `api.getInventoryBalances()` или нового эндпоинта
- [ ] Submit order → новый API `POST /api/orders`
**Проверка:**
- [ ] Продукты загружаются из БД/1C
- [ ] Заказ сохраняется на сервере

---

### TICKET-032: StockScreen — подключить к inventory API
**Файл:** `MTMobileApp/src/screens/visit/StockScreen.tsx`
**Действия:**
- [ ] Убрать `mockStockItems` (строки 16-23)
- [ ] Загружать из `api.getInventoryBalances()` для конкретного клиента
- [ ] Submit → `POST /api/stock-checks` (новый эндпоинт)
**Проверка:**
- [ ] Реальные товары из 1C
- [ ] Результат проверки сохраняется

---

### TICKET-033: OrderHistoryScreen — подключить к API
**Файл:** `MTMobileApp/src/screens/route/OrderHistoryScreen.tsx`
**Действия:**
- [ ] Убрать `mockOrders` (строки 16-25)
- [ ] Загружать из нового `api.getOrders()` или visits с деталями
- [ ] Фильтры по статусу через API
**Проверка:**
- [ ] Реальная история заказов
- [ ] Фильтры работают

---

### TICKET-034: NotesScreen — отправка на сервер
**Файл:** `MTMobileApp/src/screens/visit/NotesScreen.tsx`
**Действия:**
- [ ] Помимо AsyncStorage → отправлять на сервер через API
- [ ] Использовать `PUT /api/visits/:id` с notes полем или новый эндпоинт
- [ ] Загружать предыдущие заметки из API
**Проверка:**
- [ ] Заметки сохраняются на сервере
- [ ] При перезапуске приложения — заметки загружаются из API

---

### TICKET-035: ProfileScreen — реальная статистика
**Файл:** `MTMobileApp/src/screens/profile/ProfileScreen.tsx`
**Действия:**
- [ ] Строки 240-252: убрать хардкод 145/92%/4.8
- [ ] Загружать из `api.getMe()` + visits count + performance
- [ ] Считать: visits за месяц, execution rate, средний рейтинг
**Проверка:**
- [ ] Статистика отражает реальные данные агента
- [ ] При 0 визитов показывает 0

---

### TICKET-036: api.ts — убрать placeholder sendLocation
**Файл:** `MTMobileApp/src/services/api.ts`
**Действия:**
- [ ] Строка 101: убрать placeholder `sendLocation()` — location идёт через WebSocket
- [ ] Или переписать как реальный REST fallback
**Проверка:**
- [ ] Location отправляется через WebSocket (уже работает)
- [ ] Нет мёртвого кода

---

### TICKET-037: Пересобрать APK и задеплоить
**Зависимости:** TICKET-025 через TICKET-036
**Действия:**
- [ ] `cd MTMobileApp/android && ./gradlew assembleRelease` (JAVA_HOME=21)
- [ ] Скопировать APK на сервер `/opt/mtm/static/app-release.apk`
- [ ] Установить на тестовый телефон
**Проверка:**
- [ ] APK собирается без ошибок
- [ ] Скачивается по `https://mtm.leaddrivecrm.org/download/app-release.apk`
- [ ] Login → реальные данные, GPS, маршруты

---

## ФАЗА 4: Новые backend эндпоинты

### TICKET-038: POST /api/orders — создание заказа
**Файл:** `backend/src/modules/orders/orders.router.ts` (новый)
**Действия:**
- [ ] Добавить модель Order в schema.prisma (id, agentId, customerId, visitId, items JSON, totalAmount, status, createdAt)
- [ ] Создать orders.router.ts: GET list, POST create, GET :id
- [ ] Подключить в index.ts
**Проверка:**
- [ ] POST /api/orders → 201, заказ создан
- [ ] GET /api/orders → 200, список заказов

---

### TICKET-039: GET /api/audit-logs — аудит лог
**Файл:** `backend/src/modules/audit/audit.router.ts` (новый)
**Действия:**
- [ ] Создать audit.router.ts: GET с пагинацией, фильтрами по userId/action/entity
- [ ] Подключить в index.ts
**Проверка:**
- [ ] GET /api/audit-logs → 200

---

### TICKET-040: GET /api/dashboard/stats — агрегированные KPI
**Файл:** `backend/src/index.ts` или новый модуль
**Действия:**
- [ ] Эндпоинт возвращает: total users, active agents, visits today, tasks pending, routes active, alerts unread
- [ ] Одним запросом для dashboard
**Проверка:**
- [ ] GET /api/dashboard/stats → 200 с реальными числами

---

### TICKET-041: Деплой Фазы 4
**Действия:**
- [ ] prisma db push (новые модели)
- [ ] rsync backend
- [ ] pm2 restart mtm-backend
**Проверка:**
- [ ] Все новые эндпоинты отвечают 200

---

## ФАЗА 5: Push уведомления

### TICKET-042: Backend — Firebase Admin SDK
**Файл:** `backend/src/services/firebase.ts` (новый)
**Действия:**
- [ ] `npm install firebase-admin`
- [ ] Настроить service account
- [ ] Функция `sendPushNotification(fcmToken, title, body, data)`
**Проверка:**
- [ ] Тестовый push отправляется

---

### TICKET-043: Backend — сохранение FCM token
**Файлы:** `auth.router.ts`, `schema.prisma`
**Действия:**
- [ ] Добавить поле `fcmToken String?` к User
- [ ] POST /api/auth/fcm-token → сохраняет токен
- [ ] При check-in, новой задаче, alert → отправлять push менеджерам
**Проверка:**
- [ ] FCM token сохраняется при логине
- [ ] Push приходит при событии

---

### TICKET-044: Mobile — включить Push
**Файл:** `MTMobileApp/src/services/notifications.ts`
**Действия:**
- [ ] Раскомментировать FCM код
- [ ] Подключить Firebase config
- [ ] Отправлять FCM token на сервер после логина
- [ ] Обработка foreground/background
**Проверка:**
- [ ] Push приходит на телефон
- [ ] Tap открывает нужный экран

---

## ФАЗА 6: Polish + Production

### TICKET-045: Offline sync (мобилка)
**Файл:** `MTMobileApp/src/services/offline.ts`
**Действия:**
- [ ] Раскомментировать API вызовы (строки 106, 112, 115)
- [ ] Реализовать `api.createOrder()`, `api.createNote()`, `api.submitStock()`
- [ ] Тестировать: выключить сеть → сделать действия → включить → проверить sync
**Проверка:**
- [ ] Действия в offline сохраняются в очередь
- [ ] При восстановлении сети — синхронизируются

---

### TICKET-046: Убрать demo режим
**Файлы:** множество
**Действия:**
- [ ] LoginScreen.tsx (мобилка): убрать демо credentials display
- [ ] login/page.tsx (веб): убрать демо credentials display
- [ ] store/auth.ts (веб): убрать mockAdminUser и fallback mock login
- [ ] store/realtime.ts (веб): убрать simulation (random movement), оставить только WS+polling
**Проверка:**
- [ ] Нигде не показываются демо логин/пароль
- [ ] При недоступном бэкенде — ошибка, не mock

---

### TICKET-047: Production hardening
**Действия:**
- [ ] Backend .env: `CORS_ORIGIN` = только `https://mtm.leaddrivecrm.org` (уже сделано)
- [ ] Добавить rate limiting (`express-rate-limit`)
- [ ] PM2 ecosystem.config.js для обоих сервисов
- [ ] `pm2 startup` для auto-restart при reboot
- [ ] Логирование ошибок в файл
**Проверка:**
- [ ] Rate limit работает (>100 запросов/мин → 429)
- [ ] PM2 перезапускает при crash
- [ ] Логи пишутся в файл

---

## Статус выполнения

| Фаза | Тикеты | Статус |
|------|--------|--------|
| **1. Починить API** | TICKET-001 — TICKET-010 | [ ] Не начато |
| **2. Админка → API** | TICKET-011 — TICKET-024 | [ ] Не начато |
| **3. Мобилка → API** | TICKET-025 — TICKET-037 | [ ] Не начато |
| **4. Новые эндпоинты** | TICKET-038 — TICKET-041 | [ ] Не начато |
| **5. Push** | TICKET-042 — TICKET-044 | [ ] Не начато |
| **6. Polish** | TICKET-045 — TICKET-047 | [ ] Не начато |

**Всего: 47 тикетов**
