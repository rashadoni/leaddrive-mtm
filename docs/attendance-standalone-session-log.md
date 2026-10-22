# Отдельное приложение учёта времени — журнал

## 2026-10-21 — поручение

Пользователь первоначально заказал E2E и Maestro учёта времени от лица кадровика и сотрудника. Телефон подключён через существующий ADB tunnel 127.0.0.1:35037. Установлен рабочий com.mtmobileapp 3.11.42/1675; он не переустанавливался, данные не очищались, отметки не создавались.

В ходе работы пользователь уточнил: «оставь серверную часть а приложение отдельное». Это самостоятельный Android клиент учёта времени, а не тестовая копия и не новый backend. Существующие CRM/MTM, роли и данные сохраняются. Полевая роль AGENT не превращается в кадровую.

Чистый worktree: `/mnt/HC_Volume_106454338/codex-alt-data/worktrees/mtm-attendance-standalone`. Ветка `codex/attendance-standalone`, origin `https://github.com/rashadoni/leaddrive-mtm.git`, база `f5d80b618a760347411532250b55e6e80aac74d8`. Мобильный выпуск через hosted Linux GitHub CI; сборки на Contabo запрещены.

План: отдельные Android package/entry point/название/иконка; повторное использование проверенных кадровых экранов и API; отдельный runtime без полевого GPS и обновления из канала MTM; проверки admission/сессии/изолированного хранилища; Maestro сценарии; CI APK; установка рядом с MTM и реальные тесты на вымышленных данных.

CRM E2E прогон `39556643325` для `092221a2f1a7302458ad0ed050443c1c38e68182`; existing mobile fixture emulator прогон `39556842312` для опубликованного `v3.11.49-build710`. Эти прогоны проверяют существующие версии, а не будущий standalone APK. Основной журнал первоначальной задачи: `/home/codex-alt/.codex/worktrees/workforce-e2e-maestro/leaddrive-v2/docs/workforce-e2e-maestro-session-log.md`.

Команды пользователю давать отдельным копируемым блоком. Подключать его только при реальном препятствии, после самостоятельной диагностики. Никаких чужих worktree, очистки appdata или публикации приватных UI/токенов.

## 2026-10-21 — реализация первого кандидата

- Отдельный пакет `com.leaddrive.attendance`, имя LeadDrive Time / LeadDrive Время / LeadDrive Vaxt, собственная иконка часов, версия 1.0.0. Сборка выбирается только флагом `-PattendanceApp=true`; обычная сборка MTM сохраняет package/entry/manifest.
- Отдельные JS runtime/navigation и Android Application. Нет полевого GPS runtime, boot receiver, foreground location service, канала обновлений Field или регистрации FieldPush/FieldLocation. Разрешения камеры/места только для существующих действий пользователя. Firebase/push пока не подключён для нового package; внутриприкладной Inbox использует прежний backend.
- Собственные вкладки: рабочий день, заявки (по отдельному grant), объяснения, уведомления, профиль. Роли EMPLOYEE/ADMIN/MANAGER/SUPERVISOR только при актуальном server-owned attendance grant. AGENT не допущен к кадровому интерфейсу.
- PASS: 3 целевых Jest suite / 60 тестов (права, кадровый экран, отдельный профиль). Первый запуск из пустого dependency cache завершился MODULE_NOT_FOUND; после подключения существующего cache указанные тесты действительно выполнены.
- PASS: официальный Maestro 2.11.0 check-syntax для 6 flow-файлов. Это синтаксис, не выполнение на телефоне. Каталог `.maestro/attendance` по умолчанию запускает только read-only smoke; изменяющие день/заявки сценарии выбираются явно и проверяют имя fictional office account.
- Официальные Maestro/JRE загружены с проверкой SHA256 в приватный временный каталог. Maestro пока не видит ADB tunnel через ADB_SERVER_SOCKET; требуется адаптер remote ADB, продолжается диагностика.
- Existing mobile emulator run 39556842312 SUCCESS, source f5d80b6, release v3.11.49-build710. Не является проверкой нового standalone APK. CRM E2E 39556643325 ещё выполняется.
- Полная Android сборка и полный TypeScript NOT RUN на Contabo: тяжёлые проверки разрешены только CI/внешнему worker. Подготовлен отдельный hosted Linux workflow с проверкой подписи, фактического package/version и запрещённых tracking-компонентов в APK.

## 2026-10-21 — проверенный кандидат для CI

- PASS: ещё 2 suite / 96 тестов API и installed-version identity. Standalone сообщает собственную native APK version через прежний wire header; обычный MTM сохраняет профиль версии.
- PASS: transpile syntax для двух новых React entry/navigation файлов и git diff --check. Полный semantic typecheck остаётся обязательным в CI.
- CRM E2E 39556643325 SUCCESS. Детальная сводка/артефакт ещё читаются; число кейсов пока не заявляется.
- Запущен штатный read-only encrypted access workflow 39558332501 для marker-owned phone fixture. Только public recipient key уходит в CI; private key и plaintext остаются в private tmp. Current main/deployed SHA прочитаны через API, не выдуманы. Это не deploy и не сброс пароля.
- Следующий шаг по поручению отдельного выпуска: checkpoint и публикация только dedicated feature branch для hosted APK сборки. Main/production CRM не изменяются. APK ещё не собран/не установлен; Maestro на новом приложении NOT RUN.

## 2026-10-21 — первая CI проверка и связь с телефоном

- Feature checkpoint 4d40492 опубликован в origin/codex/attendance-standalone для отдельной APK сборки; main не изменялся. CI 39558502859 завершился FAIL: все 269 suite / 2351 assertions PASS, 1 todo, но два существующих suite оставляли VirtualizedList timers после окончания. TypeScript/APK не запускались вследствие exit 1. Добавлен teardown renderer в tasks-screen-list и night-mode-live-switch. Первый локальный cold-cache запуск превысил 5s; ограниченный повтор после прогрева: 2 suite / 9 PASS, exit 0, без late logs.
- Android найден официальным Maestro через loopback TCP relay 5037 → существующий 35037. Остановлен только собственный пустой локальный ADB server; подключение Mac/телефона сохранено. Maestro использует ADB transport для driver sockets, отдельный пользовательский tunnel не нужен.
- CRM E2E 39556643325: 64 PASS / 0 FAIL / 5 NOT_RUN (physical permissions, external email delivery, camera+QR+offline replay, overnight soak, all control combinations). Existing MTM emulator 39556842312 SUCCESS: login/navigation/theme/logout, без attendance writes, версия 3.11.49; это не standalone evidence.
- Encrypted fixture access 39558332501 FAIL: production сменился с ожидаемого db471dc на 092221a2 за время выполнения. Read-only guard не ослабляется; повтор будет привязан к актуальной версии. Прямой зарегистрированный SSH alias отказал по ключу, обходов и изменений production нет.
- Новый APK пока NOT RUN/не установлен; следующий шаг — повтор CI после исправления teardown, затем physical acceptance.

## 2026-10-21 — CI проверки пройдены, PR и runtime coverage

- Checkpoint6eccb0a опубликован; CI39559382298 прошёл полный Jest и TypeScript и выполняет Android assembleRelease. APK ещё не получен.
- Добавлены четыре исполняемых runtime regression: refresh после foreground/network; отсутствие автоматического OS location запроса; остановка queue после отзыва grant; запрет очереди для AGENT/чужого tenant. Все4 PASS локально в текущем дереве.
- Последние версии request-validation и request-submit повторно прошли Maestro2.11.0 check-syntax. Добавлен README с подготовкой, точными командами, fixture/credential guards и различием UI/API/physical evidence.
- Draft PR https://github.com/rashadoni/leaddrive-mtm/pull/196 создан и прикреплён к чату. GitHub connector вернул integration403, штатный gh доступ успешно создал PR. PR не merged.
- CRM evidence и append-only journal checkpoint f69404409 сохранены в отдельном CRM worktree; не опубликованы.
- Повторный read-only fixture access39559414505 привязан к current main8f0833c и serving092221a2, ожидает hosted runner. Предыдущий accessFAIL остаётся в истории.
- Точка продолжения: дождаться APK и зашифрованного fixture access; установить только com.leaddrive.attendance, выполнить физические Maestro сценарии. Runtime-test/doc checkpoint не требует изменений production.

## 2026-10-21 — отказ bootstrap и состояние ADB

- Найден UI дефект standalone navigation: отсутствие data ошибочно означало pending даже после terminal disabled/unavailable. Исправлено на использование фактического access state, чтобы показывать отказ и retry. Два настоящих rendered navigation теста перехода pending → disabled/unavailable с нажатием retry PASS.
- ADB tunnel35037 перестал отвечать на host:version, device-list и shell; loopback relay исправен, но upstream молчит. Никакие MTM данные/пакеты не менялись. Доступного Mac SSH alias нет. Физическая установка/проверки пока NOT RUN; повторная проверка связи после готовности APK.
- CI39559382298 всё ещё собирает предыдущий APK; новый source fix требует следующей сборки. Новые tests checkpointf987efc пока локальны.

## 2026-10-21 — APK артефакт и независимый канал телефона

- CI39559382298 SUCCESS: signed standalone APK1.0.0/1002, source6eccb0a, SHA25694ad7de0ca75f8dcecc1b3af2dc889b5b142f38531ba9e08c871c35eb1d68f60. Скачан/проверен checksum; это промежуточный кандидат до исправления refusal screen.
- New source2765d19 опубликован. CI39560801782: 271 suite/2357 PASS, 1 todo; TypeScript FAIL только в новом navigation test mock (Promise<void> вместо Promise<RouteFieldAccess>). Mock исправлен на типизированный результат; новый CI обязателен.
- Подтверждено, что35037 удерживает SSH соединение со вчерашнего дня. Пользователь запустил независимый SSH без ControlMaster на35038; ADB protocol/device-list PASS. Наш relay5037 и приватный login helper переведены на35038. Старое SSH не уничтожалось.
- Fixture access39559414505 остановился из-за изменения main за11мин ожидания runner; fresh read-only run39560883644 успешно прошёл verify и ожидает production lock для deliver. Guard не ослаблен, backend не изменялся.

## 2026-10-21 — первый реальный Maestro PASS

- На восстановленном телефоне MTM уже3.11.49/1710 (обновление произошло вне действий этой задачи; предыдущая3.11.42 больше не baseline). Новая baseline сохранена приватно.
- APK1.0.0/1002 установлен как com.leaddrive.attendance рядом; Android UID отличается от MTM, фоновое location permission отсутствует. MTM не переустанавливался этой задачей.
- Первый Maestro first-launch FAIL: eraseText стирал только перед курсором и оставлял хвост длинного company. Исправлен сценарий: штатная кнопка очистки, assert exact input. Повтор на S23 Ultra/Android16 PASS за142.376s: бренд, пустая компания, неизвестная компания, реальная fictional company, пустые credentials. Login password ещё не вводился. UI locale RU.
- Добавлен новый first-launch flow; text selectors экранируют literal punctuation. Date fields request-submit ставят курсор после короткой даты и проверяют полное введённое значение. Эти flow-изменения ещё не отправлены, чтобы не перезапустить незавершённую APK сборку.
- CI39561343463 SUCCESS для cb08fff:271 suite/2357 PASS,1todo; TypeScript, Android, actual package/permission/signature gates PASS. Финальный APK artifact скачивается, после checksum будет update поверх отдельного приложения.
- Encrypted access39560883644 FAIL: пока ожидал production lock, другой deploy сменил serving092221a2 на8f0833c. Никаких обходов guards; дождаться окончания уже идущих чужих deploy перед новым read-only запросом. Рабочий день/заявки на телефоне пока NOT RUN без доступа к fixture.

## 2026-10-21 — финальный APK установлен, восстановление после USB drop

- Скачан, checksum проверен и установлен update com.leaddrive.attendance1.0.0/1004, sourcecb08fffa6d75fcfc11e17c6d26ea3361e4c41709, SHA25692725d779703771513f32d88aafeee12889b502f384cb3381f69de902682487c. Подпись/permissions/package gate и обычная MTM regression APK сборка PASS вCI.
- На1004 начат company-switch Maestro: бренд, сохранённый fixture domain и переход к выбору компании прошли. Общий flow FAIL из-за DeviceServerDied/ADB device not found во время ввода; не выдаётся за полный PASS. ADB35038 автоматически снова видит device. Восстановить unsigned fixture company UI и повторить этот flow; данные приложения не очищать.
- Core employee workday/requests/HR decision всё ещё NOT RUN: пароль fictional fixture не получен. Production workflows39560154512(d73f9c23) и39560805220(91cfef9e) ещё queued/in-progress. Не запускать новый access вслепую: он связан с текущим SHA и production lock; дождаться стабильного serving/current main и нового guarded encrypted receipt.
- Приватные подготовленные helpers: phone_login.py (ввод секрета без логирования), fixture_probe.py (проверяет office/admin identity и сохраняет baseline), fixture_decide.py (только exact marker-owned pending request). Ни один helper ещё не выполнял credential login/attendance writes. Private tmp: /mnt/HC_Volume_106454338/codex-alt-data/tmp/mtm-maestro-device-20261021.
- Root relay process session78265 связывает5037→35038. Maestro private installation/JRE прежние. Все user-required command blocks даны копируемо; последнее подтверждение35038 получено, повторно пользователя не спрашивать при восстановленной связи.

## 2026-10-21 — final APK company/restart PASS

- Checkpoint879faac сохранён: company-switch flow. Финальный APK1004 sourcecb08fff реально прошёл company-switch на S23 Ultra/Android16:203.668s, exit0. Сохранение компании после restart, switch company, empty/unknown company и empty credentials PASS. Предыдущий USB failure не удаляется из истории.
- Все PR196 checks на cb08fff PASS: attendance-apk, ordinary build-apk, scope, tests. Последующие локальные commits меняют только Maestro/docs; runtime APK source остаётся cb08fff.
- README уточнён для initial company selector и configured login. Название request-submit больше не предполагает browser HR: фактический транспорт решения будет явно записан.
- Deploymentd73f9c23 завершил production/smoke, serving подтверждён public build-info. Guarded read-only access39564939239 запущен с main91cfef9e / servingd73f9c23; verify выполняется. Deployment91cfef9e ещё на build, pending production jobs на момент dispatch отсутствовали. Не отменялись чужие jobs, main/backend не изменены этой задачей.
- Точка продолжения: encrypted access → private office/admin identity baseline → UI login → employee smoke, validation, fresh workday, unique request, exact HR decision and phone observation. Attendance writes пока не выполнялись.

## 2026-10-21 — fixture access and real UI sign-in

- Guarded encrypted access39564939239 SUCCESS for servingd73f9c23/main91cfef9e. Recipient fingerprint, envelope tenant/source and marker validated; plaintext exists only in mode0600 private tmp. No password reset or production mutation by the access workflow.
- Real office mobile login and real Auth.js admin session verified exact fixture IDs/roles. Private probe initially used v1 for requests (404); corrected to the app's actual v2 endpoint. Complete baseline:8 requests,7 inbox items,no open/today workday; proposed2026-11-23 has no active overlap. Prior fixture history preserved.
- UI login helper first failed because keyboard covered the second field; no attendance writes. It now dismisses keyboard between fields and checks the exact email plus masked password length before submit. Actual UI sign-in on1004 PASS; office identity confirmed. No login screenshots or raw payload published.
- Physical employee smoke started. Next: count-preserving invalid request, fresh workday and HR journal check, unique remote-work request and exact HR decision observed on phone. Existing personal MTM remains untouched.

## 2026-10-21 — physical validation PASS; backend bug isolated

- Employee smoke FAIL106.704s at explanations-unavailable. Same valid token: bootstrap200/requests200/explanations401. Exact officeAttendanceMobilePath omits GET/POST explanations even on current main91cfef9e. CRM checkpoint e8af4fab3 fixes only that allowance;107 targeted auth/API tests PASS after6 RED reproductions. Additional actual-JWT E2E case checkpoint78ff19cc4, hosted execution NOT RUN. User asked once to authorize CRM push/merge/deploy per task contract; awaiting answer. Do not hide the failed tab or relax the assertion.
- Request-validation first attempt FAIL260.137s at20s scrolling timeout; screenshot showed close-form already visible. Invalid-input refusal itself passed and all8 existing server requests stayed identical. Increased scroll waits to60s for remote device latency. Full retry PASS221.86s; after-snapshot still8 unchanged requests, day still fresh.
- Actual isolated Chrome HR context opened with the verified fixture administrator/session; queue UI PASS. A bounded single browser journey is prepared for the exact phone-created request, not a full local E2E suite. hr_browser.cjs/hr_decide.cjs and owned context IDs remain private. Avoid earlier fixture_decide.py HTTP mutation: use actual browser approval, then request_receipt.py independent HTTP verification.
- Workday physical flow started; no result yet. Follow with verify_workday.py to require exactly START/PAUSE/RESUME/FINISH in the authenticated HR report and completed bootstrap. Then request-submit with markermaestro-20261021-s23-1004/date2026-11-23, browser HR approve, phone decision. Browser and phone never use real company accounts.

## 2026-10-21 — physical workday and independent HR journal PASS

- Initial workday attempt stopped before flow execution: AndroidOperationFailedException installing Maestro driver, no JUnit/no app commands. ADB device and package query succeeded; bounded retry used unchanged app/data. Workday retry PASS316.893s on APK1004: start, pause, cold restart paused, resume, cancel finish, finish, cold restart completed.
- Authenticated HR report independently agrees with employee bootstrap: VALID facts, exactly4 unique events START/PAUSE/RESUME/FINISH; cancel created no extra event. Workdate2026-10-21, worked33s, paused94s. Private receipt workday-receipt.json. Never reset or reopen this completed fictional day to rerun the same journey.
- Mobile checkpointda67214 published to the existing feature branch. CI39568294413 tests/scope PASS; separate APK39568288790 and ordinary MTM APK39568294461 still building. Installed1004 sourcecb08fff remains the physical evidence; later commits only Maestro/docs.
- PR196 body updated with actual passes and explanations blocker via REST API after old gh pr edit failed on deprecated projectCards; PR stays draft. CRM approval question still pending; source fixes remain local, no deploy.
- Before-submit recheck and actual phone request-submit started with unique markermaestro-20261021-s23-1004/date2026-11-23. Next: request_receipt.py before-hr → hr_decide.cjs (actual browser, not the older HTTP writer) → request_receipt.py after-hr → phone request-decision with localized statusОдобрена. Preserve all8 previous requests.

## 2026-10-21 — request test portability fixes and authorized server release

- Request-submit attempt1 FAIL77.193s before form: Maestro expression parser rejected brace quantifiers in the date guard. Replaced with explicit digit positions, preserving exact YYYY-MM-DD constraint. Attempt2 passed that guard but FAIL154.061s: Samsung landscape full-screen keyboard concealed the correctly populated date field. Moved keyboard dismissal before each exact date assertion. No request was submitted in either attempt.
- Fresh guarded snapshot before third attempt:8 previous requests, no run marker and no active overlap on2026-11-23. Retrying this one submission, not the completed workday.
- User explicitly approved CRM explanations fix release after green checks; earlier awaiting-approval entries are superseded. CRM PR970 opened and ready, exact head00a5ebe37; local107 auth/API checks passed again after latestmain merge. Hosted E2E39570493628 and required checks running. No server deployment yet.
- Mobile source da67214 checks all PASS: standalone39568288790, ordinary MTM39568294461, tests/scope39568294413. Installed APK remains1004/sourcecb08fff; these later commits change Maestro/docs only.

## 2026-10-21 — phone request persisted; actual HR browser decision PASS

- Third submit attempt FAIL319.233s only at final list search. The real UI created exactly1 pending REMOTE_WORK request for runmaestro-20261021-s23-1004/date2026-11-23. All8 historical rows identical. Do not blindly repeat this marker/date. Final screenshot showed oldest rows: form closure preserved deep scroll offset and downward search missed the newest row above. Updated flow to return UP to refresh, reload and then search DOWN for server-owned row.
- Actual isolated HR browser reviewed/approved the exact phone-created request, with marker note and verified version/principal. Visible «Решение сохранено» and approved status captured; independent API receipt PASS, exactly1 matching inbox notice, prior8 requests unchanged. No direct-API approval was used.
- Request-decision now targets reason/status inside exact request ID instead of demanding the entire tall card fit the landscape viewport. Physical read-only decision flow running against the existing approved request; no new writes.

## 2026-10-21 — exact Android hierarchy diagnosed; stable per-request targets

- Read-only decision Maestro FAIL165.149s at reason childOf selector. Actual guarded UI inspection after refresh shows exact marker/date2026-11-23 and «Одобрена» together. Android XML proves reason/status are siblings of the card ID under a flattened content container, not children. Earlier assumption that selecting nested text via childOf would solve landscape is superseded by this evidence.
- Added request-bound testID attributes to reason/status Text nodes (no behavior/style change); both Maestro flows now require those exact targets. Submission also retains explicit return to top after the form closes. Existing strict request/server receipts remain intact.
- A new hosted APK is required before testing these selectors;1004 cannot provide the new IDs. Existing approval will be observed again without new writes. Then one fresh unique marker/date2026-11-24 will exercise the full corrected submit flow; before snapshot must preserve all9 existing requests.
- Mobile prior headc3be284 full CI and both APK builds PASS. Next checkpoint will run the targeted screen suite locally and full verification/build in hosted CI.

## 2026-10-21 — updated APK1007 installed without data/package replacement

- Source0f6a37f96b839dbabd062f5231d7db2a083d8a27 all gates PASS: standalone build39572177288, ordinary MTM39572184734, CI39572184723. Exact standalone log:271 Jest suites/2357 passed/1todo; TypeScript, signature, manifest and package checks passed. Targeted screen27 assertions and both updated Maestro syntax checks PASS.
- Artifact downloaded, SHA2564f245e69546de884461391124943e8e953fee9625701cc90efafb32ec0222040 verified. Updated only com.leaddrive.attendance to1.0.0/1007. Standalone UID preserved, MTM package identity identical before/after, no background location permission. Initial installer receipt parser expected userId, while Android16 reports appId; corrected parser before any install occurred, then install PASS.
- Private run wrapper now binds physical receipts to the actual installed build metadata/version instead of hard-coded1004. Previous attempts retain1004 bindings. Read-only exact request decision retry running on1007; then fresh second submit marker/date, preserving previous9 requests.
- HR browser context used by this task was closed after its verified approval. Other browser contexts untouched.
- CRM PR970 merged after all five checks and65-case E2E passed; main19b27dcc, normal deployment39573591774 still building/verifying. Strict explanations smoke awaits actual rollout.

## 2026-10-21 — physical HR decision observation PASS

- request-decision-stable-ids PASS122.617s on installed1007/source0f6a37f. Cold launch, actual employee fixture, request refresh, exact request-bound reason and status«Одобрена» all passed in landscape. End-to-end chain now proven: physical submission → real HR browser approval → one server inbox notice → physical decision observation.
- Full corrected submission started under unique markermaestro-20261021-s23-1004-b/date2026-11-24 on1007. Guarded baseline includes9 existing rows and first request APPROVED; no overlap/no duplicate marker. Private helper submit_second_case.py writes second-case-receipt.json and requires all9 earlier rows unchanged. Existing first request is not replayed or overwritten.
- Server deployment39573591774 still running; await final rollout before strict employee smoke.

## 2026-10-21 — complete corrected submission PASS

- request-submit-scroll-retry full Maestro PASS234.456s on1007/source0f6a37f: exact date entry in Samsung landscape, reason, submit, form closure, return to top/refresh and actual confirmed server-row text. Independent second-case-receipt PASS: exactly1 new PENDING REMOTE_WORK request for2026-11-24; all9 previous rows unchanged. Current total10 requests; first run approved, second remains pending in the fictional tenant.
- Core physical acceptance now passed: company setup/restart, request validation, complete workday with HR report agreement, full submission, real HR browser approval and exact phone decision. Remaining strict employee smoke depends on server explanations rollout; do not mark it PASS yet.
- CRM normal deploy39573591774 still building Next standalone and running quality/security gates. No failure observed. Continue waiting for exact19b27dcc serving and then API/phone smoke; user involvement not required.

## 2026-10-21 — final smoke waits for successful explanations data

- Tightened employee smoke: after opening explanations, require an actual loaded empty-state or asked/open/written item before asserting absence of denial. This prevents an initial loading frame from being mistaken for success. Existing1007 already exposes these IDs; no runtime/APK change required. Maestro syntax PASS.
- Remaining gate is unchanged: production rollout39573591774 → exact artifact19b27dcc/ping → same office principal explanations200 → strict physical smoke. Mobile installedsource0f6a37f remains authoritative even if workflow automatically builds another artifact for this test-only change.

## 2026-10-21 — новые требования: QR, устройство, местоположение, отсутствие интернета

- Пользователь: «я тут не увидел сканирование qr», «кнопка не видная», «и еще вопросы привязки аккаунта к девайсу и сравнивание с локацией», «и еще если не будет интернета у сотрудника то как будет», «и как должно». Это расширение текущей проверки, не отмена выпуска исправления и завершённых сценариев.
- QR сейчас скрыт при выключенной политике и после завершения дня; у office fixture оба условия. Реальная камера/QR, физическая привязка, GPS и offline replay пока NOT RUN; предыдущие PASS не заменяют их.
- Проверяем текущий контракт offline: устойчивое сохранение, честный статус pending, перезапуск и отправка без дублей; QR/геолокация/привязка не должны обходиться. Не объявлять желаемое поведение реализованным до проверки.
- Deployment39573591774: build и quality gates PASS; установка exactmain19b27dcc в процессе. Сначала завершить серверный API/phone smoke на существующем office account; не сбрасывать завершённый рабочий день и10 заявок.

## 2026-10-21 — видимая QR-кнопка и найденные пределы offline

- QR control перенесён в закреплённую область под заголовком: постоянная надпись «Сканировать QR», пиктограмма, причина недоступности вместо молчаливого исчезновения. При завершённом дне/паузе/отсутствии grant/неодобренной установке/pending/conflict сканер остаётся закрыт; отозванный доступ ко всему модулю по-прежнему закрывает экран. Все3 языка.
- Targeted screen suite41 PASS. Первая команда проверки имела неверный cwd (NOT RUN); после запуска в MTMobileApp один старый assert требовал disabled вместо отсутствия при полном отзыве доступа, исправлено сохранение прежнего fail-closed поведения. Full Jest/tsc/Android NOT RUN на Contabo; далее hosted CI.
- Code inspection: bootstrap transport failure очищает data; standalone не имеет сохранённого server admission, поэтому cold-start offline закрывает вкладки. START_PENDING также блокирует следующий FINISH; полного дня offline сейчас нет. Не ослабляем auth/tenant/device guards под видом UI исправления.
- QR token действует60с и сервер проверяет срок на момент получения: долго отложенная отправка даст EXPIRED, а не VERIFIED. GPS capture предварительно читает consent с сервера; при отсутствии связи координаты не собираются. Эти ограничения должны явно отличаться от желаемого offline контракта.
- Binding использует отдельный installation ID в AsyncStorage и одобрение на пару account+installation; это не hardware attestation и не enforce одного телефона на сотрудника.
- Fictional baseline: QRfalse, device-requiredfalse,0 installation requests; существующий admin является mobileEMPLOYEE и имеет свежий день. Private snapshots сохранены. Никакие policies пока не изменены.

