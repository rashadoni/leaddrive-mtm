# Google Play: всё для консоли

Всё, что Play Console спрашивает о LeadDrive Route Field, с ответами. Ответы
сверены с кодом и сервером на 2026-09-14; при изменении приложения сверять
заново — неверный ответ в «Безопасности данных» Google считает нарушением
политики, а не опечаткой.

Аккаунт разработчика: **LeadDrive Solutions**, личный (Personal), ID
`7529947756576280791`. Личному аккаунту, созданному после 13.11.2023, до
открытой публикации нужен закрытый тест: 12 тестировщиков, 14 дней подряд.

## 0. Что уже готово в репозитории

| Что | Где |
|---|---|
| Пакет для загрузки (.aab) | релиз каждой сборки main: `leaddrive-mtm-v3.1.0-<versionCode>.aab` |
| Номер версии | `1000 + номер прогона CI`, растёт сам |
| Подпись | ключ `CN=LeadDrive MTM`, SHA-256 `d6e9a6a7…cf2b` — тот же, что у APK на устройствах |
| Иконка 512×512 | `docs/google-play/icon-512.png` |
| Баннер 1024×500 | `docs/google-play/feature-graphic.png` |
| Тексты магазина | раздел 3 ниже |
| Политика конфиденциальности | https://leaddrivecrm.org/privacy/field-app (после мержа PR в leaddrive-site) |

## 1. Создание приложения (Create app)

| Поле | Ответ |
|---|---|
| App name | `LeadDrive Route Field` — так же подписан значок на телефоне |
| Default language | Azerbaijani – az-AZ |
| App or game | App |
| Free or paid | Free |
| Declarations | обе галочки ставит владелец сам: правила для разработчиков и экспортное законодательство США |

## 2. Подпись приложения (Play App Signing)

При первой загрузке .aab консоль предложит, каким ключом подписывать.
Выбрать **использовать свой ключ** (Use a different key → Export and upload a
key from Java keystore) и загрузить ключ, которым подписаны нынешние APK.

Почему: у агентов уже стоит `com.mtmobileapp`, подписанный этим ключом. Если
Google подпишет своим ключом, версия из Play не установится поверх — придётся
удалять приложение, а с ним неотправленные визиты и черновики.

Для экспорта Google даёт утилиту `pepk.jar` и команду. Её запускает владелец
там, где лежит keystore; пароль ключа вводит он сам.

## 3. Страница в магазине (Main store listing)

Категория: **Business**. Контакты: `info@fanumsec.com`, сайт `https://leaddrivecrm.org`.

### az-AZ

**Qısa təsvir** (≤ 80):
```
Səyyar satış komandası üçün marşrut, ziyarət və tapşırıqlar — LeadDrive CRM ilə
```

**Tam təsvir:**
```
LeadDrive Route Field — LeadDrive CRM-in səyyar əməkdaşlar üçün mobil tətbiqidir: tibbi nümayəndələr, merçendayzerlər və sahədə işləyən satış agentləri üçün.

Gün bir ekranda
• Bugünkü marşrut və növbəti nöqtə «Bu gün» ekranında
• İş gününü başlatmaq, fasilə və günü bitirmək bir toxunuşla
• Təqvim: həftənin planı, hər gün üçün marşrut və ziyarətlər

Ziyarətlər
• Nöqtəyə gəlişi GPS ilə qeyd etmək (check-in / check-out)
• Ziyarət fotoları — tarix, vaxt və koordinatlarla
• Plansız ziyarət, ziyarət tarixçəsi və yekunu

Tapşırıqlar
• Rəhbərin verdiyi tapşırıqlar, icra və nəticə
• Fayl və təsdiqlər tapşırığın içində

İnternet olmadan da işləyir
• Əməliyyatlar telefonda saxlanılır və bağlantı bərpa olunanda göndərilir
• Sinxronizasiya mərkəzi nəyin göndərildiyini və nəyin gözlədiyini göstərir

Həmçinin
• Öz marşrutunu planlaşdırmaq (şirkət icazə veribsə)
• Müştərilər və kontaktlar bazası
• «GPS tarixçəm» — iş günü ərzində öz qeydə alınmış nöqtələriniz
• Azərbaycan, rus və ingilis dilləri; telefon və planşet üçün

Yer məlumatı yalnız aktiv iş günü ərzində, bildiriş göstərilərkən toplanır və fasilədə, günün sonunda dayanır.

Tətbiq LeadDrive CRM istifadə edən şirkətlərin əməkdaşları üçündür. Daxil olmaq üçün şirkətinizin verdiyi hesab lazımdır.
```

