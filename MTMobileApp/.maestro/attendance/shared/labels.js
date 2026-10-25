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

var loginCopy = {
  "az": {
    "missingCompany": "Şirkət adını daxil edin",
    "unknownCompany": "Şirkət tapılmadı. Yazılışı yoxlayın və ya administratordan aldığınız tam ünvanı daxil edin.",
    "missingCredentials": "Nömrəni və ya e-poçtu və şifrəni daxil edin",
    "clear": "Təmizlə"
  },
  "ru": {
    "missingCompany": "Введите название компании",
    "unknownCompany": "Компания не найдена. Проверьте написание или введите полный адрес, полученный у администратора.",
    "missingCredentials": "Введите номер или email и пароль",
    "clear": "Очистить"
  },
  "en": {
    "missingCompany": "Please enter your company name",
    "unknownCompany": "Company not found. Check the spelling or enter the full address from your administrator.",
    "missingCredentials": "Enter your number or email and password",
    "clear": "Clear"
  }
};
output.login = loginCopy[LOCALE];

// Maestro text selectors are regular expressions; copy must match literally.
function escapeSelector(value) {
  var special = ".*+?^${}()|[]\\";
  return value.split("").map(function(ch) { return special.indexOf(ch) >= 0 ? "\\" + ch : ch; }).join("");
}
Object.keys(output.copy).forEach(function(key) { output.copy[key] = escapeSelector(output.copy[key]); });
Object.keys(output.login).forEach(function(key) { output.login[key] = escapeSelector(output.login[key]); });

var deviceCopy = {
  "az": {
    "request": "İcazə istə",
    "PENDING": "Qərar gözlənilir",
    "APPROVED": "Quraşdırma təsdiqlənib",
    "REVOKED": "İcazə geri götürülüb",
    "scan": "QR kodu skan et",
    "noLocationPolicy": "Təşkilat təsdiqlənmiş mətnlə məkan toplanmasını hələ aktivləşdirməyib."
  },
  "ru": {
    "request": "Запросить разрешение",
    "PENDING": "Ждём решения",
    "APPROVED": "Установка подтверждена",
    "REVOKED": "Разрешение отозвано",
    "scan": "Сканировать QR",
    "noLocationPolicy": "Организация пока не включила сбор места с утверждённым текстом."
  },
  "en": {
    "request": "Request approval",
    "PENDING": "Awaiting a decision",
    "APPROVED": "Installation approved",
    "REVOKED": "Approval withdrawn",
    "scan": "Scan QR code",
    "noLocationPolicy": "The organisation has not enabled collection with an approved text."
  }
};
output.device = deviceCopy[LOCALE];
Object.keys(output.device).forEach(function(key) { output.device[key] = escapeSelector(output.device[key]); });