## 2026-10-21 — выпуск проверен на телефоне; offline воспроизведён

- Server deployment39573591774 SUCCESS и exactartifact19b27dcc подтверждён. Authenticated explanations200,10 requests unchanged. Employee smoke137.761s PASS на1007: loaded explanations/requests/inbox и cold restart.
- Ранее завершённый день уже был повторно открыт вне наших текущих действий: HR содержит исходныеSTART/PAUSE/RESUME/FINISH и дополнительныеREOPEN/RESUME, factsVALID. До текущего preflight он уже STARTED. Историю не переписывали; live smoke сравнивает фактический preflight вместо устаревшего ожиданияCOMPLETED.
- Первое отключение Wi-Fi/mobile-data остановлено до Maestro из-за Samsung global setting; исходныеWi-Fi1/data1/airplane0 восстановлены и подтверждены, тот запускNOT RUN.
- Следующий guarded airplane-mode run на1007 реально выполнил offline cold start: Maestro FAIL на отсутствии time-tab-OwnWorkday. Вкладки закрыты. Radio states restored, online recoveryPASS, текущий рабочий день и все10 заявок неизменны. Полная смена offlineNOT RUN, поскольку нет допуска к экрану. Новый positive acceptance flow сохранён вне default smoke.
- Offline contract/пробелы зафиксированы в docs/attendance-offline-acceptance.md; auth guards не ослаблялись.
- User спросил «это приложение будет отдельно от мтм?»; подтверждено: собственныйpackage/UID/icon/login/data, установлен рядом, общий backend. ОбычныйMTM этой задачей не переустанавливался.
- QR candidate8548ee2 hosted standalone39578059050 PASS; APK скачивается. Далее phone update/visibleQR и physical installation approval.

## 2026-10-21 — QR update1009; location/QR/installation contract verification

- Установлен standalone1009, source8548ee2a1de6e74ef17b806ec34c5d18fb4fe6db, SHA256e3ff29d677c3d9e5b65de365b76afe113e4afd5704b76dabb6624e5d0c6b5719. СобственныйUID сохранён, обычныйMTM identity не изменился, background location permission отсутствует. Hosted standalone39578059050, ordinaryMTM39578065585, CI39578065878 allPASS;271 suites/2362 tests PASS/1todo, tsc/signature/package gatesPASS.
- HR actual browser включил installation-required только в owned fictional tenant, baseline0 rows; после сценария вернуть исходноеfalse. Первый phone installation flowFAIL144.928s до нажатия: приложение сейчасAZ, тест ожидалRU. Server requests остаётся0. Расширены labels.js и envLOCALE для новых сценариев, язык пользователя не меняем; retryAZ в работе.
- CRM узкая проверка георасчёта, QR и installation:3files/46 testsPASS в Vitest текущего дерева. Первая ошибочная команда использовалаJest и не запустила ни одного теста (3loadFAIL/0tests); она не является проверкой продукта. Полные builds/E2E не запускались наContabo.
- Actual location policy в fictional tenant отсутствует. ЖивойGPS/consentNOT RUN: не создаём фиктивное legal-review подтверждение. Расчёты подтверждены synthetic fixtures, а не местоположением пользователя.

## 2026-10-21 — physical installation approval PASS

- Locale-aware request retryAZ на1009 PASS81.743s; ровно1 новаяPENDING installation request для прежнего office principal. Завершение/начало рабочего дня не выполнялось.
- Actual HR browser одобрил exact request с собственным test reason; independent server receiptAPPROVED. Phone decision observationPASS64.718s сAZ labels. Это доказательство approval конкретной установки, не аппаратной аттестации/единственного телефона.
- HR browser уже отозвал то же разрешение, receiptREVOKED; physical observation в работе. Затем restore originalrequiredfalse, QR camera UI и восстановление QRfalse/camera grant. В fixture0 branches и нет published location policy; optical decoding/verified QR mark и actualGPS не выданы заPASS.

## 2026-10-21 — actual camera permission defect found and fixed

- Revocation observation1009 PASS75.05s; original installation-requiredfalse restored via actual HR browser.
- QR camera flow1009 FAIL after explicit OS camera permission grant: screenshot shows workday page with the new prominent QR button, not camera preview. Scanner AppState listener closes modal when Android permission activity temporarily backgrounds it. This is a real first-use defect, not a selector workaround. QRfalse and original camera permission restored by finally; workday/requests unchanged.
- Regression RED1failed/8passed reproduced the permission-activity transition. Fix preserves modal only while its own permission request is outstanding; camera/token pause on background, actual departure still closes, and account admission is rechecked on reply. GREEN2suites/51 tests after adding revoked-account-during-permission regression.
- Hosted full checks/APK required for this runtime change; physical camera retry remainsNOT RUN until the new APK is installed. Source1009 evidence remainsFAIL; do not overwrite it.

## 2026-10-21 — синхронизация с текущим mobile main

- Пока шли проверки, origin/main продвинулся доf1bcdcb2 (обычныйMTM3.11.51/first-run guide). PR196 сталCONFLICTING; GitHub не запускал pull_request gates. Это не отказ тестов.
- Сохранёнcheckpointab213f0 с отдельной privacy-gate Maestro проверкой. Выполнен merge актуальногоmain в dedicated feature branch, без переписывания истории и без публикации ordinaryMTM. Единственный конфликтbuild.gradle разрешён сохранением MTM default3.11.51/99 и standalone conditional1.0.0/собственногоmanifest/resources. Автоматический mergeProfile сохраняет обе стороны; field guide не предлагается office shell.
- Ветка6fb27ff содержит camera-permissionfix, targeted51PASS, hosted39581953484 в работе; после integration требуется новая полная CI сборка актуального объединённого дерева. Не dispatch обычного build-apk наfeaturebranch: workflow_dispatch публикует prerelease; нужный ordinary gate должен прийти от pull_request после устранения конфликта.

## 2026-10-21 — QR visibility и privacy gate на устройстве

- qr-unavailable1009 PASS60.558s: верхняя QR-кнопка и причина недоступности видны без поиска по странице, actualAZ.
- location-policy-off1009 PASS127.602s: загруженное отсутствие опубликованной политики, нет возможности принять несуществующее согласие. Это negative privacy UI gate; не actualGPS/inside-outside measurement.
- Integration checkpointabb8a45f7f63dc5142276415d28a9627a1006bdc опубликован; PR196 сноваMERGEABLE. CI39582556141SUCCESS; standalone39582549024 и ordinaryMTM39582556235 build running. Предыдущие39581263749/39581953484 автоматически отменены собственным concurrency при новомpush, не являются failed product gates.

## 2026-10-21 — уточнение Maestro permissions и foreground проверки

- Official Maestro reference подтверждает: launchApp без permissions автоматически выдаёт все grants; это не «сохранение permissions». Предыдущий вспомогательный open-fixture-preserving-permissions назван неверно, запись superseded. Его callers вернулись к explicitall:deny, helper удалён. PASS устройства/QRvisibility/location-policyoff остаются фактическими при тогдашнихOS grants; коллекцияGPS всё время была закрыта отсутствующей serverpolicy. Не утверждаем сохранение всехOS grants в тех прогонах.
- Camera test послеHome теперь использует stopApp:false и явные permissionsall:deny,camera:allow: это возврат существующего процесса, а не cold restart, который сам уничтожил бы модалку. Будущий PASS должен доказать реальное AppState закрытие. Offline acceptance также задаёт explicitdeny.
- До нового camera run восстанавливаем известный тестовый baseline runtime grants только com.leaddrive.attendance; обычныйMTM и глобальные разрешения не меняем.

## 2026-10-21 — camera fix APK1012 установлен

- Merge sourceabb8a45 exact hosted gatesPASS: standalone39582549024, ordinaryMTM39582556235, CI39582556141.274 Jest suites/2410 PASS/1todo, TypeScript/Android/signature/manifest gatesPASS.
- APK1012/sourceabb8a45 установлен update толькоcom.leaddrive.attendance, SHA25636080dcfcec6f46bf9081d20a0cbb823d8b0adf2fd1519601b2998f8da771118. StandaloneUID прежний, identityMTM совпадает до/после установки, backgroundlocationpermission отсутствует.
- Изменённые5Maestro flows check-syntaxPASS. Camera retry1012 выполняется среальнымOSpermission иstopApp:false при возвратеизHome. Private wrapper сохраняет hashflow и ограничиваетcleanupтаймаут дочернегоMaestro, чтобыfinally могвосстановитьpolicy/grant дажеприtimeout.

## 2026-10-21 — camera retry1012 PASS и итоговая точка

- Camera flow1012/sourceabb8a45 PASS229.611s: заметная QR-кнопка, явный запрос OSpermission, настоящий native camera preview, Home, foregroundlaunch соstopApp:false, scanner/confirmation отсутствуют после возврата. Перед этим на1009 был воспроизведён реальный дефект; старыйFAIL сохранён.
- finally вернул QRfalse и исходныйcamera grantfalse. Currentworkday и10 requests идентичны before snapshot. Installationrequiredfalse restored, ownedHRbrowsercontext closed; ordinaryMTM не переустанавливался.
- Installed APK1.0.0/1012 sourceabb8a45;274 suites/2410PASS/1todo и обаAPK gatesPASS. Последующие локальные изменения толькоMaestro/evidence/docs; runtime source и подпись APK остаются прежними.
- NOT RUN: opticalQR/verifiedphysicalQRmark, actualGPS/branch measurement (нетreviewedpolicy), full offline shift (blocked by proven offlinecoldstartFAIL). Привязка account+installation approval проверена сapprove/revoke, но это неhardwareattestation/one-device enforcement.
- Пользовательское ожидаемоеoffline поведение документировано: вся смена сохраняетсялокально какpending, неизменные времена/ID, бездублейпослесвязи, серверотдельнопроверяетQR/GPS/device и показываетконфликты. Втекущемприложении полноценныйoffline не реализован; guards не ослаблялись.
- Precise stopping point: исходныйserverrelease подтверждён, QR visibility иpermissiondefect исправлены и проверены, device approval/revocation иnegative location gate прошли; остаётся реализацииoffline и отдельныйphysicaloptical/GPS acceptance. Следующее предметное действие: offline admission/ordered workday queue design and implementation, затем повтор known-failingflow.

## 2026-10-21 — итоговая проверка восстановления и завершение отчёта

- Final cleanup receipt PASS: QR и требование привязки возвращены в исходное состояние; единственная созданная тестом привязка остаётся в истории REVOKED; все 10 заявок неизменны; политика геолокации по-прежнему отсутствует; сеть телефона восстановлена; собственный HR browser context закрыт.
- PR196 обновлён итоговым описанием, остаётся DRAFT и MERGEABLE. Опубликованный checkpoint fb49a5df61b6ce10dd2b79d48b08333a22c2b631 содержит только тесты/доказательства/документацию после проверенного runtime abb8a45. На момент последнего чтения scope/tests SUCCESS; повторные build-apk/attendance-apk IN_PROGRESS. Не приписываем им результат предыдущей сборки. Установленный APK1012/source abb8a45 уже имеет собственные успешные полные CI и обе Android сборки.
- Последняя локальная фиксация — только этот append-only журнал; повторная публикация и сборка документации не требуются. Мобильная ветка не слита и публичный релиз не выполнялся.
- Итог для пользователя: отдельное приложение установлено рядом с MTM, сервер общий. QR-кнопка и camera permission исправлены, основные employee/HR сценарии и отзыв привязки проверены. Полноценный offline пока не реализован; actual GPS и optical QR остаются NOT RUN.
- Точная остановка: тестирование и отчёт завершены с зафиксированным offline FAIL. Следующая продуктовая работа: реализовать безопасный офлайн-доступ и последовательную очередь полной смены, затем повторить провалившийся сценарий; реальный QR/GPS проверить отдельно при наличии корректно настроенной площадки и политики.

## 2026-10-21 — пользователь поручил включить QR и завершить проверку

- После объяснения причины неактивной кнопки пользователь ответил «начинай» на настройку тестового рабочего места и полный путь QR → запись отметки. Включение QR в принадлежащей задаче fictional компании теперь является целевым состоянием; прежнее обязательное восстановление QRfalse для camera-only тестов superseded.
- План: сохранить baseline, создать явно тестовую площадку без настоящих геоданных, включить QR и подтвердить доступность на телефоне; проверить выдачу короткоживущего кода, optical scan и серверную квитанцию. Существующие события не удалять и не переписывать. Геолокацию не включать и фиктивное согласие не публиковать.
- Телефон доступен на прежнем ADB35038. Установка1012 остаётся прежней. Пользователь нужен только если потребуется физически навести камеру на отдельный экран; подстановка payload не будет выдана за optical test.

## 2026-10-21 — QR включён для самостоятельного тестирования

- Через authenticated administration API создана одна площадка «Тестовое рабочее место QR» и назначена fictional office employee. Адрес явно помечен как вымышленный, координаты 0/0 условные; сбор геолокации и согласие не включались. Сохранены request IDs для идемпотентного повторения, baseline и server receipts в private tmp.
- Через настоящий HR browser UI включён attendanceBranchQrEnabled. Проверены switch=true, выдача изображения, единственная площадка и server directory; bootstrap телефона содержит QR version1 и grant=true. QR оставляем включённым по новому поручению пользователя.
- Новый preflight обнаружил PAUSED: HR7 событий START/PAUSE/RESUME/FINISH/REOPEN/RESUME/PAUSE, factsVALID. Последний PAUSE возник до наших текущих действий. На телефоне причина QR-disabled именно перерыв; создание площадки и настройка не изменили день или 10 заявок.
- Добавлен явный write flow qr-optical-mark: проверка fictional account, возобновление при PAUSED, OS permission, настоящая камера, ожидание optical scan, FINISH и VERIFIED branch receipt. Maestro2.11.0 check-syntax PASS; physical optical пока NOT RUN. Токены не подставляются через API/clipboard/hooks.
- Пользователю отправлен единственный необходимый физический шаг: навести заднюю камеру на другой экран. Пока ожидается готовность, история не переписывается и отметка FINISH не отправляется.

## 2026-10-21 — кнопка активна; физический шаг ожидает пользователя

- На телефоне выполнен только RESUME существующего fictional дня. Проверено независимым HR report: прежние 7 событий полностью идентичны, ровно 1 новое RESUME, factsVALID, статус STARTED. Все 10 заявок совпадают с baseline.
- UI hierarchy подтверждает office-workday-qr enabled=true; screenshot qr-enabled-ready-1012.png просмотрен: зелёная QR-кнопка наверху, день идёт, правильный fictional employee. QR-настройка остаётся включённой, площадка назначена. Камера и FINISH в этой фазе ещё не запускались.
- Новый assisted optical flow сохранён в checkpoint8516ada, syntaxPASS. Сборка APK/полный E2E NOT RUN: runtime не изменялся; нужная проверка здесь — реальная оптика. Код выдаётся с TTL60с, поэтому свежая картинка будет создана только после готовности пользователя.
- Точная остановка: ожидается ответ на async запрос о физическом наведении задней камеры на экран Mac. Это действие невозможно выполнить удалёнными инструментами. Следующее действие: preflight текущего дня → Maestro qr-optical-mark → свежий QR → optical scan → независимая проверка ровно 1 FINISH, VERIFIED QR и неизменности истории. Нельзя считать этот шаг пройденным по успешному открытию камеры.

## 2026-10-21 — запуск optical acceptance после готовности пользователя

- Пользователь ответил «начинай», затем восстановил подключение Mac новым tunnel35039. Прежний35038 принимал TCP, но не отвечал ADB;5037 был закрыт. После ограниченных повторов35039 подтвердил1 authorized device. Private transport helpers переключены на проверенныйпорт; собственный loopback relay5037 поднят для Maestro.
- Server preflight PASS: QRenabled, назначенная площадка, тот же STARTED день, ровно8 прежних событий, все неизменны иfactsVALID. FINISH ещё не отправлен. Пользователь готов физически навести телефон; запускается qr-optical-mark на установленном1012.

## 2026-10-21 — восстановление служебного Maestro после обрыва

- Первый запуск qr-optical-mark-1012 остановлен exit143: gRPC view hierarchy завис, приложение оказалось за launcher; optical/FINISH не выполнялись. Это инфраструктурная остановка, не доказанный product FAIL. Собственный Java process group завершён, force-stop выполнен только для dev.mobile.maestro/dev.mobile.maestro.test.
- После перезапуска служебного процесса UI hierarchy снова доступна: правильный fictional employee и QR control; экранAwake, keyguardshowing=false. Запущен отдельный qr-optical-mark-retry-1012 с прежним sourceabb8a45 и flow hash6f848b0fdfadd2f224a5f2973e53f3f8f892eb7152459268208042a5e04b62b6. Тесты не подменяются manual token injection.

## 2026-10-21 — узкая подготовка разрешений для remote ADB

- Второй запуск qr-optical-mark-retry-1012 остановлен exit143 до QR: Java stack показал AndroidDriver.setAllPermissions → AndroidAppFiles.getApkFile → Dadb.pull. Открытый временный APK содержал только9.37MB после длительного ожидания; это медленная пересылка APK, не product failure.
- Optical flow теперь задаёт явный permissions map CAMERA/FINE_LOCATION/COARSE_LOCATION=deny вместо общего all=deny. Остальные grants не меняет; map не опускается. Семантика specific permissions сверена с официальными https://docs.maestro.dev/reference/commands-available/launchapp и https://docs.maestro.dev/maestro-flows/flow-control-and-logic/permissions . SyntaxPASS.
- Третий отдельный запуск qr-optical-mark-specific-permissions-1012 начат. Во время Maestro не запускаем параллельный uiautomator dump, способный конфликтовать с UI automation; готовность камеры проверяется screenshot. Полный результат ещё не получен.

## 2026-10-21 — переход к прямому physical UI acceptance

- Третий Maestro запуск specific-permissions остановлен exit143 после повторной задержки driver/device-info. Ни один из этих трёх запусков не доказал optical scan или FINISH. Причина первой задержки не установлена окончательно; конфликт отдельного UIAutomator dump был гипотезой, не подтверждённым диагнозом. Второй APK pull подтверждён stack/файлом.
- Через прямой Android UI automation после закрытия instrumentation подтверждён fictional account, нажата активная QR-кнопка, выполнено настоящее OS разрешение камеры. Camera view visible=true, confirmation=false. API/clipboard/test-hook подстановки QR нет.
- Запущен bounded240s private watcher: ждёт реальный Kod oxundu/attendance-qr-confirm, нажимает подтверждение один раз, затем требует ровно1 новыйFINISH/VERIFIED QR в независимом HR report. Свежий QR сTTL59с выдан штатным API и показан пользователю в чате для физического наведения телефона. Результат пока ожидается; это directUI E2E, не MaestroPASS.

## 2026-10-21 — optical ожидание завершилось без считывания

- Direct UI watcher завершился INCOMPLETE/TimeoutError после240с: opticalScan NOT_RUN, confirmationTapped=false, serverVerifiedMark NOT_RUN. Пользователю показаны2 последовательно обновлённых QR. Ни токен, ни отметка не подставлялись программно. Не установлено, была ли камера физически направлена на видимую картинку: это не достаточное основание для product FAIL или PASS декодера.
- Async вопрос о видимости QR и физическом наведении остаётся без ответа. Open-in-Codex для картинок вернул queued; это не доказательство, что пользователь видел изображение. На следующем шаге сперва подтвердить видимость/готовность, затем открыть камеру и выдать новый короткоживущий код.
- Камера закрывается и исходное разрешение восстанавливается; QR-настройка и площадка сохраняются включёнными. Контроль истории после cleanup выполняется отдельно. Точная остановка — физическое считывание не подтверждено, FINISH не отправлялся; следующая работа зависит от ответа пользователя о наведении/видимости.

- Cleanup подтверждён PASS: камера закрыта, исходный CAMERA grantfalse восстановлен, QR policytrue и кнопкаenabled=true. ДеньSTARTED, все8 событий и10 заявок неизменны, новыхFINISH0. Собственный loopback relay оставлен доступным для продолжения; активных Maestro/watchers нет.
- Последняя фиксация содержит только test/docs/evidence; приложение1012 и production не изменялись. Full build/полный E2E NOT RUN: нет runtime изменения, physical optical остаётся отдельной незавершённой приёмкой. Следующий шаг — ответ пользователя о видимости кода/наведении, затем fresh QR и подтверждение.

## 2026-10-21 — реальное считывание с истёкшим QR; подготовка живого экрана

- Пользователь подтвердил «Камера направлена на QR». Transport35039 и8 событий baseline подтверждены. Direct UI ready retry реально увидел Kod oxundu в16:07:54.970Z и нажал confirmation один раз. HR подтвердил ровно1 новыйFINISH, прежние8 событий/10 заявок неизменны, factsVALID, деньCOMPLETED.
- QR evidence=EXPIRED, геоNO_CONSENT. Positive VERIFIED acceptance не пройдена. Показанный новый QR имел окно16:07:41–16:08:41Z; claimedAt16:07:55.413Z иserverReceivedAt16:08:11.514Z входят в это окно. По контракту EXPIRED означает выход времени получения за окно реально считанного кода; это указывает на считывание прежней картинки. Raw scanned token не читается/не сохраняется, точное соответствие картинке не утверждаем.
- Negative result сохранён, история не переписывается. Пользователю явно сообщено о возврате fictional дня в работу для повторной проверки через живой экран. Reopen должен оставить FINISH в журнале, а не стереть неудачную попытку.
- Для устранения статичной устаревшей картинки подготовлен временный QR-only viewer на loopback Contabo; только owned fictional branch. Официальный cloudflared2026.10.3 скачан в private tmp, SHA256053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0 сверён с GitHub asset digest. Quick Tunnel только для временной приёмки, не production deployment; срок20мин, закрыть после теста. Непредсказуемый путь, no-store/no-referrer, backend credentials остаются на сервере; браузеру выдаётся только короткоживущий QR. Политика TTL60с не меняется.

## 2026-10-21 — повтор через автоматически обновляемый QR

- HTTPS viewer проверен HTTP200 + PNG data URL; открытие Codex browser panel вернуло queued, поэтому пользователю также дана прямая ссылка. Нельзя считать queued подтверждением видимости. Временный URL и ключ не сохраняются в Git.
- На физическом телефоне нажата штатная кнопка возврата в работу. Независимый HR report подтверждает прежние9 событий неизменными и ровно2 новых REOPEN/RESUME, factsVALID, деньSTARTED. Новая неизменяемая baseline содержит11 событий; исходная baseline8 не перезаписана.
- Запущен ограниченный240с direct UI optical watcher для свежей страницы. Это самостоятельный physical E2E, не MaestroPASS. Ожидается реальное Kod oxundu, одно подтверждение и независимая VERIFIED квитанция; никакой подстановки token.

## 2026-10-21 — свежая optical попытка дала INVALID, диагностика продолжается

- Пользователь подтвердил «Вижу QR в камере». Android camera service ACTIVE и PreviewView STREAMING без camera errors; чёрное поле в удалённом screenshot не доказывает чёрную картинку на физическом дисплее.
- Direct UI watcher увидел реальное считывание в16:19:36.239Z и подтвердил один раз. НовыйFINISH claimedAt16:19:36.703Z, received16:19:38.536Z, QRstateINVALID, геоNO_CONSENT. Серверная VERIFIED приёмка по-прежнему не пройдена. Старые11 событий сохраняются; источник считанного token не захватывался, нельзя утверждать его тождественность живому viewer.
- Bounded Chromium проверка viewer PASS: PNG реально декодирован браузером, visible=true, naturalWidth>200; собственный context закрыт. Независимый ZXing декодер PNG текущего viewer подтверждает mtmq1, длину326, формат подписи, нужный branchId, TTL60сек. Это проверка display-format, не серверной подписи и не opticalPASS телефона.
- Read-only SSH к зарегистрированному leaddrive-prod отклонён publickey; маршруты и ключи других проектов не использовались. Диагностика продолжается штатными fixture API.
- Для разделения серверной и optical причин подготовлена одна bounded API проверка на другом существующем fictional office principal (admin mobile EMPLOYEE), у которого bootstrap.workday=null. ЦельSTART/FINISH свежим QR, оставить завершённый synthetic день и все события. Это явно NOT optical.

## 2026-10-21 — полный physical QR → VERIFIED PASS

- Backend diagnostic: первая synthetic API START отклонена до записи из-за ошибки private harness — installationId без обязательного rf-. Исправленная отдельная попытка на другом fictional EMPLOYEE дала START/FINISH QR=VERIFIED, finalCOMPLETED. Это API evidence, не optical; записанные2 события сохранены. Сотрудник на телефоне не подменялся.
- Повторный штатный UI возврат основного fictional дня оставил12 прежних событий и добавил REOPEN/RESUME. Baseline14 сохранена отдельно. Третий actual optical scan наблюдался16:25:47.613Z; одно нажатие confirmation, FINISH claimed16:25:48.076Z, received16:25:50.749Z, QR=VERIFIED, филиал «Тестовое рабочее место QR».
- Независимый HR report: ровно1 новыйFINISH, все14 предыдущих событий идентичны, factsVALID, completedAt совпадает с bootstrap; все10 заявок неизменны. Final15 событий сохраняют обе предыдущие попытки EXPIRED/INVALID. Phone UI hierarchy содержит Gün tamamlanıb и Filial QR ilə təsdiqləndi. Токен не подставлялся через API/clipboard/hooks в physical попытке.
- Причина прежнего INVALID точно не установлена: raw scanned token не захватывался. Успех свежего physical сканирования и API диагностики не доказывает, какую картинку считал предыдущий раз. Не записываем неподтверждённую причину как исправленный product defect.
- InstalledAPK1012/runtimeabb8a45 не менялся. Direct physical UI E2E PASS; отдельный Maestro optical flow остаётся NOT RUN (3 ранее прерванных инфраструктурных запуска). Предыдущий Maestro qr-camera PASS229.611s остаётся самостоятельным результатом.
- Cleanup PASS: QR-only viewer и собственный tunnel закрыты, loopback38765 не слушает; CAMERA возвращён к исходному grantfalse, Wi-Fi/mobile-data/airplane1/1/0 подтверждены. QR policytrue и тестовая площадка остаются по поручению пользователя. Основной fictional деньCOMPLETED, поэтому QR-кнопка disabled по правилу завершённого дня; это не возврат к policyfalse. Собственный ADB relay оставлен для дальнейшей работы.
- Full build/полный E2E NOT RUN: runtime не менялся; heavyweight проверки на Contabo запрещены. Сохраняется ранее доказанный offline coldstartFAIL и physicalGPS NOT RUN (нет опубликованной проверенной политики). App1012 не считается готовым к полноценной offline смене.
- Точная остановка: текущая physical QR приёмка завершена успешно и временный доступ закрыт. Следующее предметное направление общей задачи — offline admission + ordered full-workday queue, затем known-failing offline flow; GPS требует корректной политики и реальной площадки.