### ru-RU

**Краткое описание** (≤ 80):
```
Маршруты, визиты и задачи для полевой команды продаж — вместе с LeadDrive CRM
```

**Полное описание:**
```
LeadDrive Route Field — мобильное приложение LeadDrive CRM для полевых сотрудников: медицинских представителей, мерчендайзеров и торговых агентов.

День на одном экране
• Сегодняшний маршрут и следующая точка на экране «Сегодня»
• Начать рабочий день, перерыв и завершение — одним нажатием
• Календарь: план недели, маршрут и визиты на каждый день

Визиты
• Отметка прибытия на точку по GPS (check-in / check-out)
• Фото визита с датой, временем и координатами
• Внеплановый визит, история и итоги визитов

Задачи
• Задачи от руководителя, выполнение и результат
• Файлы и подтверждения внутри задачи

Работает без интернета
• Действия сохраняются на телефоне и отправляются, когда связь вернётся
• Центр синхронизации показывает, что отправлено, а что ждёт

А также
• Планирование своего маршрута (если компания разрешила)
• База клиентов и контактов
• «Мой GPS» — ваши записанные точки за рабочий день
• Азербайджанский, русский и английский; телефон и планшет

Местоположение собирается только во время активного рабочего дня при видимом уведомлении и останавливается на перерыве и в конце дня.

Приложение предназначено для сотрудников компаний, работающих в LeadDrive CRM. Для входа нужен аккаунт, выданный вашей компанией.
```

### en-US

**Short description** (≤ 80):
```
Routes, visits and tasks for field sales teams — works with LeadDrive CRM
```

**Full description:**
```
LeadDrive Route Field is the LeadDrive CRM mobile app for field staff: medical representatives, merchandisers and sales agents on the road.

Your day on one screen
• Today's route and the next stop on the Today screen
• Start the workday, take a break and end the day with one tap
• Calendar: the week's plan, route and visits for each day

Visits
• GPS check-in and check-out at each stop
• Visit photos stamped with date, time and coordinates
• Unplanned visits, visit history and summaries

Tasks
• Tasks from your manager, progress and results
• Files and confirmations inside the task

Works offline
• Actions are saved on the phone and sent when the connection returns
• The sync centre shows what was sent and what is waiting

Also
• Plan your own route (if your company allows it)
• Customers and contacts
• My GPS — your recorded points for the workday
• Azerbaijani, Russian and English; phone and tablet layouts

Location is collected only during an active workday while a notification is shown, and stops during breaks and at the end of the day.

The app is for employees of companies that use LeadDrive CRM. Signing in requires an account issued by your company.
```

### Графика

| Что | Требование Play | Статус |
|---|---|---|
| Иконка | 512×512 PNG, до 1 МБ | `icon-512.png` |
| Баннер | 1024×500 PNG/JPG | `feature-graphic.png` |
| Скриншоты телефона | 2–8 шт., стороны 320–3840 px, 9:16 | снять на телефоне (нужно подключить) |
| Скриншоты планшета 7" и 10" | по 2–8 шт. | снять на Redmi Pad SE |

На скриншотах только демо-данные (ADV-DEMO, демо-агент). Реальных клиентов и
сотрудников не показывать.

## 4. Содержание приложения (App content)

### Privacy policy
`https://leaddrivecrm.org/privacy/field-app`

### App access
**All or some functionality is restricted** → добавить инструкцию:

- Name: `Demo field agent`
- Username / Password: демо-аккаунт агента — **создаёт и вписывает владелец**
- Other information:
```
1. On the first screen enter the company server: leaddrive.leaddrivecrm.org
2. Sign in with the username and password above.
3. Tap "Start workday" on the Today tab. Location tracking starts only after this and shows a notification.
4. Route, Visits and Tasks contain demo data.
```

У демо-аккаунта должен быть маршрут на ближайшие дни, иначе проверяющий увидит
пустые экраны.

### Ads
**No**, рекламы нет.

