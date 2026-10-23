function fixtureLiteral(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
output.fixture = {};
var fixtureValues = {
  name: RF_FIXTURE_NAME, email: RF_FIXTURE_EMAIL, company: RF_FIXTURE_COMPANY_NAME,
  priorName: RF_PRIOR_MANAGER_NAME, priorEmail: RF_PRIOR_MANAGER_EMAIL,
  switchCompany: RF_SWITCH_COMPANY, switchConfirm: RF_SWITCH_CONFIRM,
  switchMessage: RF_SWITCH_MESSAGE, noCoordinates: RF_NO_COORDINATES, checkIn: RF_VISIT_CHECKIN,
  customerHere: RF_CUSTOMER_HERE
};
Object.keys(fixtureValues).forEach(function (key) {
  output.fixture[key] = fixtureLiteral(fixtureValues[key]);
});
output.fixture.visit = {
  az: { search: "Məsələn, Mərkəzi Klinika", start: "Plansız ziyarətə başla" },
  ru: { search: "Например, Центральная клиника", start: "Начать внеплановый визит" },
  en: { search: "For example, Central Clinic", start: "Start unplanned visit" }
}[LOCALE];
if (!output.fixture.visit) throw new Error("RF_LOCALE_REFUSED");
var locationCopy = {
  az: { title: "Müştəri əslində haradadır?", comment: "Şərh — istəyə görə (məsələn: giriş həyətdəndir)", sent: "Sorğu rəhbərə göndərildi" },
  ru: { title: "Где клиент на самом деле?", comment: "Комментарий — по желанию (например: вход со двора)", sent: "Запрос отправлен руководителю" },
  en: { title: "Where is the customer really?", comment: "Comment — optional (for example: entrance from the yard)", sent: "The request went to your manager" }
}[LOCALE];
output.fixture.location = {};
Object.keys(locationCopy).forEach(function (key) {
  output.fixture.location[key] = fixtureLiteral(locationCopy[key]);
});