- После восстановления CAMERA grant приложение открыто заново. Прокрутка до квитанции и просмотр screenshot подтверждают видимые Filial QR ilə təsdiqləndi + имя тестовой площадки. Sanitized screenshot безQR/token/serial сохранён docs/evidence/attendance-qr-verified-1012.png. JSON validation и git diff --check PASS; checkpoint содержит только docs/evidence, приложение не пересобиралось.

## 2026-10-21 — пользователь поручил реализовать офлайн-смену

- После успешного physical QR пользователь ответил «делай» на следующий шаг: исправить полный офлайн и повторить проверку без сети. Продолжаем тот же worktree/branch; сохраняем common backend и отдельное приложение. Старый temporary QR viewer закрыт, его ambient browser tab не является новым поручением открыть tunnel.
- Safety plan: ограниченный кэш последнего успешного допуска только для собственного office account, привязанный к серверу/session/installation; срок24часа от онлайн-проверки, без продления при сетевых ошибках. Данные остаются локальными ожидающими отметками, сервер заново проверяет права/привязку/QR/GPS перед подтверждением. Серверный отказ удаляет допуск; field execution не получает автономных прав.
- Очередь должна позволять START→PAUSE→RESUME→FINISH и восстановление после перезапуска. Отправка office workdays строго по порядку с остановкой зависимых событий при unknown response/backoff/conflict. Исходные ID/времена сохраняются; queued events являются источником восстановления после crash между queue и UI projection.
- Проверки: targeted admission/ordered queue/reconciliation/privacy tests последовательно на Contabo после resource preflight; полные Jest/typecheck и Android build толькоCI. Затем установка только com.leaddrive.attendance и физическая смена безсети с server HR verification и network cleanup. ПолитикаGPS/согласия не подделывается; offline QR не обещает VERIFIED послеTTL.

- Реализован кандидат offline admission + ordered workday queue: новый session nonce, локальный24h snapshot, сохранённые own installation/consent receipts, восстановление UI из очереди и полный цикл без подтверждённогоSTART. Полевая роль не получает offline office rights; server denial закрывает кэш. Телефон доступен через35039.
- Targeted текущего дерева:3suite/25PASS;7suite/137PASS;9suite/203PASS (наборы частично пересекаются, числа не складываются). После нового API-binding теста обнаружен дефект test mock import, исправлен; attendance-api17/17PASS. office-attendance-sync повторноPASS. Один запуск Jest из неверной корневой папки не стартовал; повтор изMTMobileApp прошёл. Полные Jest/typecheck/Android локальноNOT RUN — выполняютсяCI согласно host contract.
- Подготовлены offline-access regression и offline-shift explicit write journey с restart между действиями, собственным fixture guard и независимой HR проверкой. Новый physicalPASS пока не заявлен. Следующий шаг: checkpoint → hostedCI → SHA-bound APK → физическая смена.

- Checkpoint be4be722a7d120f9f495c0026fb8047eec1f7d35 опубликован в существующую draftPR196. CI39637913503SUCCESS; standalone39637906847 прошёл полныеJest/typecheck и дошёл доAndroidbuild. На post-implementation review обнаружен дополнительный переход: при потере сети живое online admission могло использоваться до следующего refresh. Добавлены немедленный refresh на offline event и синхронный запрет capture на stale live admission; valid bounded offline snapshot нужен до записи. Targeted3suite/28testsPASS. Требуется новая сборка этого окончательного дерева.
- Для physical full shift выбран только owned fictional tenant: временный timezone Pacific/Kiritimati даёт свободную дату2026-10-22, исходныйAsia/Baku сохраняется и восстанавливается вfinally. Phone clock/locale не меняются. На2026-10-21 зафиксированы15 прежних событий и10заявок; они не удаляются. Пока timezone mutation не выполнена.

- CI39638693450 на771626e обнаружил один harness failure: unit inbox импортировал native AsyncStorage через новую зависимость session guard. Остальные274suite/2425testsPASS; это не UI/серверный отказ. Добавлен явный online sync-status mock в изолированном inbox тесте; targeted6/6PASS. ПолныйCI перезапускается на новом checkpoint.
- Maestro read-only transport check на установленном1012PASS после перезапуска только служебного driver; никакие отметки не создавались. Сеть и timezone пока исходные. Устаревшие build jobs be4be72 отменены для освобождения hosted worker.

- Окончательный runtime checkpoint771626e; test-harness checkpoint a3d03717d8c80161717af51153ffe692eee89ef8. CI39638977894SUCCESS. Standalone39638966536 и ordinaryMTM39638977857 строятся. Автоматическая установка допускается только после успеха CI+standalone и проверки SHA-bound artifact; итог ordinaryMTM тоже требуется перед завершением задачи.
- Bounded physical harness сохранён в private tmp: snapshot originalsettings/radios, exactfictional ownership, временная свободная дата, offline coldstart+fullshift, отсутствие серверных записей до возврата сети, replay4events/исходныеtimes/старые15events/10requests, no duplicates послеrestart, finallyвосстановление. Неисполненный harness не считаетсяPASS.

## 2026-10-21 — установлен1016; полная офлайн-доставка подтверждена

- Hosted gates на a3d03717d8c80161717af51153ffe692eee89ef8: CI39638977894SUCCESS (275suite/2431PASS/1TODO +TypeScript), standalone39638966536SUCCESS, ordinaryMTM39638977857SUCCESS. APK1016 SHA25664d06cc49a5881de80688ff339fc06dc2d6d9f9e9e03e2585e1699e06d40407a установлен черезupdate отдельногоpackage; UIDсохранён, com.mtmobileapp identityнеизменна.
- Physical Maestro2.11.0: offline-accessPASS15.012s; full offline-shiftPASS85.017s. Телефон в авиарежиме, Wi-Fiвыключен, active default networkNONE. START/PAUSE/RESUME/FINISH иrestartмеждукаждымдействием/послеFINISH прошли. На сервере до возврата сети новыхсобытий0; затемровно4 в томже порядке, claimedAt17:09:13.883/21.755/35.757/54.877Z, received17:10:34–36Z. Все15прежнихсобытий и10заявок сохранены. Сеть иMtmtimezoneAsia/Baku восстановлены.
- Важно: первоначальный combinedharness overallFAIL наHRfactsState, не мобильныйPASS всего табеля. ВременныйMtmtimezonePacific/Kiritimati дал workDate2026-10-22, но immutable baseline attendance rule mtm-default-v1 остаётсяAsia/Baku. Отчёт правильно считает будущуюдатуWORKDAY_INCONSISTENT. Отдельный проверенный receipt фиксируетPASScapture+delivery иNOTPASSрасчёта этойsyntheticдаты. События не переписываются; исторические правила не обходятся. Рекомендация о сменеtimezoneкакполномHRfixture в предыдущем плане superseded: заранее требуются согласованные publishedrule/tenanttimezones.
- Для завершения HR-проверки запущен отдельный current-day сценарий: штатныйUIвозврат сегодняшнегоownedfictionalдня сохраняет15прежнихсобытий и добавляетREOPEN/RESUME; затемofflinePAUSE/RESUME/FINISH сrestart и независимойпроверкойVALID наAsia/Baku. Это не выдаётся за второйofflineSTART. Новыхучётныхзаписей/политик/согласий не создаём.

## 2026-10-21 — current-day HR acceptancePASS; завершение offline

- Дополнительный Maestro offline-existing-shiftPASS на1016: сегодняшняя уже начатая смена PAUSE/RESUME/FINISH сrestartмеждудействиями. До возвратасети сервернеполучилниодной новойотметки; после — ровно3исходныхclaims17:15:29.112/44.733/17:16:03.046Z, received17:16:29–30Z. HRrow2026-10-21factsVALID, статусCOMPLETED. Все21предыдущихсобытие (включая4syntheticбудущих и2UIreopen) неизменны,10заявокнеизменны. Повторныйcoldstartнесоздалдублей; pending/offlineбаннерыисчезли.
- ИтогcleanupPASS: исходныеMtmsettingsAsia/Baku, Wi-Fi1/mobiledata1/airplane0, CAMERA/FINE/COARSEfalse. Всего24событиясохранены; первоначальные15неизменны. ОбычныйMTM3.11.49/1710осталсянеизменнымприобновлении; отдельное1016готовокиспользованиюсfictionalaccount. Новыеusers/policies/consentsне создавались.
- Просмотрены дваscreenshots: offline completed сявным pending иавиарежимом; online completed безpending. Онисохраненыбезsecret/QRtoken/serial. JSONevidence сохраняетстарыеFAIL иразделяетmobile/serverdeliveryPASS отfuture-dateHRNOTPASS. Дополнительныйcurrent-dayHRPASS невыдаётсязаofflineSTART.
- ПолныйbrowserE2E/AndroidbuildлокальноNOT RUN поhostcontract; полныеmobilegates выполненыhostedCI. ActualGPSпо-прежнемуNOT RUN: нетreviewedpolicy иреальнойплощадки. Overnight24hphysicalsoakNOT RUN; границы24hпровереныunitтестами.
- Следующийcheckpoint содержиттолькоMaestro/evidence/docs; runtime/android/packagefiles строгоравны a3d0371. ПовторнаяAndroidсборканеобязательнадляэтогоtest-onlyизменения; опубликованноеSHA-bound1016остаётсяпровереннымартефактом. PR196остаётсяdraft, mobilemainmerge/publicreleaseневыполнялись.

## 2026-10-21 — финальная фиксация и остановка

- Evidence checkpoint9d1d503f5bc6ceeb18b4cb594c6e0ac1d06d07e2 опубликован; PR196 описание переписано под итоговую offline реализацию и фактические ограничения. CI39642626502 на этом test-only headSUCCESS (scope/tests). Автоматические повторные Android jobs39642617674/39642626447 отменены как избыточные: git diff подтверждает полную идентичностьsrc/android/packagefiles проверенному и установленному runtime a3d0371. Их отмена не выдаётся заPASS; обе необходимые runtimeсборки39638966536/39638977857SUCCESS.
- Maestro supplementary current-day точное время64.56sPASS; остальные15.012s и85.017sPASS. ФинальныйJSONпарсится, diff--checkPASS; только существующий node_modules symlink остаётсяuntracked. CRMjournal checkpoint8e236cda7 локально; CRMcode/push/deployне выполнялись.
- Текущий результат: самостоятельное1016нафизическомтелефоне поддерживаетboundedofflinecapture, persistentfullqueue иупорядоченнуюдоставку; current-dayHRVALID, cleanupPASS. Последнее действие: опубликованытесты/evidence, проверензелёныйfinalCI, обновлёнPR. Точная остановка: runtimeиphoneacceptanceзавершены, PRdraft, initialsyntheticfutureтабельостаётсяNOTPASS. Следующее действие: fresh-day полныйHRцикл без сменычасовогопояса; actualGPS требует корректнойreviewedpolicy/реальнойплощадки. Новые просьбы к пользователю или скрытаяautomation не создавались.

## 2026-10-21 — возобновление полного цикла на свободной дате

- Пользователь поручил «начинай». Продолжение: полный offline START/PAUSE/RESUME/FINISH и проверка кадрового табеля на настоящей дате без смены часового пояса. Телефон доступен через существующее соединение; установленный runtime1016 сохраняется.
- Read-only preflight в17:24UTC: сервер и frozen rule mtm-default-v1 используют Asia/Baku, текущая дата2026-10-21. У office день закрыт (20событий), synthetic2026-10-22 также занят (4события). У admin офисная роль EMPLOYEE,2026-10-21 закрыт (2события); ближайшее потенциальное окно2026-10-22 после20:00UTC21октября, при повторном preflight.
- Проверены доступные пути подготовки: phone fixture controller фиксирует ровно3users/agents, demo fixture фиксирует историю; добавление пользователя нарушит их ownership contract. Создание отдельного tenant доступно лишь superadmin, имеющийся тестовый HR — admin. Не меняем роли, календарь, часы или историю для обхода ограничения.
- Готовим воспроизводимый read-only fresh-day guard с проверкой serverTime, действующего правила, конкретного сотрудника и HR baseline. До успешного guard сеть не отключается и Maestro write journey не запускается. Новая полная физическая смена пока NOT RUN.

- Реализован scripts/e2e/attendance_fresh_day_guard.py: свежие authenticated snapshots, exact fictional account/tenant/EMPLOYEE, совпадающие MTM/frozen-rule/HR timezone, свободный сегодняшний день, отсутствие незаконченного предыдущего дня и запас до полуночи. READY не равен PASS; CLI выводит только allowlisted metadata. verify_replay проверяет четыре последовательных offline claims, поздние server receipts, VALID completed HR и неизменную историю.
- Maestro offline-shift допускает только office/admin fictional names через FIXTURE_ACCOUNT; field и произвольные аккаунты запрещены. README больше не предлагает timezone workaround для полного HR PASS. Runtime/src/android/packagefiles полностью совпадают с проверенным a3d0371; новая APK не нужна.
- Проверки текущего дерева:13 Python guard/receipt tests PASS;7 JS fixture selector cases PASS; исторический synthetic report корректно отклонён HR_DAY_NOT_VALID. Live read-only guard17:28UTC — BLOCKED WORKDAY_OCCUPIED для обоих аккаунтов; новая физическая смена NOT RUN. Приложения1016/1710, разрешения и исходная сеть проверены без изменений; тестовых мутаций0. Evidence сохранён docs/evidence/attendance-fresh-day-preflight-20261021.json.
- Следующее возможное окно: admin mobile EMPLOYEE на2026-10-22 с20:00UTC21октября (00:00Баку,22:00Берлин). Требуется новый live preflight и UI вход в этот fictional аккаунт; расписание/фоновая automation не создавались. Office2026-10-22 уже занят прежними synthetic событиями.

## 2026-10-21 — fresh-day guard опубликован и проверен

- Мобильный checkpoint680cf52fc9a1c276dee1fb0c5f0866fd0725b3a6 опубликован в существующую draft PR196. GitHub CI39644443551: scope/tests и TypeScript SUCCESS; Emulator smoke contract39644443772 SUCCESS, включая новый Python guard. Исходный проверенный APK1016 остаётся установленным; runtime/android/dependencies идентичны a3d0371. Повторные Android39644443594/39644421845 отменены как избыточные, не считаются PASS.
- PR196 обновлён с новым guard, проверками и честным NOT RUN физической свежей смены. GitHub connector не имеет права редактированияPR (integration403); использован существующий авторизованный gh REST client. Обычный gh pr edit несовместим с удалённым Projects classic и отказал до изменения; REST PATCH завершился успешно. Это технические отказы интеграции, не отказ automatic approval. CRM journal checkpointbeff65139 сохранён локально; CRM code/push/deploy отсутствуют.
- Локально выполнены только малые targeted проверки после RAM/disk/pressure preflight. Полные build/browserE2E на Contabo NOT RUN по host contract; новая Android сборка NOT RUN, поскольку runtime не менялся. Полный мобильный CI выполнен на GitHub. Свежая физическая offline смена NOT RUN по реальному календарному ограничению; прежние результаты и FAIL сохранены.
- Текущий статус: тестовый guard готов и зелёный, новый full offline START→HR VALID ещё не выполнен. Последнее завершённое действие: проверены hosted gates, обновлены PR и evidence. Точная остановка: до отключения сети и первого START; сегодня оба owned office аккаунта заняты. Следующее действие: после2026-10-21T20:00:00Z заново проверить admin mobile EMPLOYEE и свободную дату2026-10-22, войти штатно через UI и выполнить полный Maestro+HR цикл с сохранением истории. Отложенный автоматический запуск не создан.

## 2026-10-21 — продолжение после выпуска кадрового списка

- Правка CRM-only roster завершена отдельным PR974 в leaddrive-v2, merge/deploy SHA `de44f2a3325dbdc9a89e5fe14b266010cd84dff4`, workflow39655768277 SUCCESS. Authenticated read-only production smoke:2 CRM-only rows →0;3 CRM users и mobile bootstrap сохранены. Подробный журнал: `/mnt/HC_Volume_106454338/codex-alt-data/worktrees/attendance-personnel-directory/docs/attendance-personnel-directory-session-log.md`.
- Исходная задача Maestro продолжена с сохранённой точки. Телефон доступен через прежний35039; отдельное приложение открывается под Fictional office employee, pending banner отсутствует, radios1/1/0. Worktree/branch сохранены, source/src/android не меняются; untracked node_modules symlink сохранён.
- Новый live preflight19:36UTC: оба аккаунта всё ещё WORKDAY_OCCUPIED на2026-10-21 Asia/Baku. Сеть не отключаем и новых отметок не пишем до READY на реальной дате. Готовим штатный UI вход existing fictional admin (mobile EMPLOYEE) и bounded harness, сохраняющий всю историю/заявки и исходные permissions/radios.

- Штатный UI logout из owned office без app-data reset и login в existing `admin` успешно завершены; это fictional phone administrator с mobile role EMPLOYEE, не новый аккаунт. Приватный login helper теперь принимает allowlisted office/admin; private Maestro wrapper допускает тот же FIXTURE_ACCOUNT. Source приложения/Android не менялся.
- Подготовлен bounded private harness `fresh_offline_acceptance.py`: новый live guard перед сетью, START/PAUSE/RESUME/FINISH через исходный Maestro flow с процессными рестартами, независимый HR baseline/replay, сохранение всей истории второго fixture account и заявок обоих, проверка дублей после online coldstart, finally восстановление сети/permissions. Синтаксис трёх private helpers PASS; default5037relay и35039 ADB отвечают device; RAM16GBavailable, disk152GB, memorypressure0. До20:00UTC harness отказывает до создания прогона/изменения сети.
- До наступления реального окна остаётся ожидание календаря; физический fresh-day PASS ещё не заявлен. На телефоне admin вошёл, сеть сохранена. После прогона планируется возврат к исходному office account через обычный UI, когда очередь гарантированно доставлена.

- Предварительный разбор runtime permissions обнаружил две записи пакета в dumpsys (активный Android user0 и дополнительный профиль95). Первый private probe отказал Permission state ambiguous до смены сети/создания событий. Исправлен только harness: читается блок активного user0; восстановление grants адресовано --user0. Дополнительный профиль не меняется. Device UTC clock отличается от host менее5сек; текущий stay-awake-on-USB уже2 и сохранён.

- Дополнительная предварительная несовместимость harness с Android36 исправлена до сценария: dumpsys использует appId вместо userId. Read-only preflight после исправления PASS: отдельное1016, обычныйMTM1710, active-user CAMERA/FINE/COARSEfalse, radios1/1/0. Эти ошибки относятся к диагностическому harness; приложение и факты не менялись. Финальный harness также фиксирует SHA backend до/после и проверяет часы устройства; код подготовлен, до календарного окна write journey NOT RUN.

- После UI смены аккаунта live guard19:49UTC подтвердил доступ обоих principals, но дату2026-10-21 как занятую. В19:56UTC read-only `maestro hierarchy` завершился exit0, видны Fictional phone administrator и time-tab-OwnWorkday. Это только проверка инструмента/аккаунта, не выполненная смена; START/другие отметки ещё не отправлялись. До20:00UTC остаётся ожидание календаря.

## 2026-10-21 UTC / 2026-10-22 Баку — полный fresh-day offline PASS

- Реальная дата наступила без изменения часов или timezone. Guard20:01:35UTC READY для existing fictional admin mobile EMPLOYEE, день2026-10-22 Asia/Baku. Backend SHA до/после `de44f2a3325dbdc9a89e5fe14b266010cd84dff4`. Установленный APK1016/runtimea3d0371 и обычныйMTM1710 сохранили package identity.
- Maestro offline-shift PASS70.36с: START/PAUSE/RESUME/FINISH, stop/launch между каждым действием и после завершения, явно offline/pending. До сети новых серверных событий0; затем ровно4. Claims20:02:30.105/38.879/51.878/20:03:10.047Z; received20:03:34.262/35.220/35.494/35.975Z. HRfactsVALID, повторныйcoldstartбез дублей, onlinependingисчез.
- История сохранена:2 прежних admin events и24 office events; admin0/office10requests неизменны. Radios1/1/0 и CAMERA/FINE/COARSEfalse восстановлены. В20:08UTC завершён обычный UI возврат к исходному office account; повторно подтверждены неизменные истории/заявки и отсутствие pending.
- Обе actual screenshots просмотрены: offline completed с airplane/pending, online completed безpending. Оригиналы остаются в private run directory `/mnt/HC_Volume_106454338/codex-alt-data/tmp/mtm-maestro-device-20261021/fresh-offline-realdate-20261022-v1`; в Git сохраняются sanitized receipt и hashes, без raw UI/debug/auth payloads. Новый отчёт `docs/evidence/attendance-fresh-day-full-cycle-20261022.json`.
- Уточнение прежнего состояния, не стирающее историю: до новой попытки office22 уже проецируется VALID, office21 такжеVALID; события не менялись. `attendance-report.ts` отклоняет `date > today`, поэтому наступление реальной даты снимает этот временной запрет. Предыдущее утверждение «остаётся NOTPASS» для текущей проекции superseded. Первоначальный synthetic attempt по-прежнему хранит свой фактический FAIL/NOTPASS на момент выполнения.
- ActualGPS и24hphysicalsoak NOT RUN; эта приёмка проверяет короткую полную последовательность, не24ч выдержки и неGPS. Source приложения, Android и зависимости не менялись; новые fullbuild/browserE2E NOT RUN как избыточные для evidence-only checkpoint, ранее выполненные hosted runtime gates сохраняют свои source bindings.

- Итоговая проверка evidence-only дерева: JSON отчёта точно совпадает с сохранёнными sanitized результатами физического прогона и cleanup; SHA256 обоих просмотренных снимков совпадает. Исходный объект offlineAcceptance1016 сохранён побайтно по структуре, новый PASS добавлен отдельно. `git diff --check` PASS; src/android/package/index полностью совпадают с проверенным runtime a3d0371. На Contabo доступно16GB RAM,152GB disk, memory pressure0; новых тяжёлых проверок здесь не запускали. Публикуется только продолжение тестовой документации существующей draft PR196; mobile main и публичный выпуск приложения не затрагиваются.

## 2026-10-21 — итоговый checkpoint и завершение приёмки

- Evidence checkpoint `91cfa7820689dbd20ebd71c4025e3d1049547312` опубликован в существующей draft PR https://github.com/rashadoni/leaddrive-mtm/pull/196. PR описывает фактическую полную приёмку на реальной дате и сохраняет ограничения. От remote680cf52 изменены ровно4 документа/evidence; приложение, Android и зависимости не изменены.
- Hosted CI https://github.com/rashadoni/leaddrive-mtm/actions/runs/39668816637 SUCCESS на91cfa78:275 suites,2431 PASS,1TODO, полный TypeScript. Emulator smoke contract39668816685SUCCESS. Повторный ordinary Android build39668816707CANCELLED как избыточный при неизменном runtime; это неPASS. Необходимые source-bound standalone/ordinary builds наa3d0371 сохраняют фактическийSUCCESS. Новые Android/fullbrowser проверки локально NOT RUN согласно host contract.
- CRM выпуск завершён отдельно: PR974 merged, production de44f2a, deploy39655768277SUCCESS и production smokePASS. Финальный CRMjournal checkpointa0cc1041a сохранён локально, нового deploy для журнала нет. Canonical checkout и существующий node_modules symlink не менялись.
- Текущий результат: CRM-only пользователи исключены из кадрового списка, полная физическая offline-последовательность на отдельном1016 прошла с HRVALID. Последнее действие: проверен зелёныйCI финального evidence head, опубликован отчёт, подтверждён cleanup телефона. Точная остановка: кадровый выпуск и приёмка полного offline-цикла завершены, мобильнаяPR остаётсяdraft, публичный mobile release не выполнялся. Следующее действие: реальная GPS-проверка при наличии утверждённой политики/рабочей площадки и отдельное24-часовое испытание; они остаютсяNOT RUN. Этот завершающий журнал фиксируется локальным checkpoint без очередного запуска неизменной сборки.

## 2026-10-22 Баку — начало GPS и длительной офлайн-проверки

- Пользователь поручил «начинай» после списка оставшихся GPS/24h проверок. Продолжаем из2687f80, worktree mtm-attendance-standalone, ветка codex/attendance-standalone, origin rashadoni/leaddrive-mtm; мобильного production route нет. CRM остаётся attendance-personnel-directory / codex/attendance-personnel-directory / rashadoni/leaddrive-v2, штатный production13.140.132.245:/opt/leaddrive-v2 через GitHub Actions; новый CRM deploy не планируется.
- Телефон доступен через прежний35039, Android location enabled=true, сеть Wi-Fi1/mobile1/airplane0. Существующий office день2026-10-22 завершён. Authenticated read-only проверка подтверждает отсутствие опубликованной location policy; включение требует трёх текстов и legalReviewConfirmed в серверном контракте. Подготовка не подменяет юридическое подтверждение, координаты устройства пока не запрашивались.
- План: проверить существующий physical privacy gate; подготовить контролируемый реальный24h прогон с сохранением истории/очереди, неизменными часами и гарантированным восстановлением сети; уточнить только отсутствующие фактические условия после доступной диагностики. Новая приёмка покаNOT RUN.

- Physical Maestro location-policy-off на1016 PASS129.343с; без опубликованной политики нет кнопки согласия/активации. App-only firewall probe PASS: coldstart получает offline admission, обычныйMTM остаётсяallowed, radios1/1/0 и permissions сохранены. Исходная отключённая test chain и отсутствие OEM_DENY_3 rules проверены; device-side120s recovery сработал как страховка и отменён после штатного cleanup. Оба собственных профиля standalone package подпадают под системную package-команду; правила восстановлены, другие packages не блокировались.
- Пользователь поручил добавить один тестовый филиал по координатам телефона. Создан GPS test — 22.10.2026, радиус100м, только owned fictional company; прежнийQR-филиал сохранён. Центр взят из последнего немокированного Android cached fix (возраст357.5с, accuracy100м), это исходная точка филиала, не свежая GPS-приёмка. Координаты и raw location dump сохраняются только приватно.
- После показа конкретного текста RU/AZ/EN пользователь явно подтвердил: «Подтверждаю для тестовой компании». Опубликована location policy v1 только вmtm-attendance-phone, enabled/confirmationtrue с точными согласованными текстами. Следующий шаг: штатное согласие сотрудника/OS permission на телефоне, свежий GPS при FINISH, независимая проверка места/точности/времени в HR.