### Content rating (анкета IARC)
- Category: **All other app types** (утилита, продуктивность)
- Насилие, секс, нецензурная лексика, наркотики, азартные игры: **No**
- Пользователи общаются друг с другом или обмениваются контентом: **No** — чатов нет
- Приложение передаёт точное местоположение пользователя другим пользователям: **Yes** — руководитель видит местоположение агента в рабочее время
- Покупки цифровых товаров: **No**
- Итог ожидается: 3+ / Everyone (или близкий), с пометкой о передаче местоположения

### Target audience
**18 and over** — только. Приложение не для детей, в оформлении нет ничего, что привлекало бы детей.

### News app — No · COVID-19 — No · Government app — No · Financial features — None · Health — No

### Advertising ID
**No.** В собранном манифесте нет `com.google.android.gms.permission.AD_ID` (проверено по APK v3.1.0-build141).

### Foreground service permissions
Приложение объявляет `FOREGROUND_SERVICE_LOCATION`. Выбрать тип задачи **Location** → пользовательская задача:

```
Field employees start their workday in the app. While the workday is active the app records GPS points so the employee's route and visit check-ins can be confirmed to their employer. The service starts only when the user taps "Start workday" with the app open, shows a persistent notification the whole time, pauses when the user taps "Break", and stops when the user ends the workday or signs out. Stopping it would stop the core function: the route record of the workday.
```
Видео: короткая запись экрана — «Начать рабочий день» → уведомление в шторке →
«Перерыв» (уведомление исчезает) → «Завершить день». Загрузить на YouTube с
доступом по ссылке, ссылку вставить в форму.

Фоновое местоположение (`ACCESS_BACKGROUND_LOCATION`) приложение **не запрашивает** — отдельная декларация не нужна.

## 5. Безопасность данных (Data safety)

Общие вопросы:

| Вопрос | Ответ |
|---|---|
| Collects or shares any required user data types? | **Yes** |
| All data encrypted in transit? | **Yes** — только HTTPS |
| Users can request that data be deleted? | **Yes** — через администратора своей компании или info@fanumsec.com |
| Account creation | аккаунты создаёт компания-клиент в LeadDrive CRM, в приложении регистрации нет → «My app does not allow users to create an account»; способ входа — username and password |

Передача третьим лицам (**shared**): **нет**. Sentry и хостинг — обработчики по
поручению, это не «sharing» в терминах Play.

Собираемые данные (**collected**), все обязательны для работы, не эфемерные:

| Тип данных Play | Что именно | Цель (Purpose) |
|---|---|---|
| Location → **Precise location** | GPS-точки во время рабочего дня; координаты отметки визита | App functionality |
| Personal info → **Name** | имя сотрудника в аккаунте; имена контактов клиента, которые сотрудник вносит | App functionality, Account management |
| Personal info → **Email address** | email аккаунта сотрудника | Account management |
| Personal info → **Phone number** | телефоны контактов клиентов, внесённые сотрудником | App functionality |
| Photos and videos → **Photos** | фото визитов (с датой, временем, координатами) | App functionality |
| App activity → **Other user-generated content** | заметки визитов, результаты задач | App functionality |
| App info and performance → **Crash logs**, **Diagnostics** | отчёты о сбоях (Sentry, регион ЕС, без IP) | App functionality (стабильность) |
| Device or other IDs → **Device or other IDs** | идентификатор установки, созданный приложением | App functionality, Fraud prevention, security |

Не собирается: контакты телефона, SMS, звонки, календарь, файлы устройства,
рекламный ID, история браузера, финансовая и медицинская информация.

## 6. Закрытый тест (обязателен для личного аккаунта)

1. Testing → Closed testing → Create track, загрузить .aab.
2. Testers: список email-адресов (Google-аккаунты) — **не меньше 12**.
3. Тестировщики принимают приглашение по ссылке и ставят приложение из Play.
4. 14 дней подряд все 12 остаются в тесте.
5. Dashboard → Apply for production → короткая анкета о тесте.

Тестировщикам нужен доступ к серверу компании (демо или рабочий аккаунт).

## 7. Порядок

1. ☐ Проверки аккаунта: документ, Android-устройство, телефон — владелец
2. ☐ Create app — раздел 1
3. ☐ App content — раздел 4, Data safety — раздел 5
4. ☐ Store listing — раздел 3, графика, скриншоты
5. ☐ Closed testing + загрузка .aab + ключ подписи — разделы 2 и 6
6. ☐ 14 дней теста → Apply for production
