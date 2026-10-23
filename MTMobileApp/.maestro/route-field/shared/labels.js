var copies = {
  az: {
    today: "Bu gün", route: "Marşrut", clients: "Müştərilər", places: "Məkanlar",
    tasks: "Tapşırıqlar", more: "Daha çox", month: "Ay",
    overview: "İcmal", team: "Komanda", planning: "Planlama", approvals: "Təsdiqlər",
    missing: "Nömrəni və ya e-poçtu və şifrəni daxil edin", profileBack: "Geri"
  },
  ru: {
    today: "Сегодня", route: "Маршрут", clients: "Клиенты", places: "Места",
    tasks: "Задачи", more: "Ещё", month: "Месяц",
    overview: "Обзор", team: "Команда", planning: "Планирование", approvals: "Согласования",
    missing: "Введите номер или email и пароль", profileBack: "Назад"
  },
  en: {
    today: "Today", route: "Route", clients: "Clients", places: "Places",
    tasks: "Tasks", more: "More", month: "Month",
    overview: "Overview", team: "Team", planning: "Planning", approvals: "Approvals",
    missing: "Enter your number or email and password", profileBack: "Back"
  }
};
if (!copies[LOCALE]) throw new Error("RF_LOCALE_REFUSED");
function literal(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
output.copy = {};
Object.keys(copies[LOCALE]).forEach(function (key) {
  output.copy[key] = literal(copies[LOCALE][key]);
});