- Первая GPS Maestro попытка остановлена до отметок: review выявил implicit launchApp permissions=all:allow. Runner завершён143; никаких новых workday events, история24 и10заявок неизменны, CAMERA/FINE/COARSE остаютсяfalse. Это harness FAIL/ABORTED, не product GPSFAIL. Новый flow явно начинает с deny только трёх разрешений и проверяет настоящий OS dialog; ранний receipt сохранён.

- GPS v2: согласие принято штатно, REOPEN/RESUME записаны; MaestroFAIL138.613с на проверке статуса выше текущего viewport. Реальный screenshot подтверждает работающую смену и кнопки, история24events/10requests сохранена. Исправлен scroll в test flow, новые события не удалялись.
- GPS v3 continuation: настоящий Android precise-location/foreground permission пройден MaestroPASS34.986с; FINISH доставлен, но HRlocationUNAVAILABLE. Timeline показывает8s acquisition budget истёк во время выбора точности/разрешения. Новая регрессия воспроизвела дефект:1RED/11PASS. Готовится узкое runtime исправление: отдельное ограниченное60s ожидание OS ответа, отдельные8s на GPS, прежние guard/late-answer/privacy ограничения сохранены. Проверки: целевые unit → hosted полныйCI и обе Androidсборки → установка нового standalone → повтор реального permission/GPS. Длительный soak стартует после этого, чтобы сутки проверять исправленный APK.

- GPS v4 с ранее выданным precise permission: MaestroPASS56.305с, новые REOPEN/RESUME/FINISH; HRFINISH INSIDE, расстояние28м до GPS test — 22.10.2026 при радиусе100м. Все27предыдущих событий и10заявок сохранены. Это настоящее измерение приложением, не подстановка координат в attendance API. Точка филиала не перемещалась радиPASS. Новая версия ещё нужна для первого OS prompt; на1016 этот случай остаётсяUNAVAILABLE и не переименован вPASS.
- В scripts/e2e добавлен soak receipt guard:8unitPASS, отвергает короткую выдержку, пропуски наблюдений, смену часов/boot/package, раннюю доставку, дубли и отсутствие UI доказательств по обе стороны24h. Это unit evidence, physical24h остаётсяNOT RUN до фактического запуска.

- Исправление отдельного OS-permission budget прошло4targeted suites/69testsPASS, включая новую12s реакцию человека +6sGPS, поздний ответ после60s и отзыв доступа во времяdialog. Stalled permission-check/native bridge остаются bounded8s. `git diff --check` PASS. Полные Jest/TypeScript/Android локальноNOT RUN поhostcontract; отправляются в штатныйGitHubCI натомже dedicated featurebranch. Нового serverdeploy/mobilemainmerge не требуется.

- Checkpoint5a8807041988a51b96a55d7936f9d91bb6276cbd опубликован в существующейdraftPR196. CI39673529544SUCCESS:275suites/2434PASS/1TODO и полныйTypeScript. Emulator contract39673529461SUCCESS. Standalone39673519660 иordinary39673529548 ещёстроятся; установленнымпока остаётся1016. PR описание обновлено среальнымGPS28мPASS иотдельнымпокаисправляемымfirst-permissioncase.
- Подготовлен приватный physical_soak.py: толькоreal24h, package-only firewall сdevice-side recoverydeadline, ownfixture/currentday/emptyqueue/source-bound correctedGPS gate, сохраняемыеhistory/requests, normalREOPEN передofflinePAUSE/RESUME/FINISH, каждые5минут network/clock/boot/package/serverhistory checks, реальныеUI observations до/после24h, после reconnect3originalclaims иHRDELAYED_CLAIM, cleanup. СинтаксисPASS; не запущен. Preflight refusal не меняет сетевые правила; rawbaseline/координаты не публикуются.

## 2026-10-22 Баку — продолжение исправленного GPS и подготовки суток

- Сохранённая точка35874c1 подтверждена: nativefix5a88070, CI39673529544 и emulator contract39673529461SUCCESS. Обе необходимые Androidсборки теперьSUCCESS: standalone39673519660, ordinary39673529548. Загружен SHA-bound standaloneartifact; устанавливается отдельно от обычногоMTM. Нового serverdeploy нет.
- Отзыв тестового согласия подтверждён настоящим UI: accepted/maySendLocation=false при ещё выданном OSpermission,0новыхотметок, всяистория/заявки неизменны. Затем исходныеCAMERA/FINE/COARSE=false восстановлены для повторного первого OSdialog. Приватный receipt gps-consent-withdrawal-sanitized.json PASS, время2026-10-21T20:53:46Z.
- Для24hrunner добавлена страховка на самом телефоне: восстановить доступ при отсутствии heartbeat15минут или по конечномуdeadline. HostprobeJWT хватает более150ч; USBstayawake2 и экран включены, настройкине менялись. Суточнаявыдержка покаNOT RUN, запуск только после новогоactualfirst-permissionGPSPASS.

- Исправленный standalone1019/source5a88070 установлен, APKsha256c49b591e6e18a7ce8d9e5248af395c3e72ee4becaa962895bf67f7b2b71fa661; package/UID сохранены, ordinaryMTM1710 неизменён, backgroundlocationpermission отсутствует. Настоящий first-permission Maestro v5PASS105.455с: согласие принято заново, OSprecise/foregrounddialog пройден, HRFINISH INSIDE45м отнеизменного100мфилиала. Старые30events/10requests сохранены, ровноREOPEN/RESUME/FINISH добавлены, backendde44f2a не менялся. Скриншот завершённого дня просмотрен; rawкоординаты/снимок остаются приватными, публично толькоchecksum. Предыдущие4попытки/UNAVAILABLE сохранены.
- Следующий шаг: подготовленный bounded24hrunner на1019. Перед coldrestart после REOPEN теперь явно ожидается подтверждённое UIвозобновление, чтобы не оборвать запрос. Full24h покаNOT RUN; готовится фактический запуск, безсдвигачасов ипереписыванияистории.

## 2026-10-22 Баку — суточная физическая выдержка запущена

- Реальный пакетный offline начат2026-10-21T21:07:02.633Z (22октября01:07:02Баку), correctedAPK1019/source5a88070. Подготовка штатно REOPEN/RESUME добавила2events поверх33старых; baseline35events сохранён. Maestro offline-soak-capture PASS79.233с: PAUSE/RESUME/FINISH снесколькимиcoldrestarts, completed/pending UI. Послеcapture независимыйHRbaseline неизменен; обычныйMTMallowed, radios1/1/0, boot/package/clock неизменны. Просмотрен настоящийofflineскриншот сожиданиемотправки и24hдопуском.
- Фактический runnerstatus RUNNING, неPASS. Минимальнаяточкаexpiry/replay:23октября01:09:02Баку; затемпроверкаoriginaltimestamps, ровно3claims,HRVALID иDELAYED_CLAIM, отсутствие дублей послеrestart. Лимит24ч не сокращался, время/таймзона не менялись. Автоматические наблюдения каждые5мин; GAP>10мин не позволяетPASS.
- Device-side watchdog проверен: процессжив, script совпадает, heartbeatсвежий. Восстановление сети при пропажеheartbeat15мин либо23октября01:26:59Баку; обычныйcleanup завершаетраньше. Сетевойдоступ отключён только standalonepackage (во всехего Androidprofiles), остальныеpackagesнеблокируются.
- Продолжение: сначала прочитать private `/mnt/HC_Volume_106454338/codex-alt-data/tmp/mtm-maestro-device-20261021/physical-soak-20261022-v1/progress-sanitized.json` и при появлении `result-sanitized.json`; launcher `/mnt/HC_Volume_106454338/codex-alt-data/tmp/mtm-maestro-device-20261021/physical-soak-runner-launch.json`. НЕ запускать второйпрогон иНЕсниматьсетевоеправило до завершения; дляявнойаварийнойостановки предусмотрен STOPфайл вrunfolder сfinallycleanup. Rawpayloads остаются0700private. Фоновыйrunner запущен отдельно отсессии, это реальныйпроцесс; автоматическоеуведомление/пробуждениечата не создано.
- Checkpoint6ee29ed опубликованвdraftPR196: CI39676089432SUCCESS (275suites/2434PASS/1TODO,TypeScript), emulator39676089495SUCCESS. Повторныйordinarybuild39676089261 запрошенкотмене какизбыточный: измененытолько2docs/evidence, runtimeиAndroidinputs идентичныобоимзелёным5a880builds. ОтменанеявляетсяPASS. PRdescription содержитrealGPSPASS иотдельныйRUNNINGsoak. Mobilemainmerge/publicrelease иновыйCRMdeploy не выполнялись.

## 2026-10-22, 01:15 Баку — точка продолжения

- Опубликован checkpoint `053f6b24eb7836ec59e7035d7c4775d6908e2e3a`. CI `39676731551` и emulator contract `39676731542` завершились успешно. Повторная обычная Android-сборка `39676731548` отменена как избыточная, как и `39676089261`: с проверенного runtime `5a88070` изменены только журнал и JSON-отчёт. Необходимые standalone/MTM сборки на runtime SHA прошли. Описание draft PR196 обновлено; слияния мобильной ветки и нового серверного выпуска не было.
- Публичный отчёт проверен на соответствие приватным результатам: все четыре прежние попытки сохранены, новый GPS PASS и короткий capture PASS совпадают с фактическими прогонами, снимки проверены по SHA256. Полная 24-часовая приёмка честно остаётся RUNNING. Полные локальные build/browser E2E — NOT RUN по ограничению Contabo; обязательные мобильные проверки выполнены в GitHub CI.
- Третий автоматический замер выполнен `2026-10-21T21:14:30.329Z`, через447.695с после отключения: прежние boot/package/часы, сеть обычного MTM разрешена, радионастройки неизменны, серверная история прежняя. Процесс жив, финального результата пока нет. Это подтверждает работу периодического наблюдения, а не завершение суток.
- Текущий статус: согласие опубликовано только в тестовой компании; отдельная версия1019 установлена; первый GPS-запрос прошёл, HR показал INSIDE45м при радиусе100м. Суточная выдержка идёт в фоне.
- Последнее завершённое действие: проверены третий автоматический замер, зелёные проверки опубликованного отчёта и описание PR.
- Точная точка остановки: ожидание реального срока до23октября01:09:02Баку; только отдельное приложение остаётся без сети. Не перезапускать прогон и не снимать его сетевое ограничение вручную без причины.
- Следующее действие: runner проверит доступ перед/после истечения24ч, восстановит сеть, проверит ровно3 исходные отметки и кадровый флаг задержки, затем восстановит разрешения. При продолжении чата сначала прочитать его `progress-sanitized.json`/`result-sanitized.json`, подтвердить восстановление телефона и добавить окончательный результат в отчёт. Автоматическое уведомление в чат не настроено.

## 2026-10-22, 10:50 Баку — проверка по запросу «прогрес?»

- Прежняя запись RUNNING и оценка завершения23октября01:09 **устарели**. Приватный результат первого суточного прогона — FAIL: после шести подтверждённых наблюдений HTTP-чтение кадрового отчёта завершилось `Transport failure`. Runner остановился22октября01:35:42Баку, примерно через29минут. Последнее успешное наблюдение01:29:58 подтверждало отсутствие ранней отправки и неизменные часы/сеть/историю. Это отказ проверяющего процесса; суточная работа приложения не доказана.
- Finally-cleanup записал восстановление доступа standalone к сети, исходных разрешений Android и радионастроек. Повторно проверить сам телефон сейчас нельзя:5037 и35037–35039 закрыты, других слушающих35030–35099 нет. Восстановление подключения запрошено у пользователя; команда дана отдельным копируемым блоком. Самостоятельного средства открыть исходящее SSH-соединение на Mac среди доступных инструментов нет.
- Сервер отвечает200. Истекшую кадровую тестовую сессию обновили штатным входом в тот же owned fixture, права/организацию повторно проверили. Независимое утреннее чтение:35прежних событий и10заявок неизменны, новых событий0; три сохранённые офлайн-операции пока не доставлены, текущий день STARTED/HRVALID. Пока телефон недоступен, актуальную сохранность очереди на устройстве повторно не утверждаем.
- Backend теперь `91c0fa8d5bec8b253fb76cc90ac12eb287613230`; это внешний выпуск после нашего прогона, в этой задаче сервер не публиковался. Новый тест должен записать актуальный backend SHA.
- Установлена дополнительная причина ненадёжности длительного harness: кадровая JWT-сессия имеет maxAge8ч (src/lib/auth.ts). Добавлен `scripts/e2e/attendance_soak_probe.py`: только чтение, максимум3попытки для transport/502/503/504, паузы10/20с; отказы авторизации, смена личности, истории или часов не повторяются и не считаются PASS. Целевые12Pythonпроверок PASS, RAM16GBavailable/disk151GB/pressure0 перед запуском. Новые TypeScript/Android/fullbrowser checks локально NOT RUN: runtime приложения не менялся, тяжёлые проверки запрещены наContabo.
- Подготовлен отдельный private `physical_soak_v2.py`; первый script/result не изменён. Версия2 обновляет/проверяет ровно owned HR session каждые4ч, сохраняет причины retry и немедленно отказывает при observation gap>600с. Syntax и текущая проверка HR identity PASS; новая физическая попытка NOT RUN. Перед её запуском сначала подключить телефон, доставить прежние3события и проверить отсутствие дублей/старые claimedAt, затем начать новый реальный24h интервал. Сокращать сутки или выдавать29минут заPASS запрещено.

- Пользователь восстановил подключение («готово»). Проверено живое устройство на35039: версия1019, standalone/MTMnetworkallowed, chain disabled, исходныеCAMERA/FINE/COARSEfalse, radios1/1/0. Восстановлен только loopback5037relay дляMaestro.
- После штатного coldstart standalone доставил ровно прежниеPAUSE/RESUME/FINISH:35старых событий неизменны, исходные времена22октября01:07–01:08 сохранены, минимальная задержка35271.3с (около9ч48мин). HRVALID/COMPLETED, открытыйDELAYED_CLAIM уFINISH,10заявок неизменны, второйcoldstart бездублей иpending. Снимок завершённого дня просмотрен; это delivery recovery PASS после прерванной попытки, не24hPASS. До открытия приложения очередь не отправлялась; фоновую доставку при закрытом приложении не заявляем.
- Согласиеpolicyv1 всёещё принято. Для новогоsoak восстановлены ранее проверенные foregroundOSgrants; это подготовка, не повторная приёмка первого Androiddialog. Проверка интервала4ч/истёкшей HRсессии/отказа чужойidentity сmocktransport PASS. Версия2 обязательно требует receipt успешнойдоставкипервойочереди; новыйrunner запущен отдельно, ждёмpreflight/capture. РаннийFAIL иегоscript сохранены.
- Checkpoint1ab690c опубликован; CI39736929293 иemulator39736929326SUCCESS. Обычный Android39736929294 запрошенкотмене: приложение/Android/workflows неизменны, изменены Pythonharness иevidence. PR196 остаётсяdraft, описание исправлено: первая попыткаFAIL, прежнийdeadline отменён.

## 2026-10-22, 11:04 Баку — вторая суточная попытка

- Новый реальный offline начат22октября11:01:04Баку (`2026-10-22T07:01:04.099Z`) на том же1019/source5a88070. После доставки старой очереди штатное REOPEN/RESUME сохранило38предыдущих событий и довело baseline до40. Maestro capture второй попытки PASS77.844с; повторныйcoldstart показывает completed/pending, серверная история40events неизменна.
- Статус второй попытки RUNNING, полный24h/replay покаPENDING. Новый минимальный срок23октября11:03:04Баку; прежняя оценка01:09 окончательно отменена. Watchdog наустройстве проверен: script совпадает, процессжив, heartbeatсвежий; deadline23октября11:21Баку либо15минут безheartbeat. ОбычныйMTMallowed, исходныерадионастройки сохранены.
- Активный runner: `/mnt/HC_Volume_106454338/codex-alt-data/tmp/mtm-maestro-device-20261021/physical_soak_v2.py`; launcher `physical-soak-v2-runner-launch.json`; текущие receipts в `physical-soak-20261022-v2/progress-sanitized.json` и будущий `result-sanitized.json` внутри того же private root. При продолжении сначала читать именноv2; v1FAIL и recoveryPASS остаются отдельными фактами. Не запускать третий прогон поверх активного. Автоматическое сообщение вчат не настроено.
- ПубличныйJSON теперь явно различает первыйFAIL, последующуюдоставку3событийPASS ивторуюRUNNINGпопытку. Приложение, Android и сервер в этой фазе не изменялись.

## 2026-10-22 11:07 Баку — итог текущего продолжения

- Опубликован `bc193e946df96bbf3d288db6b02875bd63c77ab4`: CI39738105548 и emulator39738105625 SUCCESS. Повторная ordinary Android39738105551 CANCELLED как избыточная; native runtime, Android и workflows неизменны с проверенного5a88070. Полные локальные сборки/браузерные E2E/TypeScript — NOT RUN: изменены Pythonharness и документация; целевые12Pythonтестов и необходимые hosted gates выполнены.
- Проверено соответствие JSON фактическим receipts: все GPS попытки сохранены, первый FAIL не скрыт, восстановление прежних3событий PASS, вторая очередь captured PASS77.844с и полный срок пока PENDING. Оба фактических экрана восстановления/новойофлайночереди просмотрены. PR196 остаётся draft; описание и ссылки на gates обновлены.
- Текущий статус: данные первой очереди сохранены почти10ч и доставлены бездублей; исправлен проверяющий процесс; второй суточный тест RUNNING на1019. Последняя сохранённая проверка 2026-10-22T07:03:28.302+00:00, наблюдений 2, retries 0. Процесс жив, итогового receipt ещё нет.
- Последнее завершённое действие: проверены hosted gates финального checkpoint, достоверность evidence и активный второй runner.
- Точная точка остановки: реальная суточная выдержка второй попытки; сеть ограничена только standalone. Ожидаем минимум23октября11:03:04Баку.
- Следующее действие: при продолжении читать только активный `physical-soak-20261022-v2/progress-sanitized.json` и при появлении `result-sanitized.json`; подтвердить24h/expiry, доставку3новыхclaims иcleanup. Первый прогон завершёнFAIL, его последующая доставка PASS не заменяет сутки. Не запускать новую попытку поверхv2; автоматического уведомления вчат нет.


## 2026-10-22 — разбор рекламного видео HRSS по запросу пользователя

- Пользователь запросил предложения по модулю после просмотра https://www.instagram.com/reel/Der4HHNNTDS/ и отдельно уточнил, что важен именно просмотр видео. Описание публикации и сайт не подменяют визуальное содержание.
- Обычный просмотр и TinyFish browser возвращали ошибку воспроизведения. Публичный Instagram embed предоставил видеофайл именно этого shortcode: 36.127392 секунды, 720×1280, 2 811 963 байта. Получены и визуально рассмотрены кадры по всей длительности (контактный лист с шагом 3с, дополнительно оригинальные кадры 7/16/22/28/35с). Анализ основан на изображении и экранных надписях; аудиодорожка не расшифрована. Материалы исследования сохранены вне Git в private tmp/attendance-competitor-hrss-20261022.
- Что действительно показано: примерно 3–8с портал с остатками отпусков, заявлениями, входом/выходом, зарплатными данными, отчётами, почасовым отсутствием, согласованиями и авансом; 9–16с заявление на отпуск и экранная последовательность руководитель → HR; 18–22с детализация gross/net и удержаний; 24–28с кадровая таблица посещаемости и боковая карточка сотрудника; финал приглашает на demo. Наличие карточки аванса не доказывает показ полного процесса выплаты; рекламный расчёт налогов не проверялся.
- Сверка с текущим исходным кодом: заявки на отпуск/почасовое отсутствие/командировку/коррекцию и т. д. уже есть; HR Today содержит текущее присутствие и действия. attendance-request-contract/decision сейчас имеют одно итоговое решение, а не последовательные стадии руководителя и HR. Не предлагать существующие заявки/табель как отсутствующие функции.
- Предложения, ещё НЕ согласованные на реализацию: личная сводка сотрудника; настраиваемая цепочка согласования с понятным текущим ответственным; доработка HR Today для исключений и свежести данных; отображение утверждённых расчётных листков из бухгалтерии; отдельный процесс аванса с различием согласован/выплачен. Приоритет после завершения проверок надёжности — личная сводка и прозрачное согласование; полноценный payroll требует отдельной задачи. Сохраняем отдельное приложение и общий сервер, кадровые сотрудники не смешиваются с CRM-only аккаунтами.
- Исследование не меняло приложение, телефон, сеть, сервер или активный physical-soak-v2. Новый запуск тестов/сборок/деплой для консультативного разбора не требуются. Статус суточного теста этой записью не перепроверяется; сохраняется точка продолжения из предыдущей записи.
- Текущий результат: визуальный разбор видео завершён, предложения подготовлены. Последнее завершённое действие: сверка кадровых сценариев с исходным кодом. Точная точка остановки: рекомендации, без внедрения. Следующее действие по основной задаче: прочитать результат действующего physical-soak-v2 в установленный срок; новые продуктовые изменения выполнять по дальнейшему запросу пользователя.


## 2026-10-22 — список задач развития модуля и самокритика

Пользователь попросил сначала расписать задачи, затем выполнить самокритику. Это подготовка плана; новые функции не реализуем и не выпускаем на основании этого запроса. Учитываются просмотренный ролик HRSS, последующие предложения для кадровика/сотрудника и уже существующая реализация. Отдельное приложение и общий сервер сохраняются; CRM-only пользователи не становятся кадровыми сотрудниками автоматически.

### Задачи и условия готовности

| ID | Очерёдность | Задача | Условие готовности |
| --- | --- | --- | --- |
| T01 | До выпуска | Завершить приёмку надёжности | Подтверждены полный реальный 24h offline/expiry/replay, исходные времена без дублей, QR на итоговой сборке, первый GPS-запрос, отсутствие разрешений, привязка/отзыв и изоляция аккаунтов. Незавершённая проверка не считается PASS. |
| T02 | Ближайший этап | Квитанция отметки | Для каждой отметки отдельно видны локальное сохранение, получение сервером и необходимость кадрового разбора; исходное время и время доставки различаются, состояние переживает перезапуск. |
| T03 | Ближайший этап | Исправление из карточки дня | Сотрудник выбирает спорный день, данные подставляются, отправляет существующую заявку на коррекцию; видит решение. Исходная история не затирается, повтор не создаёт дубль. |
| T04 | Ближайший этап | Подготовка первого рабочего дня | Кадровик видит готовность учётной записи, назначения филиала/графика, приглашения и установки; сотрудник получает понятный следующий шаг. Приёмка без фиктивных реальных отметок. |
| T05 | После ближайшего этапа | Личная сводка | Существующие данные о сегодняшнем графике, времени, остатках отпуска и заявках собраны вокруг основного действия; отсутствующие/устаревшие данные явно обозначены. |
| T06 | Ближайший этап | Доработать кадровую очередь исключений | Существующие проблемы и обращения объединены ссылками/действиями без второго хранилища; у случая понятны причина, свежесть, ответственный, действие и история решения. |
| T07 | Следующая очередь | Настраиваемое согласование | Поддержаны один этап или руководитель → HR; виден текущий согласующий. Отпуск влияет на утверждённый табель только после финального решения, конкурирующие действия не дают двойного результата. |
| T08 | После T07 | Замещение согласующего | Назначены ограниченный период и область замещения, зафиксирован фактический автор решения; нет расширения доступа к чужим подразделениям и тупика для заявок. |
| T09 | Следующая очередь | Замена телефона | Новая установка проходит подтверждение, старый доступ отзывается; сотрудник понимает судьбу неотправленных отметок старого телефона. Сохраняется аккаунт и история, не обещается аппаратная аттестация. |
| T10 | Следующая очередь | Доработать закрытие месяца | Перед существующим закрытием видны нерешённые обращения, незавершённые дни и неподтверждённые переработки; поздние данные обрабатываются видимым исправлением/повторным открытием с аудитом, не тихой перезаписью. |
| T11 | Развитие кадрового планирования | График и покрытие филиала | Сотрудник видит опубликованные смены, кадровик — плановую обеспеченность по времени с учётом утверждённых отсутствий; минимум людей задаётся компанией. Плановое покрытие не выдаётся за текущее физическое присутствие. |
| T12 | После T11 и T07 | Обмен сменами | Коллега и руководитель согласуют обмен; до финала действует прежний график, проверяются пересечения и обеспеченность. Отмена не оставляет две активные версии смены. |
| T13 | После серверных статусов | Уведомления и напоминания | Настроены уведомления отдельного приложения и переход к конкретному событию; учитываются график, часовой пояс и настройка пользователя. Внутренняя история остаётся доступной при запрете push; доставка не обещается при любом состоянии ОС/сети. |
| T14 | Позже | Справки и изменения личных данных | Запрос справки/изменения поступает уполномоченному HR, имеет статус; чувствительные кадровые поля сотрудник не меняет бесконтрольно, документы доступны адресату. |
| T15 | Отдельный финансовый этап | Расчётный лист сотрудника | Отображаются утверждённые бухгалтерией данные с периодом и версией, разделением начислений/удержаний/аванса/к выплате; проверен доступ только к своим данным. Это отображение, не новый налоговый расчёт. |
| T16 | После определения финансового процесса | Аванс | Запрос → согласование → подтверждённая выплата; согласование не считается переводом денег. Определены ответственный за выплату и источник факта выплаты; исключено повторное отражение. |
| T17 | Вместе с T02/T03 | Прозрачность GPS и проверки отметки | Сотрудник видит сведения по собственной отметке и объяснение результата, может оспорить; при отсутствии точного измерения нет ложного статуса вне филиала. Координаты не появляются в push-превью, аудит и права сохраняются. |

Общие условия для задач: серверные права/границы компании проверяются независимо от экрана; история действий сохраняется; офлайн и повторная отправка имеют явный результат; интерфейс поддерживает AZ/RU/EN. Для каждого затронутого процесса — E2E сотрудник → кадровик → результат сотруднику, а для действий телефона Maestro на отдельном приложении. Случаи проверки включают повтор действия, отказ, отсутствие сети/разрешения, перезапуск, чужой аккаунт и закрытый период, когда применимо. Тяжёлые проверки только в CI/допустимом worker, не Contabo. Готовность интерфейса сама по себе не означает готовность серверного сценария.

