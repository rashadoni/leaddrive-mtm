# Google Play: всё для консоли

Всё, что Play Console спрашивает о LeadDrive Route Field (`com.mtmobileapp`), с
ответами и тем, на чём каждый ответ стоит в коде. Сверено 2026-10-18 с main
(3.11.30 / versionCode 1624 и 3.11.31 / 1627) и с сервером leaddrive-v2. Неверный
ответ в «Безопасности данных» Google считает нарушением политики, а не
опечаткой: изменил приложение — сверь разделы 4–6 заново.

Страница для владельца (по-русски, с кнопками «Скопировать»):
https://claude.ai/artifact/JH4tr1LGRjQurQZgKEnepL

Папка лежит в корневом `docs/`, а не в `MTMobileApp/`: правка внутри
`MTMobileApp/**` запускает `build-apk.yml` и публикует лишний pre-release.

## 0. Аккаунт и что изменилось с сентября

- **Аккаунт — организации** (решение владельца 2026-10-18; создаёт он сам:
  D-U-N-S, $25, проверка личности). Обязательный закрытый тест «12
  тестировщиков × 14 дней» касается только *личных* аккаунтов, созданных после
  2023-11-13 ([Google](https://support.google.com/googleplay/android-developer/answer/14151465)).
  Прежний личный аккаунт `LeadDrive Solutions` (ID 7529947756576280791) больше не
  план.
- С версии от 2026-09-14 приложение получило: `ACCESS_BACKGROUND_LOCATION`
  (возобновление записи после перезагрузки, `FieldTrackingResume`),
  `RECEIVE_BOOT_COMPLETED`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, пуши Firebase,
  подпись клиента, вход по коду из WhatsApp, учёт рабочего дня (QR через ML Kit,
  согласие на место, признак mock-location), экраны руководителя (живая карта,
  сообщения команде). Поэтому ответы ниже отличаются от сентябрьских: нужна
  декларация фонового местоположения, IARC «пользователи общаются» — Yes.

## 1. Что блокирует отправку на проверку

1. **Нет объяснения перед первым запросом местоположения.** `runtime/AndroidApp.tsx`
   по «Начать день» сразу зовёт `requestMultiple(ACCESS_FINE_LOCATION…)`. Сервис
   записи пишет место и при закрытом приложении, а политика Google требует
   prominent disclosure **до** runtime-запроса: слово «местоположение», какие
   функции, «даже когда приложение закрыто или не используется», как
   используется ([Google](https://support.google.com/googleplay/android-developer/answer/9799150)).
   Карточка `todayV2.backgroundLocation*` на «Сегодня» показывается только после
   выдачи «при использовании» и не говорит «когда приложение закрыто».
   Нужно: диалог перед первым запросом + переписать текст карточки по шаблону
   Google на трёх языках.
2. **`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`** (`FieldNotificationsModule.kt`,
   `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`). Play запрещает прямой запрос,
   «unless the core function is adversely affected»; в списке допустимых —
   мессенджеры без FCM, безопасность, автоматизация, компаньоны устройств
   ([Android](https://developer.android.com/training/monitoring-device-state/doze-standby)).
   Полевого учёта там нет. Вариант без риска уже есть в коде как запасной —
   `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` (без разрешения в манифесте).
   Решение владельца; рекомендовано заменить.
3. **Политика на сайте** — PR rashadoni/leaddrive-site#36 (старая говорила, что
   фоновое местоположение не запрашивается). Мерж — после «давай».

## 2. Подпись (Play App Signing) — свой ключ

Сертификат пакета из CI: `CN=LeadDrive MTM, OU=Mobile, O=LeadDrive, L=Baku`,
SHA-256 `d6e9a6a76bb7c12e0ed81e2094f56e356e6f0d12b07ba35a2ed6598a88cecf2b`, RSA 2048,
действует до 2053-12-19. Проверено разбором `META-INF/MTM-RELE.RSA` самих .aab
1624 и 1627 (а не со слов CI). Тот же сертификат у APK на устройствах агентов
(память «MTM: подпись релиза»), поэтому:

- при первой загрузке выбрать **свой ключ** (Export and upload a key from Java
  keystore, PEPK), а не ключ Google — иначе версия из Play не встанет поверх
  APK, и агенты потеряют неотправленную очередь;
- отдельный upload key не регистрировать: CI подписывает .aab тем же ключом
  (`bundleRelease`, `signingConfigs.release`), а шаг «Verify package, version and
  release signature» в `build-apk.yml` сверяет отпечаток и APK, и .aab;
- с 2027 года Android ставит APK в обход магазина только от проверенных
  разработчиков; один ключ в Play и в APK покрывает и это.

**PEPK.** Ключ лежит на dev-боксе: `/home/rashad/.leaddrive-keys/mtm-release.keystore`
(PKCS12, alias `mtm-release`, пароли в `MTMobileApp/android/app/build.gradle`).
Java на боксе нет; брать переносной JDK 21 в scratchpad (на системной Java PEPK
падает с `Cannot find any provider supporting RSA/NONE/OAEPWithSHA1AndMGF1Padding`).
Владелец скачивает в консоли `encryption_public_key.pem` и присылает текст;
дальше:

```
java -jar pepk.jar --keystore=/home/rashad/.leaddrive-keys/mtm-release.keystore \
  --alias=mtm-release --output=mtm-signing-key.zip --include-cert \
  --rsa-aes-encryption --encryption-key-path=encryption_public_key.pem
```

`pepk.jar` — по ссылке из той же страницы консоли. Получившийся zip зашифрован
открытым ключом Google; его отдают владельцу, он загружает в «Upload private key».

## 3. Пакет и номер версии

- `.aab` публикуется в каждом релизе `build-apk.yml`:
  `leaddrive-mtm-v<версия>-<versionCode>.aab`. Загружать только релизы с
  `(branch main)` в описании — ветки `claude/**` публикуют такие же pre-release.
- `versionCode = 1000 + github.run_number` workflow `build-apk.yml`: растёт с
  каждым прогоном, общий счётчик для main и веток. Сбросится, если переименовать
  файл workflow (у нового файла свой счётчик с 1) — тогда Play откажет в
  загрузке. Локальная сборка без `MTM_VERSION_CODE` получает 87 — в Play её не
  грузить.
- В .aab: `targetSdk 36`, `minSdk 24` (требование Play для новых приложений —
  targetSdk 35+ — выполнено).

## 4. Разрешения в собранном манифесте (.aab 1624, merged)

| Разрешение | Откуда | Что в консоли |
|---|---|---|
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | приложение | Data safety → Location |
| `ACCESS_BACKGROUND_LOCATION` | приложение | Sensitive permissions → Location: декларация + видео |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` | приложение; сервис `RNBackgroundActionsTask` с `foregroundServiceType="location"` | Foreground service permissions: описание + видео |
| `POST_NOTIFICATIONS` | приложение | — |
| `RECEIVE_BOOT_COMPLETED` | приложение (`FieldTrackingResumeReceiver`) | — |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | приложение | формы нет; риск — раздел 1.2 |
| `CAMERA` | приложение (фото визита, QR через vision-camera + ML Kit) | — |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `WAKE_LOCK` | приложение / библиотеки | — |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` | библиотеки; в рантайме не запрашиваются, на targetSdk 33+ не действуют | — (политика фото/видео касается `READ_MEDIA_*`, их нет) |
| `c2dm.permission.RECEIVE`, `BIND_GET_INSTALL_REFERRER_SERVICE`, `DUMP`, `BIND_JOB_SERVICE` | Firebase / библиотеки | — |

Рекламного ID (`com.google.android.gms.permission.AD_ID`) нет → Advertising ID: No.
`USE_FULL_SCREEN_INTENT`, `SCHEDULE_EXACT_ALARM`, `READ_MEDIA_*` нет.
`android:usesCleartextTraffic="true"` стоит, но http используется только для
`localhost`/`10.0.2.2`/`127.*`/`192.168.*` (`services/api.ts → protocol`); код
компании резолвится в `https://<код>.leaddrivecrm.org`.

## 5. Тексты и ответы

Все тексты витрины (az основной, ru, en), «Что нового», App access, IARC,
целевая аудитория, Foreground service и декларация фонового местоположения —
на странице владельца, по шагам 3–5, и в `listing.json` рядом (витрина). Длины:
название 21/30; краткое az 71, ru 70, en 67 из 80; полное ≤ 1824 из 4000.

Опорные факты для текстов (не добавлять обещаний сверх них): подпись —
`services/visit-signature.ts`; презентации — `PresentationViewerScreen`; заявки
на врача и изменение карточки — `DoctorCreateRequest`, `RouteContactChangeRequest`
(агент не правит базу сам); QR-отметки — `AttendanceQrScannerNative`;
руководитель — `ManagerLiveMap`, `ManagerTeamMessageScreen`, планирование;
офлайн — outbox + центр синхронизации.

Вход для проверяющего: компания `leaddrive` (демо-тенант LeadDrive Inc.,
`leaddrive.leaddrivecrm.org`), логин и пароль демо-агента — **вписывает
владелец**. Клиентский тенант (Zeytun и др.) не давать.

## 6. Безопасность данных (Data safety)

Общее: собирает — Yes; шифрование в пути — Yes; аккаунты — «My app does not
allow users to create an account» (их создаёт компания; политика удаления
аккаунта Google касается приложений с созданием аккаунта); удаление по запросу —
Yes, ссылка `https://leaddrivecrm.org/privacy/field-app#delete` (раздел с
`id: 'delete'` в leaddrive-site). Shared — No для всех: Sentry, Firebase, ML Kit,
Contabo — обработчики по поручению, руководители клиента — пользователи того же
сервиса. Ephemeral — No.

| Тип Play | Основание в коде | Purposes | Required |
|---|---|---|---|
| Location → Precise, Approximate | `location.android.ts` (точка ~30 с, fused/GPS ≤ 50 м, сеть ≤ 200 м), координаты визита, `attendance-location.ts` + `isMock` | App functionality; Fraud prevention, security, and compliance | Required |
| Personal info → Name | аккаунт; контакты; `signerName` подписи | App functionality; Account management | Required |
| Personal info → Email address | вход (`LoginScreen`) | Account management | Required |
| Personal info → Phone number | вход по номеру и код в WhatsApp (`LoginCodeFlow`); телефоны контактов | App functionality; Account management | Required |
| Photos and videos → Photos | фото визита (`media-outbox`, водяной знак) | App functionality | Optional |
| Messages → Other in-app messages | `ManagerTeamMessageScreen` → `TeamMessagesScreen` | App functionality | Optional |
| App activity → App interactions | хлебные крошки и трассировки Sentry (`tracesSampleRate` 0.1) | Analytics | Required |
| App activity → Other UGC | заметки, подпись (`svgPath`), итоги задач, объяснения | App functionality | Optional |
| App info and performance → Crash logs, Diagnostics | Sentry (EU, `sendDefaultPii: false`); ML Kit diagnostics | Analytics | Required |
| Device or other IDs | `field-device-id.ts` (`rf-…`), FCM-токен + `deviceId` (`push-registration.ts`), Firebase Installation ID, ID ML Kit | App functionality; Analytics; Fraud prevention, security, and compliance | Required |

Не собирается: контакты телефона, SMS, звонки, календарь, микрофон, файлы,
история браузера, финансы, здоровье.

## 7. Графика

| Что | Требование Play | Статус |
|---|---|---|
| Иконка | 512×512 PNG | `icon-512.png` — совпадает с `ic_launcher` (метка на `#6C63FF`) |
| Баннер | 1024×500 | `feature-graphic.png` — сентябрьский вид; переснять со скриншотами |
| Скриншоты телефона | 2–8, 9:16 | снимаются на S23 (SM-S918B) под демо-агентом LeadDrive Inc.; 2026-10-18 телефон был под руководителем Zeytun Pharma — его экраны в магазин нельзя |
| Скриншоты планшета | по желанию | Redmi Pad, если подключён |

Видео для деклараций (≤ 30 с, YouTube по ссылке): «Начать день» → объяснение →
системный запрос → «Разрешать всегда» → домой, шторка с уведомлением
«LeadDrive — рабочий день» → «Перерыв» (уведомление пропало) → «Завершить день».
Снимать после правки из раздела 1.1.
