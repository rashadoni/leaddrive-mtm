function managerLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
output.managerName = managerLiteral(RF_MANAGER_NAME);
output.managerEmail = managerLiteral(RF_MANAGER_EMAIL);
output.managerAgentName = managerLiteral(RF_AGENT_NAME);
output.managerLogout = managerLiteral(RF_LOGOUT);
output.managerLogoutConfirm = managerLiteral(RF_LOGOUT_CONFIRM);
output.managerLogoutMessage = managerLiteral(RF_LOGOUT_MESSAGE);
output.managerTaskRequired = {
  az: "Nə etmək lazım olduğunu yazın", ru: "Напишите, что сделать", en: "Write what to do"
}[LOCALE];
if (!output.managerTaskRequired) throw new Error("RF_LOCALE_REFUSED");