### Самокритика и исправление приоритетов

1. Список слишком широк для одного выпуска: от учёта времени он доходит до кадрового документооборота и финансов. Первая итерация ограничена T01 → T02/T17 → T03 → T06 → T04; T05 может идти следующей небольшой итерацией. Это рекомендуемый порядок, не обещание сроков.
2. Часть предложений уже существует: заявки, коррекции, остатки отпусков, смены, Today и закрытие месяца. Перед реализацией составить короткий разрыв между существующим поведением и условием готовности; переиспользовать данные и экраны, не создавать параллельные модули.
3. Двойное согласование подходит не каждой компании и усложняет отказы, отмену, замещение и права. T07 необязателен для первого выпуска, режим одного этапа сохраняется. T08/T12 зависят от согласованной модели.
4. Понятие онлайн-присутствия может вводить в заблуждение: сервер не знает ещё не доставленные события. Нужны время актуальности и различие «не получено»/«отсутствует». Не превращать отсутствие GPS/сети в автоматический прогул или удержание.
5. Замена телефона и offline вступают в конфликт: старые события могут оставаться на потерянной установке. T09 требует явной политики восстановления и обработки поздних событий после отзыва, а не одного красивого экрана подтверждения.
6. Копировать payroll из рекламного ролика преждевременно. T15 — показ утверждённых бухгалтерских данных, T16 — отдельный процесс. Полный расчёт зарплаты/налогов не включён в ближайший backlog реализации и требует отдельного задания.
7. Напоминания и просмотр GPS могут перегрузить/насторожить сотрудника. Настраиваемая частота, учёт рабочего времени, понятная цель измерения и минимальное раскрытие данных обязательны; эти функции не заменяют надёжное сохранение отметки.
8. Не определены количественные цели. Для пилота измерять потерянные/дублированные отметки (должны отсутствовать в проверках), долю обращений без понятного статуса, время разбора коррекции, трудности первого входа. Сроки и целевые значения удобства назначать после исходного замера, не выдумывать.

Проверка текущего журнала активного physical-soak-v2 только чтением: progress RUNNING, updatedAt2026-10-22T07:24:12.612Z (11:24:12Баку),6наблюдений, result-sanitized отсутствует. Это сохранённое состояние, не новая физическая проверка телефона и не24hPASS. Сеть/устройство/runner не изменялись.

Текущий результат: задачи с критериями готовности и самокритика подготовлены. Последнее действие: сокращён рекомендуемый первый этап и описаны зависимости/риски. Точная точка остановки: планирование, новых продуктовых изменений нет. Следующее действие основной задачи: получить итог действующего суточного теста; реализацию нового списка начинать по дальнейшему запросу. Проверка этого изменения документации: git diff --check; новые программные тесты не требуются, приложение не менялось.


## 2026-10-22 — пользователь поручил начать выполнение плана

- Прямой запрос: «ок начинай работу запиши у себя план работы чтоб не забыть». План T01–T17 выше сохранён; пользователь разрешил начать реализацию. Рекомендуемый ближайший объём: T01 → T02/T17 → T03 → T06 → T04. T05 и последующие этапы сохраняются в очереди; никаких обещаний внедрить финансовый модуль в ближайший выпуск.
- Рабочая папка /mnt/HC_Volume_106454338/codex-alt-data/worktrees/mtm-attendance-standalone, codex/attendance-standalone, origin https://github.com/rashadoni/leaddrive-mtm.git; production_alias/release_route none. Текущий исходный checkpoint6a187fc. Не менять установленный1019 и активныйsoak-v2 ради разработки.
- T01: ожидает реальный срок23октября11:03:04Баку. Прочитан progress-v2: RUNNING,7наблюдений, последняя запись11:29:22Баку, финальныйreceipt отсутствует. Это неPASS. Проверяющийrunner использует установленныйfixedSHA5a88070 и отдельныйprivateпроцесс.
- T02/T17: В РАБОТЕ — исследовать доступные serverreceipts и долговечную очередь; спроектировать раздельные состояния доставки и проверки, сохранить isolation/consent и исходныевремена, затем интерфейсAZ/RU/EN и регрессии. Нельзя выдумывать серверное время получения или результатGPS из локальногоуспеха.
- T03: ОЖИДАЕТ — переход из конкретного дня к существующей коррекции с безопасной подстановкой и текущими правами.
- T06: ОЖИДАЕТ — точечная доработка существующей кадровой очереди, без второго набора данных; сверить CRM дерево/контракт перед изменениями.
- T04: ОЖИДАЕТ — использовать существующие данные настройки/привязки для понятной готовности первого рабочего дня; без фиктивныхотметок.
- Проверки: узкие последовательные тесты после проверки ресурсов; тяжёлыеTypeScript/build/полныеE2E вCI/worker. Новуюсборку неустанавливать поверхдействующего24hтеста. Послекаждойфазы добавлять результат/commit/проверки/точкупродолжения сюда. Новый код не объявлять прошедшим физическуюприёмку старойAPK.


### T02 — первая реализация квитанций

- Добавлены allow-list contract, scoped persistentreceiptcache (server+tenant+employee), наблюдение заочередью и карточка последних64отметок (первые4сразворачиванием). КаноническийeventсверяетсясoperationId/workday/action/исходнымвременем; новые координаты/QRтокены/notes/requestHash вcacheнепопадают. СостоянияLOCAL/CONFLICT/RECEIVED отделеныотрезультатаreviewпридоставке. ПризнакDELAYED_CLAIM невыдаётсязатекущеерешениекадровика.
- КвитанциясохраняетсядоACKочереди; ошибкадискаоставляетисходнуюоперациюдляточногоповтора. Старыйсервербезeventнепорождаетвымышленноеподтверждение. ВремяполученияберётсяизserverReceivedAt, непочасамтелефона. Обычнаяполеваясинхронизациянеприобретаетofficeдоступ.
- Целевые4suites/66testsPASS. ДополнительныеattendanceRequests/QRрегрессииPASS; интеграционныйтестсбоехранилищаизначальновыявил,чтотестовыйoptions.nowнеуправляетвнутреннимpendingselectorсуществующегоoutbox. ТестисправленсподменойDate.now, productionoutboxнесменён. Далеефиксируетсярезультатповтора.
- ПолныйTypeScript/build/новыйMaestro NOT RUN: hostedgatesещёневыполнены, телефонзанят24hтестом1019. T02ещёнеобъявленготовымквыпуску. T17полноценныйGPSрезультатвквитанциипотребуетотдельногоканоническогоserverDTO; локальноневыдумываетсяINSIDE/OUTSIDE.


### T03 — контекстная коррекция дня

- T02дополнительнаяинтеграционнаяпроверкапослеисправлениятестовыхчасов:11/11PASS; исходнаяоперацияостаётсяприошибкесохраненияквитанции,повторотправляеттотжеIDисоздаётоднуквитанцию. CheckpointT02e05307b.
- T03реализованвкоде: кнопка«Исправитьмойденъ»текущейкарточкипередаётбезопасноепредложениевсуществующуюформуTIME_CORRECTION. Известныевременавчасовомпоясекомпании,ночныедатысохраняются;неизвестныйконецостаётсяпустым. Приpendingотметкахкнопкаждётдоставки. Причинусотрудниквводитсам,никакогоавтоматическогоsubmit.
- Предложениепривязаноserver+tenant+employee+timezone;другойаккаунтегонеполучает. Ужеоткрытыйчерновиксдокументаминезатирается: новоеисправлениемождётзакрытия/отправкипрежнего. Текущиесерверныеправа/проверкикоррекциинеобходятся.
- Целевые3suites/79testsPASS:датыночнойсмены,неполныйдень,чужаяidentity,сохранениечерновика,AZ/RU/ENисуществующийрабочийэкран. ФизическийMaestro/TSC/buildещёNOTRUN;действующийsoak1019нетронут.
- СледующаяфазаT17/T06/T04требуетCRM:recordedworktreeattendance-personnel-directory,branchcodex/attendance-personnel-directory,originrashadoni/leaddrive-v2; production13.140.132.245:/opt/leaddrive-v2,толькоActionsmain. ПрочитанырепозиторныеAGENTS/DEPLOYMENT/registry. Originmainобновлёндо96c08c4e6,передсервернымиправкамисогласуетсяисторияэтойветки. Новыйproductiondeployнеразрешёнпрежнимразрешениемнавыпускrosterfixавтоматически.


### T17 — просмотр собственных записанных GPS/QR-данных

- Добавлен просмотр отметок текущего дня по явному нажатию: исходное время, записанная геопозиция и точность, результат сравнения с филиалом, результат QR и количество открытых/закрытых кадровых проверок. Это исторические данные сервера, просмотр не вызывает новый GPS. Координаты не попадают в постоянный кеш квитанций и удаляются из состояния при закрытии/смене аккаунта, сервера или дня.
- Серверная часть находится в attendance-personnel-directory: точный GET marks в office allowlist, текущие права сотрудника, tenant/employee/workday scope, no-store, строгая выдача разрешённых полей. У перерывов координаты/QR не возвращаются. На старом сервере ошибка чтения обозначена как недоступность, не как отказ в отметке.
- Целевые мобильные 4 suites / 65 tests PASS (own marks parser, экран, рабочий день, API). Серверные own-marks/auth/path: 3 suites / 58 tests PASS до добавления настоящих PG assertions; последние включены в существующий location-postgres gate и пока NOT RUN. Полные TypeScript/build, новый APK, Maestro — NOT RUN: CI ещё не запускался, телефон занят реальной выдержкой старой сборки.
- Проверка сохранённого progress-v2: RUNNING, 12 наблюдений, последняя запись 22 октября 11:55:10 Баку. Это не суточный PASS; ранний срок завершения остаётся 23 октября 11:03:04 Баку. Runner/телефон/радионастройки не изменялись.
- Следующая фаза: T06 сравнение фактов при подаче с предложенной коррекцией и честная свежесть кадрового списка; T04 подготовка сотрудника по существующим данным, без фиктивной отметки.


### 2026-10-22 — первый пакет плана реализован; приёмка ещё не завершена

- Сохранённые изменения: T02 e05307b, T03 5a924d2, T17 109c91b; сервер T17 2fab9fc76. Работа продолжается в тех же двух ветках, без изменения canonical checkout или установленной APK.
- T04, сторона сотрудника: для каждого состояния допуска телефона теперь указан следующий шаг; одобренная установка не требует пробного прихода. T03 дополнительно проверен на рабочем экране: подтверждённый день передаёт свой контекст, pending не открывает коррекцию.
- T17 дополнительная транспортная регрессия выявила ошибку: четвёртый параметр api.request — версия API, а не количество повторов. GET marks был направлен на v1; исправлен на v2. После исправления 3 suites / 27 tests PASS (URL и экранирование, исторический parser, поздний ответ после смены сервера). Отдельно 2 suites / 56 tests PASS для рабочего экрана/подсказок установки. Эти проверки не заменяют полную сборку.
- Две новые Maestro journey подготовлены: own-mark-details (квитанция переживает restart, исторические сведения открываются явно), correction-from-day (подстановка исходных дат/часов и закрытие без отправки). YAML прочитан и проверен, физический запуск NOT RUN. README содержит предпосылки и независимые проверки серверной истории; существующие flows/runner суточного теста не изменялись.
- T06/T04 в CRM: сравнение снимка при подаче и предложенного времени, ссылка на текущий табель, время загрузки очереди; карточка подготовки показывает актуальные данные входа (телефон ИЛИ email), участие, действующий тип графика, основной филиал и текущие допуски установок. Доставка приглашения и работоспособность конкретного телефона честно остаются отдельными непроверенными фактами. Полной многоэтапной очереди/назначения ответственного в этом пакете нет: T07/T08 остаются в backlog.
- План ближайшего продолжения: публикация reviewable веток → hosted TypeScript/тесты/PostgreSQL/браузерный E2E/сборка APK → итог текущего реального 24h → физические проверки новой APK и поэтапный выпуск по разрешению пользователя. Прежнее разрешение на roster/explanations не считаем автоматическим разрешением на выпуск всех новых функций.
- NOT RUN: полный TypeScript, production build, PostgreSQL, полный browser E2E, новая native сборка и физический Maestro. Причины: тяжёлые проверки запрещены на Contabo и требуют публикации в CI; телефон занят активным суточным тестом 1019. Локальные проверки не называем релизной приёмкой.
- T01 сохранённый progress-v2: RUNNING, 17 наблюдений, updatedAt 2026-10-22T08:20:58.941Z (12:20:58 Баку), итогового файла нет. Ранний срок завершения — 23 октября 11:03:04 Баку. Это не 24h PASS и не новая физическая проверка.
- Текущий статус: первый пакет в исходниках и узкие проверки готовы; публикация/CI/приёмка впереди. Последнее действие: исправлена v2-маршрутизация и проверена изоляция позднего ответа. Точная точка остановки: подготовка checkpoint первого пакета перед публикацией. Следующее действие: получить разрешение публикации нового пакета согласно правилу хоста и запустить hosted gates; установленную APK до окончания soak не менять.


### Публикация первого пакета — точка продолжения

- Checkpoint приложения: 2f06e4b; серверного пакета: be995efd9. Вопрос пользователю отправлен: опубликовать обе ветки для полных проверок и разрешить выпуск проверенных изменений либо ограничиться публикацией для проверок. Ответ ещё не получен; отсутствие ответа не является разрешением. Источник ограничения — пользовательский host contract: «Push, merge and production deploy require authorization for the active task».
- Финальная самопроверка уточнила дату в подписи загрузки кадровой очереди, чтобы время вчерашней загрузки не выглядело сегодняшним. Никаких изменений API/решений этим уточнением нет.
- Текущий результат: первый пакет сохранён; узкие проверки PASS, тяжёлые gates и новая физическая приёмка NOT RUN. Последнее завершённое действие: checkpoint приложения/сервера и запрос разрешения публикации нового пакета. Точная точка остановки: ожидание ответа перед push/CI; действующий physical-soak-v2 остаётся RUNNING. Следующее действие: после ответа опубликовать соответствующие ветки, запустить hosted gates и исправлять реальные ошибки; установку новой APK отложить до завершения суточного теста.


### 2026-10-22 — публикация и выпуск первого пакета разрешены

Пользователь ответил на конкретный список функций: «Да, опубликовать и выпустить после проверок». Это разрешение активно для первого пакета T02/T03/T17/T06/T04 и его проверок/исправлений; повторного разрешения на этот же пакет не требуется. Предыдущая запись об ожидании разрешения устарела. Публикуем обе ветки и запускаем hosted gates, сервер выпускаем через verified PR/main/Actions; новую APK на телефон устанавливаем только после завершения активного реального суточного теста. Наличие разрешения не заменяет успешные проверки.

### 2026-10-22 — опубликованные проверки и исправление навигации

- По явному разрешению пользователя опубликован пакет b2b7d03 в PR196 (draft): https://github.com/rashadoni/leaddrive-mtm/pull/196. Серверный PR978 опубликован и переведён в ready: https://github.com/rashadoni/leaddrive-v2/pull/978, head e634aed463b9a14c45fb4686f6bacf83458ce7bf. Оба PR прикреплены к задаче.
- Hosted mobile CI 39748064083 и standalone build 39748058109: все 280 suites / 2472 tests PASS, 1 TODO; TypeScript FAIL на navigate('OwnRequests', { correction }) из-за отсутствия типизированных параметров. Ordinary build 39748064267 остановлен на той же ошибке; это не готовые APK. Emulator smoke contract 39748064046 PASS, физическую приёмку не заменяет.
- Исправлен общий тип собственных attendance-маршрутов для рабочего экрана и manager stack; небезопасные as never в этих переходах убраны. Узкие 3 suites / 80 tests PASS после исправления. Полные TypeScript и native build должны быть повторены в hosted CI на новом head; на Contabo NOT RUN по ограничению нагрузки.
- Описание PR196 обновлено через REST существующего GitHub-доступа: connector update вернул 403, gh pr edit столкнулся с устаревшим Projects Classic API. Права/проверки не менялись.
- Серверные PR checks 39748300731 и authenticated E2E 39748300919 выполняются, включая настоящую PostgreSQL/RLS-проверку. Ранний draft-run E2E 39748138315 был SKIPPED и не считается PASS.
- Сохранённый real24h progress: RUNNING, 19 наблюдений, updatedAt 08:31:16Z; APK1019 и телефон не менялись. До окончательного выпуска сохраняется T01: выдержка до 23 октября 11:03:04 Баку и проверка доставки исходных трёх отметок. Текущая работа — исправить ошибки hosted gates, затем дождаться физической приёмки; production не изменён этой задачей.

- Дополнение к навигации: повторный hosted run dcfec24 остановился на старом source-contract manager-shell-cleanup, который требовал буквальную строку с `as never`. Проверка сохранена (скрытие кнопки профиля в manager shell), ожидаемый типизированный переход обновлён. Узкие 6 проверок этого suite PASS. Это исправление тестового ожидания, не обход typecheck. Новые hosted gates должны подтвердить весь пакет.

- Уточнение предыдущей записи: manager-shell-cleanup содержит 7 проверок (не 6); все 7 PASS. Новый head 0a48f24b36f5d985cf8aad91f02409c688b577b5 прошёл полный CI 39749539469: 280 suites / 2472 tests PASS, 1 TODO, полный TypeScript PASS. Emulator contract 39749539370 PASS. Standalone 39749533586 и ordinary MTM 39749539344 прошли JS/TS и собирают native артефакты; готовность APK ещё не заявляем. Test-render JSON сохранены локально, это не физические скриншоты.

- Native standalone build 39749533586 PASS на 0a48f24b36f5d985cf8aad91f02409c688b577b5: отдельный package, подпись и отсутствие запрещённых фоновых разрешений проверены CI. APK 1.0.0/1022, SHA256 14aacdf18e2234309d2632707a4be446f29571d6cdce7d4a7a4cdba4c961fb5d. Артефакт скачан в private tmp/package-0a48f24-apk, source/package metadata и SHA256 независимо совпали. Ordinary MTM build 39749539344 также PASS. APK1022 НЕ установлен; на телефоне остаётся1019 и активная суточная выдержка.
- Серверный E2E 39748300919 на e634aed PASS: 65 именованных сценариев, отдельные 5 NOT RUN не скрыты. Non-UTC/location PostgreSQL 39748138240: 53 PASS. Смежный compiler выявил две ошибки типов в тестовом fixture, исправлены без изменения baseline, новый server head 392f8d16d1dc6f619abe0c63db85c32ce7627a26 опубликован. Повторные gates ещё выполняются; production не выпущен.

### 2026-10-22 — второй soak прерван USB; исходная очередь восстановлена

- Предыдущие сообщения RUNNING отражали последние сохранённые наблюдения. В 08:57:14Z (12:57 Баку) runner завершился FAIL: ADB перестал видеть телефон. 23 наблюдения и capture PASS77.844с сохранены; 24h не пройден. Старый ориентир 23 октября 11:03 отменён, нового срока пока нет. Remote cleanup также не смог выполниться.
- Проверены оба порта35039/5037: SSH/ADB-server отвечает, устройств0; reconnect offline не помог. Вызван пользователь только для физического USB. Ответ «подключен» восстановил device. Перед явным cleanup пакет всё ещё был DENY: автоматическое восстановление watchdog не заявляем. Восстановлены own networking, исходные разрешения задачи; ordinary MTM и радионастройки сохранены.
- recovery-v2 PASS09:08:52Z: до запуска новых событий0, после запуска ровно3 PAUSE/RESUME/FINISH, исходные времена сохранены, минимальная задержка7537.8с (~2ч05м). Все40 предыдущих событий и заявки/история другого аккаунта неизменны. HR VALID/COMPLETED, FINISH имеет DELAYED_CLAIM; повторный restart без дублей/pending. Backend96c08c4e6 до/после recovery; собственный deploy ещё не выполнен.
- Полные второй FAIL/samples/recovery добавлены в docs/evidence/attendance-location-and-soak-20261022.json. Ранние попытки и стартовые snapshots сохранены. Не выдавать recovery за 24hPASS.
- Условие «не менять APK во время текущей выдержки» больше не удерживает установку: выдержка завершена, очередь/cleanup проверены. Следующий шаг — APK1022 с сохранением данных, физическая приёмка новых функций после готового серверного пакета и новый отдельный real24h. Публичный выпуск приложения остаётся за физической приёмкой. Серверные gates на392f8d16d: основной E2E снова PASS, production-build и typecheck PASS; static и смежный cold build ещё выполняются.


### 2026-10-22 — новая APK установлена; серверный выпуск начат

- APK1022 (source0a48f24b36f5d985cf8aad91f02409c688b577b5, SHA25614aacdf18e2234309d2632707a4be446f29571d6cdce7d4a7a4cdba4c961fb5d) установлена штатным обновлением. UID приложения сохранён, обычное MTM1710/его UID неизменны; вход тестового сотрудника и43 прежних события сохранены. Радионастройки и разрешения не менялись. Ошибка первичной проверочной утилиты сравнивала строковый versionCode с числом; исправлен тип сравнения, реальная версия1022 подтверждена. installed-current-apk.json обновлён только после этих проверок.
- Все серверные gates на392f8d16d PASS. PR978 объединён с expected head, main376533a340f8d44b5034af7cc71c459d2c1d6f6e; Actions deploy39754397126 выполняется. Actual-browser screenshots подготовки и сравнения просмотрены. Выпуск не объявляем завершённым до public build-info/ping/smoke.
- Добавлен отдельный receipt-existing-day Maestro: обычное возвращение в уже существующий тестовый день, перерыв/продолжение/завершение, квитанция после restart. Это дополнительная приёмка T02, не подмена fresh START. Перед первым действием сохранён полный private baseline сотрудника/другого аккаунта/настроек. Flow запущен на1022, результата пока нет. Новый реальный24h ещё не запущен.


- Первая физическая receipt-existing-day на1022 завершилась FAIL после362.925с: сценарий остановил приложение сразу после подтверждения FINISH, не обработав системный запрос GPS. Сервер сохранил только REOPEN/RESUME/PAUSE/RESUME; все43 исходных события неизменны, день STARTED. Это неполный сценарий, не потерянная подтверждённая сервером отметка. Исправлен flow: явный отказ в системном диалоге при его наличии, ожидание COMPLETED и доставки до restart. Следующая попытка получит отдельный baseline и каталог, прежний FAIL сохранён.
- shared/open-fixture теперь перечисляет CAMERA/FINE/COARSE вместо permissions.all: прежний режим выкачивал APK через remoteADB при каждом запуске (до~2мин). Три relevant permissions остаются DENY. Runtime APK не изменён. Запущена независимая проверка реального первого Android GPS-разрешения на1022, затем повтор receipt-flow.


### 2026-10-22 — физические результаты1022 и повторная потеря связи

- GPS-первый Android grant: Maestro location-finish-running PASS44.159с, FINISH доставлен,47 предыдущих событий/заявки/радионастройки сохранены. Свежего GPS fix нет: сервер UNAVAILABLE. Полная GPS INSIDE-приёмка поэтому FAIL, не PASS. Следующая попытка с ранее выданным разрешением остановилась до диалога FINISH; native UI затем завершён без изменения часов, сервер снова UNAVAILABLE. Итоги обеих попыток и ограничения сохранены отдельно.
- Receipt retry2 остановился при запуске (DeviceServerDied, ADB device briefly not found), новых событий0. После самовосстановления запущен retry3: REOPEN/RESUME сохранились, затем Mac tunnel перестал отвечать вообще.35037/35038 refused;35039/5037 timeout; reconnect offline тоже timeout. Собственный зависший Maestro остановлен (TERM, затем KILL только его группы после неуспешного завершения). Пользователю задан только необходимый вопрос восстановить Mac/USB; серверные работы продолжаются.
- Текущий тестовый office day STARTED, всего53 события в истории сотрудника:51 до третьего receipt-run плюс REOPEN/RESUME. Прежние события, заявки office и история/заявки другого аккаунта неизменны. Пакетная блокировка сети не начиналась, новая24h выдержка NOT RUN. Нельзя объявлять receipt/own-marks/correction физически принятыми.
- Correction prefill проверять на real-date admin fixture (mobile EMPLOYEE), созданной прежним честным fresh-day test: office day22 сохраняет искусственный START21октября17:09Z от более раннего synthetic attempt. Это описано прежним журналом; историю не переписывать ради теста. Подготовлен scoped native switch и correction harness, запуск NOT RUN из-за связи. Shared fixture использует существующий allowlist office/admin из offline-fixture.js; по умолчанию office.
- Новое evidence docs/evidence/attendance-first-package-20261022.json связывает APK/CI/attempts.4 YAML parsed, diff-check PASS. Runtime source/src/android/package не менялся после0a48f24; изменения касаются тестов и документации. Новый bounded24h runner подготовлен private physical_soak_v3.py, не запущен: требует успешной функциональной приёмки. Проверка24h, GPS INSIDE и QR независимы; UNAVAILABLE не заменяет GPS PASS. Detached timer проверен при живом USB, работа watchdog после USB loss/Android sleep не гарантируется.
- Точная остановка телефона: восстановить соединение, проверить очередь и текущий STARTED day, штатно завершить/повторить receipt journey, затем own marks и correction на real-date fixture с возвратом office. Только затем новый real24h с новым началом/сроком. QR/GPS на1022 пока остаются отдельными незакрытыми пунктами T01. Серверный deploy39754397126 прошёл build/quality и находится на выкатке.


### 2026-10-22, 13:49 Баку — сервер выпущен; телефон ждёт восстановления соединения

