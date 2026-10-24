// Only these two marker-owned fixture accounts have the mobile EMPLOYEE role.
// The external fresh-day guard also checks tenant, role, dates and HR history.
var account = typeof FIXTURE_ACCOUNT === "undefined" ? "office" : FIXTURE_ACCOUNT;
if (account === "office") {
  output.offlineFixtureName = "Fictional office employee";
} else if (account === "admin") {
  output.offlineFixtureName = "Fictional phone administrator";
} else {
  throw new Error("Unsupported offline fixture account");
}
