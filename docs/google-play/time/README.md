# Google Play: LeadDrive Time (`com.leaddrive.attendance`)

Всё, что Play Console спрашивает о LeadDrive Time, с ответами и тем, на чём
каждый ответ стоит в коде. Сверено 2026-11-16 с main (Time 1.0.0). Полевое
приложение — в `../README.md`; Time — отдельная сборка того же кода
(`-PattendanceApp=true`), поэтому многие ответы похожи, но не одинаковы:
у Time нет фонового местоположения, Sentry и подписи клиента.

Изменил приложение — сверь разделы 3–5 заново: неверный ответ в «Безопасности
данных» Google считает нарушением политики.

## 1. Аккаунт, пакет, подпись

- Аккаунт разработчика — организации «Fanum-Dev» (ID 5475896138283943355).
- `.aab` собирает `.github/workflows/build-attendance.yml` (с 2026-11-16 вместе
  с APK, один прогон Gradle). versionCode = 1000 + номер прогона этого
  workflow; грузить в Play только сборку с `main`.
- Подпись — тот же ключ, что у APK на `/time` и у полевого приложения
  (SHA-256 `d6e9a6a7…cecf2b`). В Play — **свой ключ** (PEPK), иначе версия из
  Play не встанет поверх установленного APK. Порядок PEPK — `../README.md`, раздел 2.

## 2. Разрешения (манифест `android/app/src/attendance/AndroidManifest.xml`)

| Разрешение | Зачем |
|---|---|
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | одна точка при отметке начала или конца дня, только если компания включила и сотрудник принял текст согласия (`services/attendance-location-fix.ts`, `attendance-location.ts`) |
| `CAMERA` | QR филиала (`AttendanceQrScannerNative`) и до 3 фото документа к заявке (`AttendanceRequestsScreen`) |
| `POST_NOTIFICATIONS` | запросы объяснений и решения по заявкам (FCM, `FieldPushService`) |
| `INTERNET`, `ACCESS_NETWORK_STATE` | синхронизация и офлайн-очередь |

Убраны (`tools:node="remove"`, проверяет workflow и по APK, и по .aab):
`ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE(_LOCATION)`,
`RECEIVE_BOOT_COMPLETED`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`. Поэтому
декларации фонового местоположения и foreground service для Time не нужны.

## 3. Безопасность данных (Data safety)

Общее: собирает — Yes; шифрование в пути — Yes (`usesCleartextTraffic="false"`);
создание аккаунта в приложении — нет (аккаунт создаёт компания); удаление по
запросу — Yes, `https://leaddrivecrm.org/privacy/time-app#delete`. Shared — No
для всех (Google FCM и хостинг — обработчики по поручению). Ephemeral — No.

| Тип Play | Основание | Purposes | Required |
|---|---|---|---|
| Location → Precise, Approximate | точка при отметке, признак `isMock` | App functionality; Fraud prevention, security, and compliance | Optional |
| Personal info → Name | аккаунт (`api.ts`, ответ входа) | App functionality; Account management | Required |
| Personal info → Email address | вход (`LoginScreen`) | Account management | Required |
| Personal info → Phone number | вход по номеру, код в WhatsApp | Account management | Required |
| Health and fitness → Health info | заявка «болезнь»: причина и фото справки | App functionality | Optional |
| Photos and videos → Photos | фото документа к заявке | App functionality | Optional |
| App activity → Other user-generated content | причины заявок, объяснения | App functionality | Optional |
| App activity → Other actions | отметки начала, конца, перерыва | App functionality | Required |
| Device or other IDs | `rf-…` из `field-device-id.ts`, FCM-токен | App functionality; Fraud prevention, security, and compliance | Required |
| App info and performance → Diagnostics | встроенный Google ML Kit сканера QR (модели в `assets/mlkit_barcode_models` .aab 1065) шлёт Google модель устройства, версии, скорость; без изображения | Analytics | Required |

Не собирается: контакты, SMS, звонки, календарь, микрофон, файлы, история
браузера, финансы, рекламный ID. Sentry в точке входа Time не
инициализируется (`src/attendance/AttendanceApp.tsx`), DSN в манифесте .aab
1065 нет; аналитика Firebase выключена, `AD_ID` в манифесте нет.

## 4. Остальные анкеты

- **Целевая аудитория:** 18+. Не для детей.
- **Реклама:** нет.
- **Content rating (IARC):** категория «All other app types»; насилия, секса,
  ругательств, веществ, азартных игр нет; пользователи взаимодействуют — Yes
  (заявки и объяснения с фото уходят руководителю и отделу кадров); делится
  местоположением с другими пользователями — Yes (место отметки видят
  руководители); покупок нет.
- **App access:** вход ограничен. Компания `leaddrive` (демо-тенант LeadDrive
  Inc.), логин демо-сотрудника и пароль вписывает владелец. Клиентские тенанты
  не давать.
- **Government / financial / health apps, news:** нет.

## 5. Графика

- `icon-512.png` — из `res/drawable/attendance_launcher.xml` (`render_icon.py 512`).
- `feature-graphic.png` — 1024×500, фон и цвета иконки.
- `screenshots/phone-{1,2,3}.png` — снимки Time 1012/1016 с телефона
  (`docs/evidence/`, вымышленный сотрудник), без строки состояния и системных
  кнопок: 1080×2078 (Play не берёт сторону длиннее двух других).
- Тексты витрины az/ru/en — `listing.json`.