- Deploy39754397126 SUCCESS; live build-info точно376533a340f8d44b5034af7cc71c459d2c1d6f6e, /api/v1/ping ok=true. Read-only production fixture smoke PASS09:48:50Z:25 собственных marks сверены с HR event history, anonymous401, unknown/foreign employee day404, scope override400, private/no-store, GPS перерывов отсутствует; кадровая preparation присутствует. Заявки/история неизменны. Первый вспомогательный urllib запрос без обычных заголовков получил text/plain403; штатный curl и повтор с заголовками приложения успешно прошли. Это не скрытый продуктовый PASS после ошибки — оба результата сохранены private.
- Опубликован evidence/test head a5498375ead129e2c6ce7ed2f6b71965779edaf2 в draft PR196. Его CI39757861641 и emulator contract39757861686 SUCCESS. Автоматические native builds39757861609/39757854839 ещё IN_PROGRESS; новую APK не устанавливать автоматически. Проверенные runtime/src/android/package/index совпадают с установленным0a48f24/1022, который имеет собственные полные зелёные gates. Публичного mobile merge/release не было.
- Физическая остановка не изменилась: Mac tunnel35039/5037 не отвечает, вопрос пользователю уже задан. Receipt-v3 остановлен после REOPEN/RESUME; office day STARTED,53 total historical events,51 предшествующее событие неизменно. Сеть намеренно не блокировалась. Correction/own-marks на телефоне NOT RUN; real24h-v3 NOT RUN; QR/GPS INSIDE на1022 NOT PROVED. Нет нового суточного срока и нет автоматически настроенного уведомления.
- Продолжение после подключения: (1) bounded ADB probe и проверка именно установленной1022; (2) native UI завершение текущего тестового дня с обработкой GPS-denial, сверка истории/очереди; (3) новый отдельный каталог receipt journey, own-marks против нового backend; (4) native вход в admin fixture только при пустой доставленной очереди, correction prefill по реальным датам, возврат office с проверкой изоляции; (5) независимый real24h-v3 с новым временем и сохранёнными строгими guard. Private подготовка: package_1022_marks.py, package_1022_correction.py, switch_owned_phone.py, physical_soak_v3.py. Не перезаписывать уже существующие results; при новом запуске использовать новый каталог/label.
- Последний завершённый результат: серверный выпуск и read-only smoke. Точная точка остановки: продолжение физической приёмки невозможно без восстановления соединения со стороны Mac; серверные действия завершены. Следующее действие: проверить восстановленный телефон и продолжить с текущего тестового дня. Этот заключительный evidence checkpoint сохранён локально, чтобы не запускать бесконечные rebuild только ради статуса; опубликованная PR description обновлена отдельно.


### 2026-10-22, 14:28 Баку — ответ «готово», но исходящий канал Mac уже закрыт

- Продолжение в прежнем worktree /mnt/HC_Volume_106454338/codex-alt-data/worktrees/mtm-attendance-standalone, branch codex/attendance-standalone, origin rashadoni/leaddrive-mtm; codex-project-context выполнен. Canonical CRM checkout не затрагивался. Пользователь ответил «готово» на просьбу разбудить Mac/подключить USB.
- Реальная повторная диагностика:35037/35038/35039 ConnectionRefused; локальный relay5037 не получает ADB-ответ. В отличие от прежнего зависания, SSH reverse listener уже закрыт. Повторная проверка35039 также refused. Удалённо исходящий канал Mac создать невозможно; дан один копируемый блок запуска с автоматическим reconnect, keepalive15с/3пропуска и loopback-only reverse35039→5037. Синтаксис bash проверен; команда на Contabo не запускалась. Запрошено только «запущено» после запуска на Mac, новых физических отметок/изменения телефона не было.
- Все hosted checks evidence/test head a549837 теперь SUCCESS: CI39757861641, emulator contract39757861686, ordinary native39757861609, standalone native39757854839. Это дополняет, а не заменяет, отдельные успешные runtime gates установленной1022/0a48f24. Новая APK не устанавливалась.
- Сервер после нашего выпуска обновлён другой работой до1561c43906fd1fa50ac87c86fef3766bbbb49016. GitHub compare подтвердил, что он содержит наш376533a340f8d44b5034af7cc71c459d2c1d6f6e (ahead2); deploy39756130476 SUCCESS. Read-only own-marks25 PASS на текущем сервере, fixture day остаётсяSTARTED, исторических событий53. Этот более поздний выпуск не приписываем данной задаче. Physical marks harness сверяет текущий подтверждённый SHA и не должен падать только из-за уже проверенного более позднего main.
- Статус: серверная часть выпущена, все опубликованные сборки зелёные; физическая приёмка1022 не завершена. Последнее действие: текущий сервер/доступ к собственным отметкам и завершение CI проверены. Точная остановка: отсутствует исходящее соединение Mac, ждём запуска предоставленного блока. Следующее действие: проверить ADB, без очистки данных завершить текущий тестовый день, продолжить Maestro/изолированную correction fixture и затем отдельный real24h. Новый суточный тест и срок по-прежнему не назначены.


### 2026-10-22, 14:36 Баку — повторная проверка после «прверь»

- Пользователь попросил проверить соединение после предоставленного блока запуска. Повторно проверены35037/35038/35039: ConnectionRefused; relay5037 открыт, но ADB-ответ отсутствует. Это отсутствие SSH-канала Mac, а не доказанная ошибка USB/приложения.
- Прочитать терминал через инструмент приложения не удалось: к этой беседе не прикреплена terminal session. Доступа для исполнения команд на Mac нет. Вместо повторения одинаковой просьбы о подключении запрошены последние2–3 строки вывода команды на Mac либо подтверждение пустого окна; секреты не запрашивались.
- Телефон, версия1022, отметки и сеть не изменялись. Все прежние физические результаты сохраняются; новые Maestro/real24h NOT RUN из-за отсутствия соединения.
- Статус: серверный пакет выпущен, физическая приёмка приложения не завершена. Последнее действие: проверены все прежние каналы и возможность чтения терминала. Точная остановка: требуется вывод команды подключения с Mac для диагностики закрытого канала. Следующее действие: устранить причину по этому выводу, проверить телефон и продолжить с сохранённого STARTED day без очистки данных.


### 2026-10-22, 14:40 Баку — уточнение пользователя: передавалась информация от программиста 1С

- Пользователь уточнил: «я ничего не подключал я просто передал то. что 1с програмист передал мнне». Предыдущая трактовка ответа «прверь» как подтверждения запуска подключения телефона была ошибочной и этой записью исправляется. Результаты технической проверки отсутствия соединения остаются фактами, но не свидетельствуют о неудачном запуске команды пользователем.
- Пользователь не сообщал о выполненном новом подключении. Повторные просьбы подключить телефон по этой реплике не продолжаем. Требуется определить текст сообщения программиста1С; в доступной переписке он однозначно не найден, запрошена повторная передача текста.
- Телефон/приложение/production не менялись. Предыдущая физическая точка остановки сохранена, новых проверок Maestro/real24h нет. Следующее действие по текущему уточнению — разобрать переданный материал1С после получения, не приписывая ему отсутствующее содержимое.


### 2026-10-22, 14:44 Баку — материалы 1С найдены; повторный запрос был лишним

- Пользователь уточнил, что TXT и API уже передал. Проверены доступные вложения и список/содержание задач средствами приложения. Найден исходный файл /home/codex-alt/.codex/attachments/b7782513-c833-4c3b-9e68-7b6530189996/API response.txt (22181040 bytes). Локальная read-only проверка JSON успешна: data.goods содержит8852 записей, Номенклатура/Количество/Цена. Сырые данные в журнал/репозиторий не копировались.
- Источник установлен: активная задача «Спроектировать продажи через ИИ-звон», thread01a16295-5f3e-78d0-bbeb-9547ca7097bd. В ней пользователь передал файл и endpoint AvailableBalances, и там уже выполняется разбор/адаптация каталога. Её worktree leaddrive-zeytun-1c-voice-design не изменяли, параллельную реализацию не запускали.
- Предыдущая запись «нужна повторная передача текста1С» более не актуальна: материалы найдены самостоятельно. Пользователю признана ошибка смешения двух задач; повторно присылать файл/API для анализа не требуется.
- Исходная attendance-задача сохраняет прежний незавершённый физический этап. Телефон/production/исходники не менялись. Текущий результат уточнения: нужные материалы найдены и сверены; следующий шаг1С уже выполняется в соответствующей задаче, attendance возобновляется с сохранённого STARTED day при фактическом доступе к телефону.


### 2026-10-22, 14:45 Баку — пользователь повторно указал AvailableBalances

- Получен endpoint AvailableBalances из связанной задачи1С. Выполнены только read-only GET без авторизации, с timeout8с и ограниченным чтением1024bytes: HTTP401, WWW-Authenticate Basic; HTTPS на том же порту завершился TLS WRONG_VERSION_NUMBER. Авторизованное чтение каталога не проверено, методы записи не вызывались.
- Сверено текущее состояние задачи «Спроектировать продажи через ИИ-звон»: разбор8852 позиций из TXT и подготовка адаптера уже выполняются там; пользователь там подтвердил отсутствие HTTPS/VPN-адреса. Повторно эти сведения не запрашиваем. Файлы соседнего worktree не менялись.
- Результат текущей проверки: endpoint отвечает и требует авторизации; имеющегося TXT достаточно для разработки разбора. Последнее действие — проверка транспорта/ответа401. Остановка живой интеграции — нет подтверждённого авторизованного доступа. Следующее действие — продолжение адаптера в исходной задаче1С; состояние attendance/телефона не менялось.


### 2026-10-22, 14:53 Баку — вход в 1С подтверждён; обнаружен обязательный Guid запроса

- Пользователь предоставил учётные данные API. Они использованы только в памяти проверочного процесса через stdin с отключённым echo; не записаны в исходники, журналы, аргументы процесса или credential-файл. Публикации/изменения production/заказов не выполнялись.
- Ресурсы перед узкой проверкой: availableRAM~15.9GB, memoryPSI0, diskFree148GB. Проверочный процесс ограничивает timeout, размер ответа35MB и запрещает redirects; результаты без секретов сохранены private tmp/zeytun-1c-api-verification-20261022.
- HTTP Basic с переданными данными принят: authenticated GET и OPTIONS возвращают405, Allow отсутствует. Проверен только тот же метод получения остатков AvailableBalances через POST с пустым JSON. Он отвечает HTTP200, application code100: «Поле объекта не обнаружено (Guid)». Ответ140bytes, каталога goods нет. Это не успешная загрузка, resultFAIL сохранён отдельно от GET405. Повторный диагностический POST подтвердил текст ошибки.
- Уточнение предыдущего блокера: отсутствие авторизации больше не блокирует; теперь отсутствует контракт тела запроса и допустимое значение Guid. Значения товарных GUID из приложенного ответа не подставлялись в неизвестный входной параметр, пустой/случайный GUID не перебирался.
- Поиск AvailableBalances/адреса сервиса в доступных текстовых вложениях не нашёл примера запроса; файл содержит только ответ. Запрошен минимально необходимый пример JSON от программиста, использованный для получения TXT, либо значение/семантика Guid. Пароль повторно не запрашивается.
- В активном соседнем worktree клиент сейчас предполагает GET; обнаруженный POST/Guid контракт необходимо учесть в дальнейшей реализации после уточнения, но чужие незавершённые изменения не трогали. Статус: вход подтверждён, живой каталог ещё не получен. Последнее действие: выявлена точная ошибка1С. Остановка: недостаёт тела запроса/Guid. Следующее действие: проверить корректный запрос и затем согласовать реализацию клиента с реальным контрактом. Attendance/телефон остаются без изменений.


### 2026-10-22, 14:55 Баку — AvailableBalances: корректный запрос дал живой каталог

- Пользователь предоставил JSON с ключами GUID, METRO (false), Warehouse. Значения сохранены только private request-private.json (0600), не скопированы в репозиторий; использован точный регистр ключей без угадывания параметров. Прежний блокер «нет тела запроса/Guid» устранён.
- Один authenticated POST к исходному AvailableBalances PASS: HTTP200, application code0/message success; goods8852. Ответ13879432bytes, elapsed29.306s, SHA2562086e07eb3310b828fbe15f445d783d25cefc2736e2c0b12f1b6265b5642c3c8. Время начала10:54:34Z/14:54:34 Баку. Сравнение parsed data.goods с пользовательским TXT: полное равенство, включая значения и порядок; разница размера файла не означает разницу данных.
- Все строки содержат Номенклатура/Количество/Цена; дополнительные РеферентЦена сохранены. Сырой live ответ остаётся private tmp/zeytun-1c-api-verification-20261022/live-response-private.json (0600); безопасный результат exact-request-result-sanitized.json. Пароль вводился через stdin без echo и на диск не записывался. Старые401/405/application100 результаты сохранены как предыдущие этапы, не заменены успехом.
- Чтение API подтверждено только для предоставленных пользователя/параметров; назначение GUID и бизнес-смысл METRO не выводились из ответа. Создание заказа, резервирование, изменения1С или production не выполнялись.29.306s подтверждают необходимость фоновой загрузки каталога, а не ожидания полного ответа во время звонка.
- Активная задача «Спроектировать продажи через ИИ-звон» продолжает свой parser/client; её файлы не изменены этой проверкой. Проверенный контракт для дальнейшей интеграции: POST JSON с точными ключами GUID/METRO/Warehouse и Basic auth, требовать HTTP200 плюс code0 и валидный goods, ограничивать размер/время и redirects. Предположение о GET устарело.
- Статус: живое чтение каталога и соответствие TXT подтверждены. Последнее действие: получен и сопоставлен полный ответ1С. Точная остановка: проверка API завершена; применение проверенного POST-контракта в рабочем клиенте и фоновая синхронизация ещё не подтверждены. Следующее действие: использовать этот контракт в задаче интеграции1С, затем проверить загрузчик; повторные сведения для проверки чтения у пользователя не нужны. Состояние attendance/телефона неизменно.


### 2026-10-22, 15:07 Баку — возвращение к учёту времени, подключение восстановлено

- Пользователь уточнил, что сообщения1С предназначались другой задаче, и поручил «ты продолжай своюю работу». В этой задаче работы1С завершены; прежние записи сохраняются как история ошибочного контекста, не как новый attendance scope. Продолжается исходный план T01/T02/T03/T17/T06/T04.
- После явного ответа «подключен» обе линии35039/5037 видят один Android device. Проверена1022/source0a48f24; сервер1561c439, office day STARTED,53историческихсобытия; исходныеpermissionsfalse, radios1/1/0, networkallow,chain disabled. Никакие старые события не переписаны.
- Источник ранней неустойчивости UI: оставшийся на телефоне процесс dev.mobile.maestro от прерванного прогона; uiautomator dump завершался137 при разблокированном экране. Проверено отсутствие активного host Maestro test; остановлены только два технических пакетаMaestro, доступ к UI восстановлен. Ошибки вспомогательной сериализации XML и проверки невидимого из-за scroll имени сохранены как ошибки harness, не продукта.
- Три сценария receipt-existing-day/location-finish-granted/location-finish-running дополнены ожиданием enabled действия и явной проверкой FINISH dialog. Это соответствует disabled/busy поведению ReactNative; официальная документацияMaestro selectors/extendedWaitUntil проверена. CLI2.11.0 check-syntax всех3 PASS. Runtime/API/APK не менялись; новые физические прогоны ещё должны подтвердить результат.
- Новый отдельный каталог package-1022-resume-v4 и verifier receipts-v4 подготовлены. Прежние попытки/FAIL не перезаписаны. Следующий шаг: штатно завершить сохранённый STARTED day, затем новый receipt journey и own-marks/correction.

- Продолжение15:10–15:13Баку: выявлена реальная разновидность системного отказа permission_deny_and_dont_ask_again_button. Сценарий receipt теперь принимает оба deny id; первый незаконченный FINISH завершён ответом на уже открытый диалог, повторно FINISH не нажимался. Recovery PASS: ровно1FINISH, все53прежних события и другой аккаунт/заявки/settings неизменны. Предыдущие ошибки harness сохранены.
- receipt-existing-day v4 на1022 PASS110.634s; независимая серверная сверка PASS:54прежнихсобытия неизменны, ровно REOPEN/RESUME/PAUSE/RESUME/FINISH, квитанция видна после restart. Всего59историческихсобытий, текущий HR day VALID/COMPLETED. Скриншот просмотрен: доставленная квитанция и serverReceivedAt видны; QR после завершённого дня выключен с объяснением.
- Официальный Maestro2.11.0 check-syntax повторён после расширения deny selector: PASS. Локальный diff-check PASS. Runtime/Android/schema неизменны; полный build/TypeScript локально NOT RUN по ограничению Contabo и отсутствию runtime-изменений, опубликованный runtime0a48f24 имеет свои зелёные CI. Own-marks v4 сейчас выполняется; correction/новый24h ещё NOT RUN.

-15:16Баку own-mark-details v4 PASS136.325s:30собственныхканоническихitems совпадают с HR history, no-store, anonymous401/unknown404/scopeOverride400, координаты перерывов отсутствуют, чтение не создаёт события и не меняет permissions; закрытый отчёт не раскрывается после restart.
-15:23Баку correction-from-day v4 PASS60.311s на real-date admin EMPLOYEE fixture: дата/минуты вAsia/Baku подставлены, форма закрыта без заявки, история/settings неизменны. Для переключения private harness исправлена прокрутка: прежний жест начинался в закреплённом QR-блоке выше ScrollView; теперь используется фактический scroll bounds. Это не изменение приложения.15:26Баку office восстановлен штатным UI-входом; обе истории и списки заявок совпадают с baseline.
- Опубликованc888d4f3022b7a4b99adaa8a958fcad80e119125 в draftPR196. CI39769470008 SUCCESS; emulator39769470018 SUCCESS; ordinary native39769470013 ещё IN_PROGRESS. Установленный runtime0a48f24/1022 неизменен. Новые физические receipt/own-marks/correction подтверждены именно1022, не автоматически собранной APK.
- Следующие T01gates: повторный настоящий GPS на исправленном flow, opticalQR на1022 и новыйreal24h. Для QR prepared обработка независимого системного запросаGPS после оптического подтверждения; syntaxPASS. Токены не подставляются в телефон. Новый24h покаNOT RUN; prerequisites обновлены на реальные v4PASS, после Maestro capture освобождаются только технические driver packages перед native UI observations.


### 2026-10-22, 15:40 Баку — результаты QR/GPS и ограничение спутникового провайдера

- c888d4f: CI39769470008, emulator contract39769470018, обычная Android build39769470013 SUCCESS. Installed runtime остаётся0a48f24/1022; новая APK не устанавливалась. Receipt/own marks/correction v4 PASS сохраняются.
- GPS-v4: Maestro location-finish-granted PASS48.369с, но overall INSIDE FAIL: location UNAVAILABLE. REOPEN/RESUME/FINISH добавлены штатно,59 предыдущих событий сохранены, настройки/разрешения восстановлены. Глобальная геолокация включена; по системной диагностике свежего спутникового фикса не было. Координаты в публичный evidence не включены.
- QR-v4: камера открылась; ожидание оптического подтверждения300с истекло, Maestro FAIL350.421с. Временная страница имела только собственный контрольный просмотр/запрос, внешнего открытия не наблюдалось. Это НЕ доказательство дефекта распознавания и НЕ PASS. После REOPEN/RESUME стало64 события, новых FINISH0; office day STARTED. Разрешения восстановлены, сеть own/MTM allow, временная QR-страница/туннель остановлены. Повтор требует нового живого QR и физического наведения; старую ссылку не использовать.
- Диагностика кода: attendance-location-fix запрашивает только Android GPS highAccuracy=true,7с. Когда GPS включён, AndroidLocationManager не переключается на network при timeout; network используется только при выключенном GPS. PlayServices не переключаем: существующий проект документирует native Listener-null crash этой зависимости.
- План узкого исправления: после native TIMEOUT/POSITION_UNAVAILABLE запросить свежую сетевую позицию через тот же AndroidLocationManager (maximumAge=0), максимум4с дополнительно, общий acquisition bound12с. Согласие/аккаунт/разрешение повторно проверяются; при отзыве, неверной provenance или отказе разрешения повторного чтения нет. Точность и mock-метаданные передаются без подмены, серверные правила INSIDE не ослабляются. Затем targeted tests → checkpoint/push в разрешённый PR196 → полные hosted gates → новая APK и повтор физической приёмки. Суточный тест покаNOT RUN, чтобы не менять приложение во время выдержки.


### 2026-10-22, 15:47 Баку — свежая позиция в помещении; реальный QR подтверждён

- Узкое исправление attendance-location-fix реализовано: спутники7с → свежая сетевая позиция4с только при native error2/3, общий Android bound12с. maximumAge=0 в обоих запросах, повторная проверка разрешения и privacy guard; mock/accuracy не скрываются. iOS прежний8с/single-request. PlayServices/background/watch не добавлены.
- Проверки:4 targeted suites68tests PASS (сервис координат/согласие/standalone runtime/field permission lifecycle); после добавления2 race/platform regressions отдельный окончательный GPS suite24tests PASS. git diff --check PASS. Полный TypeScript, полные Jest/Android builds NOT RUN на Contabo по контракту; будут hosted CI после push. Установленная1022 остаётся прежней, изменение ещё не физически проверено.
- Пользователь открыл новую QR-страницу и навёл камеру. По независимой серверной сверке новый FINISH имеет QR VERIFIED нужного тестового филиала, facts VALID,64 прежних события неизменны. Токен в приложение не подставлялся. Это реальный optical PASS, но не Maestro PASS.
- Вспомогательные попыткиv5–v7 сохранены как FAIL: переход UI одновременно с физическим сценарием, затем изменившееся пользователем разрешение камеры, затем открытый scanner вместо ожидаемого экрана workday. Эти failures не удаляем и не называем дефектами QR. v8 запускает Maestro непосредственно из текущего STARTED дня; промежуточные native-переходы исключены, baseline67events. Новый QRviewerv5 активен до своего20мин предела; при завершении теста остановить.


### 2026-10-22, 15:53 Баку — Maestro QR1022 PASS; исправление GPS в CI

- Optical QR-v8 Maestro PASS300.427с. Реальная камера, физическое наведение пользователя, без token injection. Независимая HR-проверка: ровно1FINISH, QR VERIFIED ожидаемого тестового филиала, facts VALID,67 прошлых событий неизменны, заявки/другой аккаунт/сеть/радио/package identity сохранены; разрешения восстановлены к baseline (CAMERA=true по действию пользователя, FINE/COARSE=false). Всего68 событий, day COMPLETED. Screenshot verified-screen.png просмотрен. Временная QRviewerv5 страница и собственный tunnel остановлены после результата; пользователь может убрать телефон.
- Исправление свежего network positioning опубликовано3ae30f7304d56f976f75833ee20b42f4d00e80d4. CI39773369382 SUCCESS, emulator contract39773369470 SUCCESS; ordinary native39773369353/standalone39773362822 ещё IN_PROGRESS. Standalone ожидается1025. Полная проверка Jest/TypeScript в standalone job уже SUCCESS, native сборка продолжается.
- Установленная1022 физически принята для receipts, own marks, correction и opticalQR. GPSINSIDE остаётсяFAIL/UNAVAILABLE; real24h NOT RUN. Следующий шаг: дождаться обеих native gates3ae, скачать SHA-bound1025, проверить пустую очередь/историю/права, обновить отдельный пакет без очистки и проверить получение свежей позиции.


### 2026-10-22, 16:05 Баку —1025 установлена; свежая позиция OUTSIDE подтверждена

- Все gates3ae30f7 SUCCESS: CI39773369382 (280suites/2484PASS/1TODO и TypeScript), standalone39773362822, ordinary39773369353, emulator39773369470. Artifact12424026030, archive digest bba57a2befccb99973b91513cc6d3cdf4bc6d59b59674af157d77c8b39c3796f проверен; APK1025 sha2564d15021dc914aa9a1d6e2b4d57747a7d085bf7014ddf2be123907d42b3f36615 установлен обновлением. Вход, UID,68 прежних событий, другой аккаунт/заявки, настройки и ordinaryMTM1710 сохранены.
- GPS-v1/1025 Maestro PASS54.21с: свежая позиция получена спустя7.258с после действия, accuracy100м. Сервер OUTSIDE, расстояние9678м независимо проверено. Первоначальное ожидание INSIDE не выполнено и остаётся FAIL; отдельная фактическая проверка OUTSIDE PASS. РовноREOPEN/RESUME/FINISH добавлены,68 предшествующих событий неизменны, настройки восстановлены.
- По существующему разрешению пользователя «для теста... используй координаты которые сейчас использует приложение» опубликована новая revision только GPS test — 22.10.2026 в вымышленной mtm-attendance-phone. Центр взят из свежей собственной отметки1025, радиус100м/название/прочие поля сохранены; другойQRфилиал не менялся. Автор/tenant проверены. Старые события/состояние OUTSIDE не пересчитались, прежняя revision сохранена. Сырые координаты только private, не Git. GPS-v2 выполняет отдельный новый INSIDE-test, ещё без результата.
- Новая подготовка real24h physical_soak_v4.py привязана строго к3ae/1025 и требует PASSGPS-v2 + receipts/own-marks/correction/regression на1025. Предыдущийv3/1022 никогда не стартовал. Новой выдержки и срока пока нет. Private native nodes helper теперь ограниченно повторяет чтение при transient splash, не нажимает элементы посторонних приложений; прежняя версия сохранена.


### 2026-10-22, 16:06 Баку — реальный INSIDE1025 PASS

- GPS-v2 Maestro PASS48.918с, независимый сервер INSIDE/0м для новой revision тестовогоGPSфилиала с прежним radius100м. Новая настоящая foreground позиция, не подстановка координат в отметку.71 прошлое событие/заявки/радио сохранены, ровноREOPEN/RESUME/FINISH добавлены; исходные разрешения восстановлены. Всего74 события, day COMPLETED. Отдельный OUTSIDE-v1 остаётся в evidence, его неудачное первоначальное ожиданиеINSIDE не переписано.
- На1025 начат новый regression runner: receipts → own marks → real-date correction admin fixture → office restored, с отдельными immutable результатами и финальным восстановлением разрешения камеры пользователя. Только после всех PASS начнётся physical_soak_v4; сейчас real24h NOT RUN. CRM journal checkpoint8332599b9 локальный, серверный код/release не менялся.


### 2026-10-22, 16:13 Баку — краткий обрыв Maestro, исходные данные сохранены

- Regression1025-v1 FAIL: Maestro receipt-existing-day89.571с остановился с DeviceServerDied/grpc UNAVAILABLE при чтении иерархии после финального restart. Все5 положенных событий REOPEN/RESUME/PAUSE/RESUME/FINISH уже доставлены,74 прежних события неизменны, day COMPLETED. Это неPASS полногоflow, прежний failure сохранён. РазрешенияCAMERA=true/FINE=false/COARSE=false восстановлены, обе сетиallow, суточная блокировка не начиналась.
- ADB продолжает отвечать; завершённые технические driver packages освобождены без очистки приложения. Новая отдельная bounded попытка regression-v2 запущена; предыдущие артефакты не перезаписываются. При повторной неисправности сначала диагностика, не бесконечный локальный retry. physical_soak_v4 будет требовать именно v2PASS; final cleanup исправлен на восстановление каждого исходного permission, включая пользовательскоеCAMERA=true.


### 2026-10-22, 16:17 Баку — receipt1025 PASS; продолжение read-only приёмки

