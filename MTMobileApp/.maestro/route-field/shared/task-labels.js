var taskCopy = {
  az: { start: "Tapşırığı başla", complete: "Tapşırığı tamamla", submit: "Yadda saxla və tamamla",
    placeholder: "Məsələn: sənədlər təqdim edildi, razılaşma təsdiqləndi", back: "Geri" },
  ru: { start: "Начать задачу", complete: "Завершить задачу", submit: "Сохранить и завершить",
    placeholder: "Например: документы переданы, договорённость подтверждена", back: "Назад" },
  en: { start: "Start task", complete: "Complete task", submit: "Save and complete",
    placeholder: "For example: documents delivered, agreement confirmed", back: "Back" }
};
if (!taskCopy[LOCALE]) throw new Error("RF_LOCALE_REFUSED");
output.task = {};
Object.keys(taskCopy[LOCALE]).forEach(function (key) {
  output.task[key] = taskCopy[LOCALE][key].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
});
