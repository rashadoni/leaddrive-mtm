// Copy of RouteContactsList (addDoctor) and DoctorCreateRequestScreen, which
// carry no testIDs: the flow finds the button and each field by its words.
var doctorCopy = {
  az: { add: "Həkim əlavə et", title: "Yeni həkim", name: "Ad və soyad \\*", clinic: "Klinika \\*", notes: "Qeydlər", submit: "Menecerə göndər", sent: "Sorğu göndərildi" },
  ru: { add: "Добавить врача", title: "Новый врач", name: "Имя и фамилия \\*", clinic: "Клиника \\*", notes: "Заметки", submit: "Отправить менеджеру", sent: "Заявка отправлена" },
  en: { add: "Add doctor", title: "New doctor", name: "Full name \\*", clinic: "Clinic \\*", notes: "Notes", submit: "Send to manager", sent: "Request sent" },
};
if (!doctorCopy[LOCALE]) throw new Error("RF_LOCALE_REFUSED");
output.doctor = doctorCopy[LOCALE];