- Receipt-v2 Maestro PASS99.712с; независимая сверка PASS:79 предыдущих событий неизменны, ровноREOPEN/RESUME/PAUSE/RESUME/FINISH, receipt видна после restart, другой аккаунт/заявки/настройки неизменны. Всего84 события. После этого read-only helper остановился доUI из-за ошибочного имени baseline20261025 вместо20261022 (результатFAIL сохранён). Исправлена только ссылка private harness; продолжение readonly-v3 использует уже пройденнуюreceipt-v2 и не повторяет записи рабочего дня.
- В offline-soak-capture добавлены enabled checks перед действиями и перед cold restart послеPAUSE/RESUME/FINISH. Это тот же выявленный ранее риск преждевременного restart, исправленный дляreceipt. Maestro2.11 check-syntax PASS; runtime не изменился, установленный3ae/1025 остаётся кандидатом. Физический offline capture покаNOT RUN.
- Публикуется логический test/evidence checkpoint; builds на новойtest-onlySHA не устанавливать автоматически. Runtime equivalence к3ae проверить поsrc/android/package/index. Real24h по-прежнему не начат; после read-only приёмки запустить private physical_soak_v4 с исходными permission restoration и независимым real-time guard.


### 2026-10-22, 16:23 Баку — расширенная история и bounded scroll

- Own marks1025-v3: API/данные48items загружены, но MaestroFAIL123.632с: scrolling до нижнего close вышел за60с. Screenshot подтверждает реальную прокрутку до поздних отметок, включаяOUTSIDE; это не отсутствие данных/элемента. Лимитread-onlyпрокрутки увеличен до180с, speed75, без удаления тестовой истории/ослабления утверждений. Maestro check-syntax PASS. Предыдущий failure сохранён; readonly-v4 повторяет только чтение и correction, не записи рабочего дня.
- Test/evidence d56a15e опубликован. Его CI39777195289/emulator39777195358 SUCCESS; обычная39777195278 и standalone39777185632 ещё IN_PROGRESS. Runtime/src/android/package/index не отличаются от3ae; новаяAPK автоматически не устанавливается. Изменение own-mark scroll пока следующим локальным checkpoint, фактический flowhash будет в результате.


### 2026-10-22, 16:26 Баку — own marks1025 PASS

- Maestro own-marks-v4 PASS147.306с (flowhash19fedae7), независимая сверка48 canonical records PASS. Read-only/no-store, anonymous401/unknown404/scopeoverride400, break coordinates отсутствуют; события/заявки/настройки не изменились, report закрыт послеrestart. Увеличенного ограниченного scroll-бюджета хватило для сохранённой48-itemистории, приложение не менялось.
- Последний завершённый этап: собственные записи1025. Текущий runner выполняет native switch office→admin и correction prefill/cancel на real-datefixture, затем office restore. В сети телефона ограничений нет. Следующий шаг после aggregatePASS — новый real24h-v4; до этого нет start/deadline и нельзя говорить, что суточный тест идёт.


### 2026-10-22, 16:32 Баку — функциональная приёмка1025 PASS; подготовка real24h

- Correction-v4 Maestro PASS51.713с; дата/минуты канонического real-date day поAsia/Baku, no accidental request/workday change. Aggregate readonly-v4 PASS: receipt-v2/own-marks-v4/correction-v4, office account восстановлен, обе истории/заявки сохранены, исходные разрешения restored. Исторических событий84; новых действий на read-only стадиях не добавлено.
- d56a15e все hosted gates SUCCESS, включая ordinary39777195278/standalone39777185632. Более новые APK не установлены; зафиксированный runtime3ae/1025 остаётся на телефоне. Последнее изменение flow own-marks(180с, speed75) прошло syntax и реальныйMaestro, отдельный checkpoint публикуется без runtime changes.
- Проверено отсутствие прежнего owned recovery watchdog. Запущен detached physical_soak_v4.py --start-physical-soak (metadata private physical-soak-v4-process.json, stdout physical-soak-v4-runner.log). Пока PREPARING, нельзя считать24h начатой/пройденной до подтверждённых offlineAt/queueCaptured. Ограничивается только отдельный тестовый пакет; обычноеMTM и радио сохраняются. Пользователю сообщено оставитьMac/USB работающими. Автоматического уведомления чата не настроено: соответствующего инструмента в этой сессии нет; сам тест пишет progress/result.


### 2026-10-22, 16:47 Баку — real24h-v4 прерван на подготовке; срок отменён

- physical-soak-v4 FAIL до основной выдержки: offline capture Maestro89.95с ожидал enabled break после прокрутки вверх, когда кнопка оказалась ниже viewport. До сбоя локально сохранён только PAUSE. Проверка syntax обновлённого flow PASS: перед каждым enabled wait добавлена явная прокрутка к тому же control; ожидания сохранены. Runtime APK3ae/1025 не менялся.
- Cleanup v4 PASS: network обоих приложений allow, chain disabled, радио и исходные permissions сохранены; телефон доступен. Прежний срок23.10 16:36 Баку отменён,24h НЕ пройдены и сейчас НЕ идут. Запущена независимая проверка доставки сохранённого PAUSE без дубликатов/изменения истории. Следующая попытка v5 должна продолжить реально PAUSED день обычным RESUME, не переписывать старые события.


### 2026-10-22, 16:46 Баку — PAUSE восстановлен, v5 PREPARING

- Recovery v4 PASS:86 прежних событий неизменны, один PAUSE доставлен с исходным claimedAt; после restart дубликатов нет, pending отсутствует. Всего87 событий, PAUSED. Заявки/другой аккаунт/настройки/пакеты сохранены. Native screenshot подтверждает перерыв.
- Запущена отдельная попытка physical_soak_v5: обычный RESUME текущего PAUSED дня, затем исправленный offline capture и полные24h без изменения часов. Пока PREPARING; дедлайн сообщать только после RUNNING. Все четыре hosted gates9b54 SUCCESS: CI39779282800, emulator39779283007, ordinary39779282832, standalone39779274056. Runtime не отличается от установленного3ae/1025; новые APK не устанавливались.


### 2026-10-22, 16:52 Баку — исправлено неверное ожидание после offline FINISH

- v5 capture FAIL156.208с: PAUSE/RESUME прошли с новой прокруткой, FINISH достиг completed/pending, но автотест ожидал office-workday-return. Проверка AttendanceWorkdayScreen.tsx показала returnable = !offline && !finishing; эта кнопка намеренно отсутствует. Это ошибка теста, не дефект приложения. Прежний срок23.10 16:49 отменён; cleanup сети/permissions PASS. Три сохранённые отметки восстанавливаются обычным запуском.
- Проверка store/workday.ts подтвердила: FINISH_PENDING публикуется в UI только после сохранения outbox и AsyncStorage. Flow теперь проверяет completed + pending + отсутствие онлайн-действий, затем настоящий cold restart и сохранение completed/pending. Неприменимое ожидание return удалено; runtime/права/24h gates не ослаблялись. Новая ограниченная v6 подготовлена на основании причины, требует recovery-v5 PASS.


### 2026-10-22, 16:53 Баку — recovery-v5 PASS; v6 PREPARING

- Восстановление PASS:88 прежних событий неизменны, PAUSE/RESUME/FINISH доставлены с исходными claimedAt, без дублей после cold restart. Всего91 событие, COMPLETED, pending отсутствует, заявки/другой аккаунт/сеть/permissions/пакеты сохранены. Maestro syntax исправленного capture PASS.
- Detached physical_soak_v6 запущен из восстановленного COMPLETED, требует recovery-v5 PASS; исходный runtime3ae/1025 и полные сутки без изменения времени сохранены. Пока PREPARING, срока до подтверждённого RUNNING нет.


### 2026-10-22, 16:58 Баку — real24h-v6 RUNNING, offline capture PASS

- Maestro capture-v6 PASS93.169с, flowSHA c774d3d6cd42ad80aa76287a40922bed994836557e2bf0254e6d7c3419057ec7: PAUSE/RESUME/FINISH сохранены после cold restart. Независимое native наблюдение подтвердило completed/pending/offline; два sample подтверждают неизменную серверную историю, блокировку только отдельного пакета, доступность ordinaryMTM, прежние часы/boot/package/radios. Контроль server baseline93events; три новых события остаются на телефоне.
- Начало outage22.10 16:54:49 Баку. Раннее завершение24h+120s23.10 16:56:49 Баку (пользователю округлено16:57), затем возврат сети и независимая проверка3исходных claimedAt/DELAYED_CLAIM/отсутствия дублей. До этого24h PASS не заявляется. Длительный runner physical_soak_v6.py detached, metadata physical-soak-v6-process.json; progress/result в private physical-soak-20261022-v6. ОбычноеMTM/радио не ограничены. Попросили оставитьMac включённым иUSBподключённым; повторного наведенияQR не требуется.
- Исправления flow опубликованы dcdddfc7. CI39782171350/emulator39782171208 SUCCESS; ordinary39782171136/standalone39782163319 ещё IN_PROGRESS. Установленный3ae/1025 не менялся; его gates уже SUCCESS. Full builds/browserE2E на Contabo NOT RUN по hostcontract; physical24h финальный gate пока RUNNING, expiry/replay NOT RUN до настоящего срока.
- Точка остановки: очередь захвачена, началась выдержка, PR196 draft. Следующее действие: проверить progress/result v6 и hosted gates dcdddfc; при failure сначала восстановить сеть/очередь без изменения времени и сохранить failure; при PASS завершить полную приёмку и выпуск по действующему разрешению. Chat-уведомление/wakeup не настроено, соответствующего инструмента нет. Этот журнал/evidence checkpoint локальный; опубликованный код dcdddfc остаётся точным источником теста.


### 2026-10-22, 17:11 Баку — запрос на компактность и интерактивность

- Пользователь: «в приложении не компактно... как будто книгу читаешь... нужно больше интерактивности». Цель — быстрые ежедневные действия сотрудника и подробности по запросу, без потери функций/видимости ошибок. Текущая причина: большие header/QR блоки и одновременно раскрытые подсказки, квитанции, GPS, допуск телефона и согласие.
- Применяем distill/impeccable; существующий .impeccable.md задаёт бренд/платформу, а явный контекст этого модуля — кадровый сотрудник и собственный рабочий день. Готовим сначала кликабельный проектный макет главного экрана для конкретного review. Реальные данные/камера/API не используются. Продолжающийся physical-soak-v6 RUNNING (3 samples, checked17:02 Баку); установленный APK/очередь/permissions не меняем во время выдержки.
- Направление: компактный статус и следующий шаг, QR доступен сразу, перерыв/завершение рядом; короткая строка доставки с подробностями, история по нажатию, отдельное раскрытие GPS/телефона. Ошибки, конфликты и pending не прячем. Демонстрация должна показать running/paused/completed/offline и подтверждение FINISH. Финансовые/кадровые процессы из следующих этапов не добавляются.


### 2026-10-22, 17:20 Баку — компактный интерактивный вариант готов

- Создан project-owned docs/prototypes/attendance-compact.html: компактный status/actions, локальные перерыв/возвращение/FINISH-confirmation, история/квитанции/GPS/допуск по нажатию, отдельные экраны и короткая навигация. Только вымышленные данные; камера и отправка заявки обозначены демонстрацией. Это макет, не установленный native UI.
- Изолированная браузерная приёмка27checks PASS, JSsyntax и diffcheck PASS, светлый/тёмный снимки просмотрены, 320/390/736 без горизонтального overflow. Исправлены подпись вкладки и прототипная отправка формы (sandbox не допускает native submit); ранние FAIL сохранены приватно. Сырых пользовательских данных/API/геолокационных запросов нет. Полные builds/E2E и physical native UI NOT RUN — runtime не менялся.
- Design brief/критерии переноса: docs/attendance-compact-design.md; sanitized evidence docs/evidence/attendance-compact-prototype-20261022.json. Соответствие published consent, pending/conflict visibility, device approval/recovery, actual permissions, identity isolation и независимостьGPS/QR обязательно сохранить при переносе.
- Проверка physical-soak-v6: RUNNING,6samples, последний13:18:40UTC (17:18:40Баку), без failure. Телефон/очередь/установленная3ae/1025 не менялись. Точка остановки — конкретный кликабельный вариант готов к просмотру; следующий шаг — перенос согласованной компоновки в native и приёмка после текущей24hвыдержки. Макет и журнал сохраняются локальным checkpoint, серверного выпуска по этой UIработе нет.


### 2026-10-22, 17:24 Баку — исправлен путь inline-просмотра

- Пользователь сообщил «Invalid visualization read request» для attendance-compact.html и поручил исправить; затем «продолжай». Ошибка относится к чтению для показа, не доказывает ошибку JavaScript. Предыдущая ссылка указывала на feature worktree вне явно предоставленных conversation writable roots; это вероятная причина, client-side диагноз не подтверждён.
- Побайтово идентичная обычная (не symlink) копия помещена в явно предоставленный thread root: /home/codex-alt/.codex/visualizations/2026/10/21/01a15d2b-b2d9-7b43-8e70-027ffd531e5d/attendance-compact.html.24540bytes, SHA256 e5f484105cf436c85feb5066f5986f2e9207a775391faba6dee150559c184a79 совпадает с ранее проверенным27checksPASS источником. Helper render.py успешно прочитал именно новый путь и создал проверочный sandbox wrapper. JS/UI не изменялись; повтор всех browser checks/builds NOT RUN: копия побайтово идентична.
- Точка остановки — в финальном ответе повторно выдаётся inline reference на thread-scoped path; успешный показ внутри клиента до ответа проверить нельзя. Следующий шаг — просмотр компактного варианта и дальнейшая native-реализация. Physical-soak-v6 по прочитанному результату RUNNING,6samples; ни устройство, ни очередь, ни APK этой правкой не менялись. Изменение журналируется локальным checkpoint, push/deploy не требуются.


### 2026-10-22, 17:34 Баку — перенос согласованного макета в native

- Пользователь прямо поручил «переноси». Это согласование compact layout и раскрытия деталей из ранее показанного прототипа, включая короткие подписи вкладок. Работа продолжается в codex/attendance-standalone, rashadoni/leaddrive-mtm. Plan:1) compact-only presentation в standalone navigation, сохранение прежнего обычного MTM/manager layout;2) scoped disclosures квитанций/GPS/телефона/согласия без сокрытия ошибок;3) RU/AZ/EN, meaningful rendered regressions и обновлениеMaestro;4) hosted CI/APK, физическая установка после завершения real24h.
- Действующие handlers/permission guards/согласие/очередь сохраняются. Фактическое expiry офлайн-допуска показывать из bootstrap.validUntil, не из выдуманного таймера. Состояния доставки и кадрового решения различаются. Новый UI не меняет сервер и не даёт новых прав. Последняя прочитанная выдержкаv6 RUNNING; текущий APK3ae/1025 не заменяем.


### 2026-10-22, 17:51 Баку — native83PASS; v6 оборван связью

- Компактная реализация и legacy поведение:4целевыхsuites/83tests PASS. Проверены3языка, полное согласие/отзыв, блокировки/pending/conflict/HRreview, обнуление раскрытия при сменеserver, старые callbacks. TargetedESLint8productionfiles PASS с0errors/14warnings; устранены2старых hookdiagnostics эквивалентным aliasref и стабильнымreloadcallback. Предыдущие локальные FAIL: добавленнаяIcondependency требовала testmock; helper выбирал composite вместоnativePressable; тесты свежего дня ошибочно ожидали историю несуществующегоworkday. Причины исправлены, assertions не ослаблены.
- При контрольном чтении обнаружен physical-soak-v6 FAIL13:39:39UTC/17:39:39Баку: Mac reverse35039 закрыт,5037relayбезupstream,35037/35038 такжеrefused.9samples, capturePASS93.169с остаётся действительным, но24h НЕ пройдены. Cleanup после потери соединения не подтверждён (cleanupFailure=true); нельзя обещать, что таймернаAndroid восстановилсеть. Старый срок23.10 16:57отменён. Пользователю дан копируемый loop подключения и один asyncзапрос; собственной MacSSH/другого транспорта нет.
- Следующий телефонный шаг: при возвращении связи сначала восстановить только ownappnetwork, проверить исходные permissions/radios и три queuedclaims/неизменность93старыхevents/дубликаты, затем новыйUI после зелёныхgates. Новую24h до этого не начинать. Native/CIподготовка продолжается независимо.


### 2026-10-22, 17:59 Баку — компактная native-компоновка готова к CI

- Implemented: standalone-only compact screen/navigation; shared render helpers preserve canonical callbacks and legacy layout. Flat accessible disclosures, identity, explicit pending/conflict/failure, server-derived offline.validUntil, consent/read/withdrawal, QR-disabled reasons, current mark recovery, account-scoped details.95targetedchecks/7suites PASS; targetedESLint0errors/14warnings;22AZ/RU/ENkeys parityPASS.6Maestrojourneys+sharedhelper syntaxPASS; новыйsmoke проверяется отдельно. ReacthosttreeAZ/RU/EN/offline сохранён; это не реальный снимок телефона.
- Линтеры исправлены точечно; старые literal guards manager shell сохранены, существующий source-regression PASS. Краткая пометка HRreview уточнена как состояние при доставке, без ложного утверждения, что разбор ещё открыт. Новые UItestfailingpreconditions исправлены без удаления assertion.
- FullTS/Jest/AndroidBuild локально NOT RUN по hostcontract: запускаем publishedbranch GitHubgates. PhysicalcompactUI NOT RUN до восстановленияMac. УстановленныйAPK/данные не менялись. Publish/CI для active package разрешены ранее, «переноси» согласует этот UI. Следующий шаг — checkpoint/push, exact-head gates и SHA-boundAPK; после возврата телефона сначала recoveryqueuev6.


### 2026-10-22, 18:13 Баку — компактный1029 собран, USB пока отсутствует

- Опубликован checkpoint6aced57c99f492df71f92262f048f390d400b54b, PR196 остаётся draft. Полный hosted CI39791935061 PASS:280suites/2498tests/1TODO, TypeScriptPASS. Emulator-contract39791935010 PASS (не actualemulator). Standalone39791925849 PASS: versionCode1029, подпись/package/отсутствие backgroundlocation проверены. Ordinary39791935096 ещё IN_PROGRESS на момент этой записи, завершённые build/signature/artifactsteps не подменяют финальный статусrun.
- SHA-bound artifact12432980021 получен: GitHubZIP SHA256 f44246e4ae2aa27c370af557dfb22e6051f39aa33bfa996d3aca69b8703a34b5 совпал; APK SHA2560f3e9780200fd10256149bd4dad67e0cb2a1ed9f0dceb03e432c77d809d7533c совпал с артефактом. Приватная папкаapk-6aced57; установка NOT RUN, текущий телефонныйruntime3ae/1025 не менялся.
- Пользователь прислал снимок запущенногоMacloop. Повторные ADBget-state/reconnect подтверждают, что Mac отвечает, но устройств нет. Отправлен единственный необходимый asyncшаг: переподключитьUSB/разблокировать/подтвердитьотладку, без повторного ввода команд. USB/камера физически недоступны со стороныContabo.
- Подготовлен private recover_soak_v6.py с явнымflag и immutable output: восстановление только ownappnetwork, сохранение93историческихevents, ровно3 PAUSE/RESUME/FINISH в исходномокнеclaimedAt, no-duplicatesпослеrestart, сохранениеrequests/otheraccount и точныйrestorepermissions. Скрипт только скомпилирован, на телефоне NOT RUN;24hguard не менялся. Private Maestroallowlist дополнен smoke/compact-workday, прежнийrunnerсохранён.
- PR196 описание обновлено: компактный UI/реальные проверки, v6FAIL/отменённыйсрок вместо устаревшегоRUNNING; PR прикреплён к задаче. Серверныхизменений/выпуска нет. Heavyлокальныеbuilds/E2E NOT RUN поhostcontract. Точка остановки: готовый1029ожидаетфинальныйordinarygate ифизическийUSB; следующийшаг — recoveryv6, затем install-r/compactMaestro с независимойсверкойистории иrestorepermissions.


### 2026-10-22, 18:23 Баку — USB восстановлен; очередь v6 восстановлена

- После второго физического подтвержденияUSB телефон появился. Recoveryv1 доставил3PAUSE/RESUME/FINISH:93старыхevents сохранены,96всего, исходныеclaimedAt в первоначальномofflineокне, valid/completed, requests/otheraccount неизменны, coldrestart бездублей. Cleanup v1/v2 FAIL, ранние результаты сохранены. Причина уточнена: не потеряUSB, а AndroidServiceSpecificException при повторномразрешенииalready-allowedpackage (отсутствующаяfirewallentry другогопрофиля). Предыдущее объяснение «краткийсбойсвязи» этой записью уточняется.
- Private recoveryguard теперь читает ownallow перед повторноймутацией, не ослабляетпроверкиистории. Recoveryv3 PASS14:21:22UTC/18:21Баку:3исходныхclaims,96events, no duplicates/pending, originalCAMERA=true/FINE=false/COARSE=false, radios/UIDs/обычныйMTM сохранены, ownnetworkallow/chain disabled. Это восстановление прерваннойпопытки, НЕ24hPASS; v6FAIL и отменённыйсрок сохранены.
- Все exact6aced checksPASS: tests/scope/contract/attendance-apk/build-apk. Ordinaryjob119869943056 завершёнsuccess14:07:37UTC; PRchecks и commitcheck-runs подтверждаютPASS. Workflowaggregateendpoint продолжает отдаватьстароеIN_PROGRESS; это не подменяет проверенныеjob/checkrun. Не запускалиповторнуюсборку.
- Начато adbinstall-r SHA-verified1029 поверх отдельногоприложения, безclearState. Установка на моментзаписи IN_PROGRESS, успех не заявляется. Подготовлен bounded read-onlycompact/receiptsMaestro с независимойсверкойобеихисторий/заявок и restorepermissions. Следующийшаг: проверитьinstallreceipt, открытьреальныйэкран и выполнитьflows.


### 2026-10-22, 18:31 Баку —1029 установлен; compact/receiptsMaestro PASS

- Install-r1029 PASS, source6aced/verifiedAPK0f3e9780: standaloneUID/вход сохранены, ordinaryMTM1710 не заменялся, backgroundlocation отсутствует. Реальныйinitialscreenshot проверен: статус/QR/return/receipts/GPS/consent/help представлены компактно; QRнаcompletedнеактивен с явнойпричиной. Этофизическийnativeэкран, неprototypehostrender.
- Maestro compactsmoke PASS57.557с, flow608e347b: раскрытие/закрытиеreceipts/evidence, noautomaticcoordinates, закрытиепослеrestart. Receipt-existing-day PASS97.093с, flow75e4bdb5: реальныйreturn/pause/restart/resume/finish иполученнаяквитанция. Оба привязаныкinstalled1029/source6aced.
- Первыйaggregate wrapper FAIL AssertionError с успешнымcleanup: ошибочно классифицировалсуществующийreceiptjourney какread-only, хотяоннамеренносоздаёт5фиктивныхevents REOPEN/RESUME/PAUSE/RESUME/FINISH. Этоошибкаindependentguard, не приложенья/не самогоMaestro. FAILсохранён; не повторяемизменяющийflow для исправленияожидания. Запущен отдельныйread-onlyverifier с проверкойровноэтих5events, всех96старыхзаписей,исходногоокнавремени,обеихисторий/заявок,повторногоrestart иsettings. PASSнаэтойстадиипокаожидается.
- Предыдущаяфраза «read-onlycompact/receipts» уточняется: read-onlyтолькоcompactsmoke, receiptjourneyизменяеттестовыйденьпоисходномуплану. Подготовленыversion-boundownmarks/correctionregressions для1029, покаNOT RUN. Следующийшаг — результатindependentverifier, затемпоочереднаяприёмкаистории/исправления сnormalUIaccountswitch и возвратомoffice. Суточныйтестнеидёт/v6FAIL, PRdraft.


### 2026-10-22, 18:33 Баку — independent compact/receipts PASS

- Verifierv3 PASS14:32:37UTC/18:32Баку:96старыхevents неизменны, ровно5новых REOPEN/RESUME/PAUSE/RESUME/FINISH,101всего, coldrestartбез дублей/очереди, обеистории/заявки/permissions/radios/packages/network сохранены, dayCOMPLETED/factsVALID. ОбаMaestroпрогона57.557с/97.093с PASS.
- Verifierv2FAIL сохранён: общаянижняяграницаclaimedAt неприменимакREOPEN. Подтверждёнканоническийсерверныйконтракт src/lib/mtm/workday-return.ts: REOPENкомпенсируетпрежнийFINISH ииспользуетегоfinishedAt, приходсотрудникаотмечаетследующийRESUME/serverReceivedAt. Вv3дляREOPENпроверяетсяточноеравенствопрежнемуcompletedAt, остальные4claimedAt ивсе5receiptвремен проверяютсяпосленачаласценария. Часы/данныенеизменялись, количество/последовательность/защиты неослаблялись.
- Запущен private package_1029_readonly_v1.py, process11052 (execsession): ownmarks/APIprivacyregression, normalUIoffice→admin, realdatecorrectionprefill/cancel, office restore. Этоread-onlyпакетпослеполученных101events; camera временноdenied дляfixture иобязанавосстановитьсявfinally. Точкаостановки: этотrunnerRUNNING, итогнеизвестен; не запускатьпараллельноMaestro/сменуаккаунта/установку. Следующийшаг — результатыownmarks/correction/aggregate иточныйrestore, затемприёмкаGPS1029 передновойреальной24hпопыткой. Подготовленpackage_1029_gps_v1.py, покаNOT RUN.


### 2026-10-22, 18:38 Баку — пользователь расширил UX-аудит на все вкладки

- Пользователь уточнил, что текущий интерфейс слишкоммонотонный/скучный, и поручилпроанализироватьвсе5вкладок и предложитьболееприятные решения. Подтверждено: native1029 изменялпрежде всего «День» итабовыеlabels, остальныесодержательныеэкранынередизайнены. Новыйплан docs/attendance-all-tabs-ux-audit-20261022.md.
- Применяется critique+impeccable; контекстизсуществующего.impeccable.md ипоручениясотрудник/кадровик. SkillcritiqueпрямопроситнезависимуюAssessmentB: запущен agentattendance_design_detection толькоsource/deterministicread-only, безтелефона/чтениямоегоAssessmentA. Основнойагентпросматриваетреальные5вкладок; capture execsession52475, private all-tabs-audit-20261022/assessment-a. Приложение не меняем, формы/прочтениеуведомленийнеотправляем.
- Предыдущийreadonly1029runner11052 завершилсяFAIL доMaestro/сменыаккаунта: серверartifactобновлёндругойработой до086f6efc85158fdf4558f67cd6bc633b07fdb883, аpreflightсравнивалсстарым1561c439. Исходныеpermissionsrestored. ЧерезGitHubcompareподтверждено, что086aheadна24commit и содержитнаш376533merge. Новогонашегосерверноговыпусканебыло; дальнейшуюphysicalприёмкунужнопривязатькфактическому086 и проверитьего неизменностьвнутрипрогона. Нельзяпростоудалятьguard.
- Ownmarks/correction/GPS1029 покаNOT RUN (preflightFAIL не являетсяотказомэтихUI). Currentcompact/receiptsPASS и101serverevents остаютсядействительны. Новую24hпопыткуне запущенодоаудита/следующегоUI, чтобыofflinegate не блокировалпросмотрдругихвкладок; прежняяв6FAIL/восстановлениеPASS. Точкаостановки — реальныйall-tabsаудит; следующийшаг — выводы/варианты ификсацияплана.


