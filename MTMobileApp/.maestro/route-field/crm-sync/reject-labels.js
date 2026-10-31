// The approvals card's «Reject» and the reason sheet (NotesModal). The sheet's
// confirm reads like the cards' «Approve» in az, hence the title check first.
var rejectCopy = {
  az: { reject: "Rədd et", title: "Rədd səbəbi", placeholder: "Qeyd daxil edin…", cancel: "Ləğv et", submit: "Təsdiq et" },
  ru: { reject: "Отклонить", title: "Причина отклонения", placeholder: "Введите заметки…", cancel: "Отмена", submit: "Подтвердить" },
  en: { reject: "Reject", title: "Rejection reason", placeholder: "Enter notes…", cancel: "Cancel", submit: "Confirm" },
};
if (!rejectCopy[LOCALE]) throw new Error("RF_LOCALE_REFUSED");
output.reject = rejectCopy[LOCALE];
