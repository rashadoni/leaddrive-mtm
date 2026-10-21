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