### 2026-10-22, 19:14 Баку — аудит всех5вкладок и два варианта готовы

- Выполнен реальныйnativeаудит1029:5верхнихэкранов+5подсостояний, AZ/light/font_scale1.0. СверкапослеаудитаPASS:101events/requestlists/permissions/radios неизменны, никакихотправок/markread, пустыередакторызакрыты, возвращёнDay. Livebackend086f6efc85158fdf4558f67cd6bc633b07fdb883 подтверждёнсодержащимнаш376533, безновогонашегоserverdeploy.
- IndependentAssessmentA: первыйфайлдоB; score23/40 — subjectiveexpert, неuserstudy. Bотдельнымagent: impeccableCLI2.3.2offline/no-install[]=exit0, ноpositivecontrolдоказалRNfalse-negative; отдельныйTSASTscan.7правилInboxсовпадаютсExplanations, darkcontrast3.555/3.963кандидатыриска. Необобщаемвсе5вкарточки: compactDayплоский,Requestsсразделителями. NativeTalkBack/dark/200%/allerrorstatesNOT RUN, причинывотчёте.
- Полныйотчёт/приоритеты/самокритика/план: docs/attendance-all-tabs-ux-audit-20261022.md; sanitizedevidence docs/evidence/attendance-all-tabs-ux-audit-20261022.json. Рекомендован«Ритм»: общиетокеныипонятныеprimaryactions, различнаякомпозициядля5задач. Альтернатива«Спокойный»плоская; данныедемонстрационные. Удаленияфункций, подменысогласия/очереди/GPS/QR/допуска неразрешаются.
- Созданfragment43448bytesSHA256f925a47f0f07bd804e32cbc5d921ace22b0016653a0b599be21340bd1a49c97e: repo docs/prototypes/attendance-all-tabs.html ибайтидентичныйregularfileвявномthreadroot /home/codex-alt/.codex/visualizations/2026/10/21/01a15d2b-b2d9-7b43-8e70-027ffd531e5d/attendance-all-tabs.html. ДляinlineссылатьсяТОЛЬКОнаthreadroot, прежнийInvalidreadнеповторять. Reloadfullvisualizeskillпередследующимизменением; актуальнаяустановленнаяверсия1.0.55 (путь1.0.50устарел).
- Изолированнаяпроверкаконечногопроекта82/82PASS/0JSexceptions:2варианта×5вкладок, формы/validation/filters/empty-unread, pause/finishconfirm/offlineguard, 320/390/736, stablewidth, state-restorenowrite. Light/darkснимкиконечноговариантапросмотрены. РанниехарнессFAILv1iframe/v2initialJSON/v4evalsyntaxсохранены; v3PASS70относилсякпредыдущемуисточнику, итогv5PASS82. Этоstaticprototypecheck, неnativeE2E.
- Кодприложения/установленный1029неизменены. Новыхheavybuilds/E2ENOT RUN: docs/prototype-only, hostcontract. CurrentPR196draft: compact/receiptPASS, otherregressions1029preflightFAILнастаромbackendfreeze, безпрогонаMaestro/сменыaccount;24hнеидёт/v6FAIL/recoveryPASS.
- Точкаостановки: аудитипросматриваемыепредложенияготовы, полныйновыйдизайнвnativeещёнеперенесён. Следующийшаг пообщемуплану — единыекомпоненты/контраст, «Заявки»,«Ответы/Входящие»,«Профиль» иобщаядоводка«Дня»; затемновыеCI/физическиерегрессиисactualbackendSHA и24h. Всеcheckpointпозже6acedпокалокальныеdocs/evidence; ненужныйповторCIоднимdocspushнезапускался.


### 2026-10-22 — принят «Ритм», начат перенос всех пяти вкладок

- Пользователь выбрал «Ритм» в сравнении макетов и подтвердил «отлично». Согласован перенос общего визуального языка на День, Заявки, Ответы, Входящие, Профиль, с сохранением кадровых правил, реальной очереди и всех функций.
- Routing проверен codex-project-context: mtm-attendance-standalone, codex/attendance-standalone, origin rashadoni/leaddrive-mtm. У приложения нет самостоятельного production-server route; Android проходит GitHub CI/artifact/install. CRM не меняем в рамках визуального этапа.
- План реализации: изолированный standalone presentation и контрастные light/dark tokens; компактные списки/фильтры и отдельный фокус формы заявок с календарём; очередность кадровых ответов; группировка входящих без автоматического прочтения; профиль с раскрываемыми группами и полным согласием; доводка Дня. Сохраняем обычный MTM/manager default.
- Проверки: небольшие последовательные rendered regressions и линтер; полный CI/TS/Android только hosted. APK1029 пока остаётся установленным. Очередь после recovery пуста, реальный24h не запущен; v6 остаётся FAIL. Следующий шаг — native implementation и проверки взаимодействий, затем checkpoint/CI.


### 2026-10-22,20:03 Баку — «Ритм» перенесён в native, подготовлен CI checkpoint

- Все5вкладок получили standalone-only композиции черезTimePresentation: общийchrome/контрастнаяпалитра, Dayactualreceipttimeline, Requestsfilters/focusedform/calendar/timepicker, RepliesHR-first/history, Inboxdategroups/unread/explicitread, Profilepreferences/privacy/disclosures. Backend/ordinaryMTM layout не меняются; legal/queue/scoping/confirmation handlers сохранены. Нативные системные шрифты пока оставлены; fonts вебэскиза не установленынативно.
-149целевыхпроверок/9suites PASS последовательно:102screen +46shared/contrast/calendar/nav/legacy +1новаяпроверка отсутствия вчерашнейистории (Day2targetrerunPASS). InitialFAIL тестовогоremountprovider исправлен сохранениемобёртки, assertions не ослаблены. TargetedESLint14files0errors/45warnings (основныеno-void истарыйtabiconcallback);33RU/AZ/ENkeys parity,5MaestroYAMLparse, gitdiffcheck PASS. FullTS/Jest/build локальноNOT RUN, далееhostedCI.
- Подготовленall-tabs-rhythm read-onlyMaestro; requestsubmit передаётcompany-derivedREQUEST_MONTH_OFFSET, correction проверяет selectedcivildate, верхнийcloseform. PhysicalNOT RUN до новойсборки. Прежний1029/101canonicalevents остаютсяbaseline; настоящая24hне идёт, v6FAIL сохранён.
- Точка: sourceготовкcheckpoint/pushPR196 (draft). Дальшеexact-headfullCI/standalone+ordinarybuilds, проверкаSHA APK, при наличиителефонаinstall-r иphysicalalltabs с независимойсверкойисторий/заявок/прочтений/settings.


### 2026-10-22,20:09 Баку — первый полный gate: тесты PASS, TS-ошибка палитры

- Sourcead92c787 опубликован, standalone39811003601, CI39811011360, ordinary39811037975, emulatorcontract39811011419. Полныйstandalone281suites/2515tests/1TODO PASS; TS2352 вTimeUI.tsx: fromEntries(undefined) нельзя привести к полной палитре. APKне собран и не установлен. Исправляем полным начальнымобъектом {...LIGHT} перед определениемдинамическихgetters, безts-ignore/unknown ибез ослаблениятипа. Добавлен regression сменыlivepalette. Результатad92остаётсяFAIL, не переименовыватьего вPASS.
- TargetedESLintпослефинальныхизменений14files0errors/45warnings,18TS/TSXparsePASS,5YAMLparse/33keyparityPASS. Транспорт35037/35038refused,35039listenerpresentноADBget-state/reconnect обаTIMEOUT; запрос пользователю wakeMac/USB, безновыхкоманд. На телефоне1029, новая24hне запущена. Независимаяфинальнаяsourceпроверкапоpolish вработе.


### 2026-10-22,20:20 Баку — review corrections и самостоятельное восстановление телефона

- Независимая sourceпроверка polish нашлаP2: pickerвремени мог выходить за landscapeокно; Inboxshortcut оставлялfilterhistory и скрывал HRзапрос. Исправлено: скроллируемыйpicker сboundedсписками/крупнымтекстом; новыйтипизированныйnavigationintent открываетactionпослеотправки/отмены существующегочерновика, незатираятекст. Естьявнаяподсказка ожидающегоперехода. P3:48dp calendarcells выбираются по внутреннейширинекарточки(а не360порог), длиннаядатапереносится; profilepullrefresh обновляеттакжеinstallation.106screenchecks/3suites PASS;5changedfilesESLint0errors/12warnings;33+1RU/AZ/ENkeys. Физическийlandscape/крупныйтекст покаNOT RUN.
- ИсправлениеTS2352 опубликовано6b915f8, targetedlivepalette4PASS; егоstandalone39811391046 ещёсобирается ибудетзамененоreviewcheckpoint. Не переноситьуспех предыдущихsourceнаследующийAPK.
- ПользовательподтвердилUSB, но ADBещёTIMEOUT. Read-onlyinspection черезразрешённыйloopbackcontabo-admin нашлазависшийsshd728662, codex-alt@notty,2h21m, единственныйlistener35039. После проверкиUID/команды завершёнтолькоэтот task-owned noninteractiveforward обычнымUIDcodex-alt. Macавтоцикл переподключился:ADBdevicePASS. ДругиеSSH/runtime/приложения/данные не трогались; новыхкоманд пользователянепотребовалось. На телефоне пока1029.
- Далееcheckpointreviewfix/push, exact-headfullgates иSHA-boundinstall-r, all-tabsMaestro+скриншоты, независимаясверкаисторий/settings. Новая24h ещёнеидёт.


### 2026-10-22 — защита refresh во время отправки допуска устройства

- Повторный source review подтвердил закрытие picker/intent/calendar P2/P3, но выявил race в добавленном profilepullrefresh: installation.reload мог увеличитьepoch незавершённогоsubmit и оставитьwritingref. Safety-lane узкийплан: сериализоватьload за durablePOST науровнеhook, не менять UUID/правила/сервер; дополнительноbusyguardprofile; проверитьlostresponse→retryс темжеrequestId иотсутствиечужихGET во времяsubmit, затемfullCI. Это исправление новойвозможностиобновления, не расширениеправилдопуска.

- Проверка race PASS:16tests реальногоuseAttendanceInstallation, включаяpendingPOST→внешнийreload→lostreply→retry с прежнимUUID и ровнооднимbegin. Hookload теперь не меняетepoch, когдаwriting.current; profilebusyguard добавлен. TargetedESLint2files0errors. Публикуемфинальныйsourcecheckpoint; source86560cf не устанавливать, посколькупоследующийracefix ещёне включён.


### 2026-10-22,20:27 Баку — финальный35540c2 CI/TS PASS, Android ещёсобирается

- Source35540c2350a5057d4164ee764522a1c35ff62388 опубликован. CI39813020973/job119944140168 completedSUCCESS:281suites/2520tests/1TODO, TS PASS; emulatorcontract39813020966 PASS. Standalone39813014403/job119944638319 и ordinary39813020933/job119944065552 ещёIN_PROGRESS, APK не установлен. Sourcead92FAIL ипромежуточныеотмены6b915/865 сохраненыкакранниеgates, не доказательствофинальнойсборки.
- Сервертеперьab220459683584df2aa0aba4fb02dc1e6d6b4e23. GitHubcompare с376533merge-baseточно376533,ahead25,behind0: нашаreleasedсервернаячастьсохранена. Новыйreadonlyphysicalharness жёсткопривязанкэтомуservingSHA и35540c2; еслисерверизменитсядо/внутрипрогона, результатнеподменять.
- Приватныйrhythm_candidate_acceptance.pyподготовлен/syntaxPASS:3Maestroflows(alltabs/validation/compact),5nativeснимков, restart и независимыесравненияevents/requests/existinginboxreadstate/otheraccount/settings. ExecutionNOT RUNдоexactheadAPKиSHA. Run_flowallowlistдобавляетall-tabs-rhythm иREQUEST_MONTH_OFFSET. PR196body/titleактуализированы, draftсохранён иPRприкреплён. Новая24hне запущена.


### 2026-10-22,20:39 Баку — SHA-bound1033 готов для физической приёмки, GitHub aggregate pending

- APK1033 artifact12442030884 получен: ZIP SHA256 f30542bdca3134294d813b1c0d1f847343c174261066cd3f5f095e235e96e5da совпалсGitHubdigest; APK SHA2563cfb89612b653f30ae176f32b222b20ea9c9ad2a05933506d8416540ffc63c2a совпалсmanifest; build.json source35540c2/package/version1033 подтверждены. Первый downloadhelperstdin запуск завершилсяEOF до созданияпапки; повтор сPTYechooff PASS, URLввыводнепопал.
- Ordinarybuild-apk completedPASS7m39s. Standalonejob119944638319: все17шагов, включаяCompletejob, completedSUCCESS, завершённыеполныетесты/TS/build/package/permissions/signature/cleanup, artifactзагружен16:30:17UTC. Ноaggregatejob/checkrun всёещёIN_PROGRESS/conclusionnull: провереныRESTrun/job/check-runs/attempt1 иconnectedGitHub, не замещаемэтоfalsePASS.
- OfficialGitHubstatus16:36UTC подтверждаетdegradedActions/PR/Packages, incidentwq8305lppdc2. Задержка итоговогосостояния совпадаетсэтиминцидентом; точнаяпричина конкретногозаданиянедоказана. Повторнуютяжёлуюсборкуне запускаембезнеобходимости.
- Уточнениеранееуказаннойпоследовательности: разрешённаяфизическаяприёмкатестовогоAPK можетпродолжиться послефактическогоPASS всехbuild/signingsteps ивсехостальныхfinalsourcegates, дажееслиоркестрацияGitHubещёнезакрылаaggregate. GateJSON честносодержитstandalone=PENDING_GITHUB_ORCHESTRATION, buildSteps=PASS, releaseGate=WAITING_FOR_FINAL_GITHUB_STATUS. Privateharness разрешаеттолькоэтоявноеусловие; source/digest/identity/history/scoping неослаблены. Production/merge/releaseне выполняются, PRdraft. Это продолжениетестов, не ложныйзелёныйCI.
- Телефон1029последнимUIpreflight: fixtureверифицирован, pending/conflict отсутствуют. Следующийшагinstall-r1033 иreadonly3flows+5снимков, затемreversibleappearance; новая24hпокаNOT_STARTED.


### 2026-10-22,20:41 Баку —1033 установлен; первый readonlypreflight остановлен сменой servingSHA

- Install-r1033/source35540c2 PASS: SHA3cfb8961 проверен, standaloneUID/вход сохранены, ordinaryMTM1710 неизменён, backgroundlocationpermission отсутствует.
- Nativev1 FAILдоMaestro/permissions/baselineUI: servingSHA изменилсяab220→3ebd57869129f256db53311b29376b0780de1559. Раннийresult/failure иv1script сохранены; это preflightstop, не UIregression. Новыйcompare3ebdvs376533:merge-base376533,ahead26,behind0. Подготовленimmutablev2 сновымfreeze иновымиoutputlabels; sourceгейты/сверкаисторийнеослаблены.
- Уточнениепредыдущейсчётнойопечатки: уstandalonejob16шагов completedsuccess, не17. OverallGitHubстатуспо-прежнемуожидаетсяотдельно отфизическойприёмки. Далееv2readonly3flows/снимки.


### 2026-10-22,20:43 Баку — v2preflight: деньужеSTARTED; read-onlyприёмкаотновогоbaseline

- v2остановлендоMaestroиpermissionsнастаромусловииCOMPLETED. Backend3ebd стабильный(3последовательныхread), fixtureidentity подтверждён, actualdaySTARTED,103events вместо101. Происхождениедвухновыхevents этимreadне установлено; не объявляемихошибкойUI илидействиемпользователюбездоказательств. Неоткатываемисторию/незавершаемденьрадиожиданиятеста.
- Исправлена избыточнаяпредпосылка приватногоreadonlyharness: all-tabs/validation/compactflows неотмечаютрабочеевремя и не требуютcompleted; допускаемобычныйSTARTED/COMPLETED, сохраняяtenant/account/queue/conflict/source/build/immutablehistoryguards. v3берёт103актуальныхevents какbeforebaseline, требуетточнойнеизменностипосле. v1/v2FAIL и ихскриптысохранены. Этоизменениеподходящегопредусловиясценария, не ослаблениепроверкизаписей.


### 2026-10-22,20:46 Баку — все exact-head35540c2 гейтызелёные

- GitHubcheck-runs/PRchecks наконец completedPASS дляstandalone39813014403/job119944638319 (9m55s), ordinary39813020933(7m39s), CI39813020973, contract39813020966, scope. Ранеенаблюдавшийсяaggregatepending сохранёнкакфактфазыинцидента, текущеесостояниезаменяетегонаPASS. Приватныйhosted-gates JSON обновлён: standalonePASS, allExactHeadChecksPASS, releaseGateCI_PASS_PHYSICAL_ACCEPTANCE_PENDING. Новуюсборкунеперезапускали.
- v3readonlyна1033RUNNING, независимыйbaseline103events/requests/readstate/settings записан. Наэтотмомент итогMaestroещёнеполучен.


### 2026-10-22,20:53 Баку —1033 all-tabs/validation/compact physical PASS

- v3readonlycompletedPASS16:52:47UTC: all-tabs218.148s, empty-reasonvalidation67.323s, compactdisclosure/restart63.904s. Независимаясверка: все103canonicalevents неизменны, обеистории/заявки/существующееreadstate/другойаккаунт/profilelocale+hints/radios/network/packages сохранены; coldrestartбезочереди; originalCAMERA=true/FINE=false/COARSE=false восстановлены. Backend3ebd не менялсявнутрипрогона.
- Captured5nativebaseline screenshots; Day/Profile сохраняли прежнююscrollпозицию, поэтомуэто не всегдаfirstviewport. ПросмотреныDay(scrolled),Requests,Profile; отмечено, чтоhandoffнужновернутьDayнаверхкQR. LegacyunkeyedрусскиезаголовкиуведомленийвAZ сохраняютсякакфактданных(нетложногоперевода).
- Новыйpublicsanitizedevidence docs/evidence/attendance-rhythm-native-20261022.json. Appearancehelperзапущеноттого же355/1033/3ebd: dark5tabs,200%5tabs, сохранениеreasonчерновика, watchdogвозвратаоригинальнойтемы/шрифтаеслиMacпропадёт. ИтогRUNNING, неPASS; nativeLandscapeещёNOT RUN. Следующийшаг appearance/visualreview изакрытиеdoccheckpoint. Реальная24hнеидёт.


### 2026-10-22,21:24 Баку — уточнён результат appearance и сохранена точка продолжения

- Предыдущий статус appearance RUNNING заменён фактическим итогом: v1 FAIL16:54:12UTC/TimeoutExpired на первой shell-команде release_driver, до original capture, watchdog, черновика и смены темы/шрифта. Настройки этим запуском не менялись, screenshots пусты. Dark/200% нельзя считать проверенными; native landscape/TalkBack тоже NOT RUN.
- Просмотрены оставшиеся реальные Replies/Inbox снимки: теперь все пять baseline проверены визуально в light/font_scale1.0. Day/Profile имеют старую scroll-позицию; первый экран с QR этим снимком не подтверждается. Следующая успешная попытка должна вернуть День наверх и сделать отдельный снимок.
- Bounded get-state/reconnect не восстановили upstream Mac ADB. Listener35039/shared SSH имеет дочерние codex и bash: guarded recovery завершилась отказом ДО kill; общий SSH не прерывался. Remote terminal read не дал доступного Mac execution. Пользователю объяснены команды Mac: pkill -x adb || true; adb start-server. Сохраняем существующее окно подключения/USB; нового разрешения push/deploy не просим.
- На вопрос «что надо сделать?» дан короткий блок двух команд с кнопкой копирования и просьбой написать «готово». Ответа о перезапуске пока нет. Обновлены sanitized evidence и UX audit; CI/обе сборки по35540c2 уже PASS, installed1033 и три Maestro+независимая сверка PASS остаются действительны.
- Routing перепроверен codex-project-context: worktree mtm-attendance-standalone, branch codex/attendance-standalone, origin rashadoni/leaddrive-mtm; отдельного server production route у приложения нет. CRM не меняли. Точная остановка: связь перед appearance. Следующее действие: после Mac ADB restart bounded transport check, новая immutable appearance attempt на том же source, возврат настроек/Дня и фиксация результата. Реальная24h NOT_STARTED; прежняя v6 FAIL сохранена.

- PR196 обновлён: head35540c2/draft подтверждены API, пять PR checks повторно PASS. Описание теперь содержит установленный1033, три реальных Maestro и независимую сверку, честный appearance transport stop и отсутствие активной24h. Evidence/docs оформлены отдельным локальным checkpoint без повторного запуска тяжёлых сборок ради документации.


### 2026-10-22,21:28 Баку — Mac ADB восстановлен, продолжается appearance

- Пользователь написал «готово». Bounded get-state и harmless shell/getprop прошли; backend остаётся3ebd5786. Routing прежний: dedicated worktree mtm-attendance-standalone, codex/attendance-standalone, origin rashadoni/leaddrive-mtm, server route отсутствует. Native1033 установлен.
- Appearance v2 остановился до сохранения/изменения настроек: foreground UI отсутствовал (UI unavailable), а не Timeout ADB. В v2 добавлена явная проверка текущего собственного fixture, но перед ней отсутствовал запуск Activity после действий пользователя вне приложения. Результат v2FAIL сохраняем; теперь явно открываем только своё приложение и проверяем видимость/идентичность перед новым immutable запуском. Тему/шрифт/разрешения не меняли.


### 2026-10-22,21:37 Баку — подтверждены два native-дефекта1033, начато исправление

- Appearance v3 успел получить пять dark-снимков. Все просмотрены: содержимое тёмное, нижняя панель вкладок остаётся light; отдельно светлая системная навигационная область. Длинный runner завершился143 без финального JSON; причину завершения не установили, результат не объявлен PASS. Его исходные настройки восстановлены отдельной командой, собственный device watchdog снят после проверки PID/args. Interruption evidence сохранена.
- Короткий font reproduction v4 завершился штатно FAIL: причина заранее введена/сверена в форме, после font_scale2.0 формы/причины нет и выбран OwnWorkday. Before/after снимки и XML подтверждают потерю черновика/возврат вкладки. Cleanup PASS: исходная light/font1.0, история/заявки/permissions неизменны; День возвращён к QR. На200% подписи панели обрезаны.
- План узкого исправления: подписать саму кэшируемую OwnTabs на смену темы; дать большим подписям две строки/достаточную высоту; в attendance manifest обрабатывать fontScale без пересоздания Activity и обновлять native/JS метрики; синхронизировать фон/иконки системной навигации только в attendance flavor. Обычный MTM и серверные правила не меняем. Полный Android/native compile, Jest/TS — только GitHub, затем SHA-bound install и новый physical прогон.
- Новый cached-stack regression сначала остановился на hoisted mock (исправлен локальный require), затем воспроизвёл реальный white-tabbar FAIL с expected dark18251F/actual lightFCFDFB при сохранённом смонтированном экране. Source fix ещё не проверен. Android guidance о configuration recreation/обязанности обновлять ресурсы прочитан: https://developer.android.com/guide/topics/resources/runtime-changes ; используем также фактический RN0.84.1 source.

- Source fix внесён: OwnTabs напрямую подписана на тему и font metrics; доступные полные названия вкладок, две строки подписи и высота для крупного текста. Только attendance manifest добавляет fontScale. Shared MainActivity сразу возвращает старое поведение для обычного flavor; attendance обновляет фон/контраст системной панели, а DeviceInfo lifecycle listener — актуальные JS font metrics без пересоздания формы. Исходник RN0.84.1 подтверждает, что cache fontScale обычно обновляется на host resume; целиком lifecycle не возобновляем.
- После source fix targeted3suites/7tests PASS, включая ранее красный cached tab regression и сохранность смонтированного черновика при light→dark→light; lint0errors (первый проход5warnings, триshadow исправлены). Diffcheck PASS. Native Kotlin/полный TS/Jest/Android локально NOT RUN по host contract; далее exact-source hosted gates. Отдельный native strip следует официальным edge-to-edge правилам: https://developer.android.com/develop/ui/views/layout/edge-to-edge . Real24h не запущен.


### 2026-10-22,21:45 Баку — опубликован source2db4f5d, гейты в работе

- Checkpoint2db4f5d590611d03128deec8e837970dde1e68f8 опубликован в origin/codex/attendance-standalone. Включён предыдущий локальный docs checkpoint21663f6; PR196head/draft подтверждены, описание актуализировано и PR прикреплён к задаче. Никого не просили повторно разрешать уже разрешённую публикацию.
- GitHub CI39825122866, standalone39825116122(run34/code1034), ordinary39825122879 в работе; contract39825122850 PASS. Новый APK ещё не получен/не установлен. Новый source-bound readonly harness требует полного PASS всех гейтов, исключение старого aggregatepending убрано.
- Последние узкие проверки после mock-shadow исправления: cached tab test1PASS, общий предыдущий3suites/7testsPASS, финальный lint0errors/2render-callbackwarnings. Native/полный TS/Jest/Android local NOT RUN — host contract.
- Установленный1033 остаётся на телефоне с известными appearance-дефектами; original light/font1.0 и данные восстановлены. Точка продолжения: exact-source CI/Android, затем digest/install-r1034, короткий native font regression первым, затем all-tabs/appearance приёмка. Новая24h пока не идёт.


### 2026-10-22,21:47 Баку — уточнена изоляция native fix по applicationId

- При проверке фактического build.gradle выявлена ошибочная предпосылка в source2db: отдельный APK выбирается project property attendanceApp, а не productFlavor. BuildConfig.FLAVOR не является проверенным контрактом. Заменено на реальный BuildConfig.APPLICATION_ID == com.leaddrive.attendance, тот же канонический install identity, который уже проверяется при установке. Это correction по source inspection; native gate2db не объявляем PASS/FAIL без итога, промежуточные сборки отменяем как superseded и публикуем исправленный checkpoint. Новые APK ещё не устанавливались.
