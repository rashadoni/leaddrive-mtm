# Учёт рабочего дня MTM — журнал мобильной части

## 2026-10-13 — начало

- Владелец поручил выполнить все этапы `rashadoni/leaddrive-v2/docs/mtm-attendance/README.md` автономно и последовательно. Основной append-only журнал — §10 этого документа. Повторное разрешение на показанные макеты и обычный проверенный выпуск не требуется.
- Отдельный Contabo worktree: `/mnt/HC_Volume_106454338/codex-alt-data/worktrees/leaddrive-mobile-attendance`, branch `codex/mtm-attendance-requests`, исходный актуальный main `2acc3b0cdce58fe4298aa1218b84da7b262e73f2`. Canonical checkout сохранён. Его старый origin не используется; в этой копии установлен worktree-local origin `https://github.com/rashadoni/leaddrive-mtm.git`.
- Прочитаны актуальные CLAUDE.md и docs/DELIVERY-ARCHITECTURE.md. Доставка через PR, scope/tests SUCCESS, подписанный APK только из main. Тесты, tsc и Android build — только CI; физический телефон недоступен, такая проверка NOT RUN.
- Обязательные ограничения: функция скрыта без явного разрешения сервера, перерыв без координат, никакой биометрии, день закрывает сотрудник, заявки с устойчивым UUID и офлайн-очередью. Старая сборка и выключенный режим сохраняют контракт.
- Состояние: подготовлена чистая копия, код приложения не менялся. Следом согласованный серверный контракт заявок и экран по макетам2.0.

## 2026-10-13 — уточнение Git routing

Предыдущая запись о worktree-local origin уточнена: Git выбирал первую общую URL, поэтому override удалён. Canonical origin оставлен без изменения. Для этой ветки создан отдельный remote `attendance=https://github.com/rashadoni/leaddrive-mtm.git`; fetch/push только через него, GitHub команды с явным `--repo rashadoni/leaddrive-mtm`. Текущий main взят именно из этого репозитория.
