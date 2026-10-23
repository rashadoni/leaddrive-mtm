function qaLiteral(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
output.qa = {};
var qaValues = {
 noCoordinates: RF_QA_NO_COORDINATES, checkIn: RF_QA_CHECKIN, customerHere: RF_QA_CUSTOMER_HERE,
 photoCapture: RF_QA_PHOTO_CAPTURE, photoUse: RF_QA_PHOTO_USE, photoAllow: RF_QA_PHOTO_ALLOW,
 photoPermissionBody: RF_QA_PHOTO_PERMISSION_BODY, notesPlaceholder: RF_QA_NOTES_PLACEHOLDER,
 notesSubmit: RF_QA_NOTES_SUBMIT
};
Object.keys(qaValues).forEach(function (key) { output.qa[key] = qaLiteral(qaValues[key]); });
output.qa.visit = {
  az: { results: "Axtarış nəticələri", search: "Məsələn, Mərkəzi Klinika", start: "Plansız ziyarətə başla", active: "Ziyarət indi davam edir", addPhoto: "Foto əlavə et", finish: "Ziyarəti bitir", zeroPhotos: "Foto: 0", onePhoto: "Foto: 1" },
  ru: { results: "Результаты поиска", search: "Например, Центральная клиника", start: "Начать внеплановый визит", active: "Визит идёт сейчас", addPhoto: "Добавить фото", finish: "Завершить визит", zeroPhotos: "Фото: 0", onePhoto: "Фото: 1" },
  en: { results: "Search results", search: "For example, Central Clinic", start: "Start unplanned visit", active: "Visit in progress", addPhoto: "Add photo", finish: "Finish visit", zeroPhotos: "Photos: 0", onePhoto: "Photos: 1" }
}[LOCALE];
if (!output.qa.visit) throw new Error("RF_LOCALE_REFUSED");
var locationCopy = {
  az: { title: "Müştəri əslində haradadır?", comment: "Şərh — istəyə görə (məsələn: giriş həyətdəndir)", sent: "Sorğu rəhbərə göndərildi" },
  ru: { title: "Где клиент на самом деле?", comment: "Комментарий — по желанию (например: вход со двора)", sent: "Запрос отправлен руководителю" },
  en: { title: "Where is the customer really?", comment: "Comment — optional (for example: entrance from the yard)", sent: "The request went to your manager" }
}[LOCALE];
output.qa.location = {};
Object.keys(locationCopy).forEach(function (key) {
  output.qa.location[key] = qaLiteral(locationCopy[key]);
});
