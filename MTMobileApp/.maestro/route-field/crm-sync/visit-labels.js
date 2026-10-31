// The unplanned-visit screen (VisitScreen) and the visit's closing note
// (NotesModal), as qa-labels.js has them, for a solo visit to a test client.
var visitCopy = {
  az: { visits: "Plansız ziyarətlər", search: "Məsələn, Mərkəzi Klinika", results: "Axtarış nəticələri", start: "Plansız ziyarətə başla", checkIn: "Giriş", active: "Ziyarət indi davam edir", finish: "Ziyarəti bitir", note: "Qeyd daxil edin…", submit: "Təsdiq et" },
  ru: { visits: "Внеплановые визиты", search: "Например, Центральная клиника", results: "Результаты поиска", start: "Начать внеплановый визит", checkIn: "Зайти", active: "Визит идёт сейчас", finish: "Завершить визит", note: "Введите заметки…", submit: "Подтвердить" },
  en: { visits: "Unplanned visits", search: "For example, Central Clinic", results: "Search results", start: "Start unplanned visit", checkIn: "Check In", active: "Visit in progress", finish: "Finish visit", note: "Enter notes…", submit: "Confirm" },
};
if (!visitCopy[LOCALE]) throw new Error("RF_LOCALE_REFUSED");
output.visit = visitCopy[LOCALE];
