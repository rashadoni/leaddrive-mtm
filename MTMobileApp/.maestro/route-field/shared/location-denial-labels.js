// Published in mobile-resources.ts and VisitScreen's inline copy, not locale JSON.
var denialCopy = {
  az: { title: "Tətbiq məkanınızdan istifadə edir", decline: "İndi yox", issue: "Mövqeyinizi müəyyən etmək mümkün olmadı", body: "Tətbiqə məkan icazəsi verin və yenidən cəhd edin." },
  ru: { title: "Приложение использует ваше местоположение", decline: "Не сейчас", issue: "Не удалось определить ваше местоположение", body: "Разрешите приложению доступ к геолокации и попробуйте снова." },
  en: { title: "The app uses your location", decline: "Not now", issue: "We could not find your position", body: "Allow location access for the app and try again." }
}[LOCALE];
if (!denialCopy) throw new Error("RF_LOCALE_REFUSED");
output.denial = {};
Object.keys(denialCopy).forEach(function (key) { output.denial[key] = qaLiteral(denialCopy[key]); });
