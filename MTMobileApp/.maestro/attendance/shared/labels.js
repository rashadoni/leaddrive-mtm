var labels = {
  "az": {
    "notStarted": "Gün hələ başlamayıb",
    "running": "İş günü davam edir",
    "paused": "Fasilə",
    "completed": "Gün tamamlanıb",
    "finishTitle": "İş günü tamamlansın?",
    "keepOpen": "Açıq saxla",
    "finish": "Günü bitir",
    "invalid": "Tarixləri, vaxtı və səbəbi (3–1000 simvol) yoxlayın. Saatlıq müraciətlər bir gün daxilindədir; vaxt düzəlişi növbəti gün bitə bilər."
  },
  "ru": {
    "notStarted": "День ещё не начат",
    "running": "День идёт",
    "paused": "Перерыв",
    "completed": "День завершён",
    "finishTitle": "Завершить рабочий день?",
    "keepOpen": "Оставить открытым",
    "finish": "Завершить день",
    "invalid": "Проверьте даты, время и причину (от 3 до 1000 символов). Почасовые заявки — в пределах дня; исправление времени может завершиться на следующий день."
  },
  "en": {
    "notStarted": "Day not started",
    "running": "Day in progress",
    "paused": "On a break",
    "completed": "Day completed",
    "finishTitle": "Finish the working day?",
    "keepOpen": "Keep open",
    "finish": "Finish day",
    "invalid": "Check dates, times and the reason (3–1000 characters). Hourly requests stay within one day; a time correction may end the following day."
  }
};
if (!labels[LOCALE]) throw new Error("LOCALE must be az, ru or en");
output.copy = labels[LOCALE];
