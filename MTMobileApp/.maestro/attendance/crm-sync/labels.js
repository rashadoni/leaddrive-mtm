// Words of LeadDrive Time screens checked by text (src/i18n/locales/*.json).
var copy = {
  az: { running: "İş günü davam edir", paused: "Fasilə", completed: "Gün tamamlanıb", notStarted: "Gün hələ başlamayıb",
        finishTitle: "İş günü tamamlansın?", finish: "Günü bitir", reason: "Səbəb",
        PENDING: "Baxılır", APPROVED: "Təsdiqlənib", REJECTED: "Rədd edilib", CANCELLED: "Ləğv edilib" },
  ru: { running: "День идёт", paused: "Перерыв", completed: "День завершён", notStarted: "День ещё не начат",
        finishTitle: "Завершить рабочий день?", finish: "Завершить день", reason: "Причина",
        PENDING: "На рассмотрении", APPROVED: "Одобрена", REJECTED: "Отклонена", CANCELLED: "Отменена" },
  en: { running: "Day in progress", paused: "On a break", completed: "Day completed", notStarted: "Day not started",
        finishTitle: "Finish the working day?", finish: "Finish day", reason: "Reason",
        PENDING: "Under review", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" },
};
if (!copy[LOCALE]) throw new Error("TIME_LOCALE_REFUSED");
output.time = copy[LOCALE];
