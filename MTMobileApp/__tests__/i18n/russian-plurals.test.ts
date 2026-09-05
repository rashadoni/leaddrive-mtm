import i18next from "i18next"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

/**
 * Field UX audit M-09 / task B14: "3 точек" and "22 точек" came from a
 * single template with {{n}}. The count templates now use i18next v4 plural
 * forms driven by `count`.
 */
async function instance(lng: "ru" | "en" | "az") {
  const i18n = i18next.createInstance()
  await i18n.init({
    lng,
    fallbackLng: "en",
    resources: { az: { translation: az }, en: { translation: en }, ru: { translation: ru } },
    interpolation: { escapeValue: false },
  })
  return i18n
}

describe("Russian plural forms", () => {
  it("declines stops in the week calendar", async () => {
    const i18n = await instance("ru")
    expect(i18n.t("week.stopsTemplate", { count: 1 })).toBe("1 точка")
    expect(i18n.t("week.stopsTemplate", { count: 3 })).toBe("3 точки")
    expect(i18n.t("week.stopsTemplate", { count: 22 })).toBe("22 точки")
    expect(i18n.t("week.stopsTemplate", { count: 5 })).toBe("5 точек")
    expect(i18n.t("week.stopsTemplate", { count: 11 })).toBe("11 точек")
  })

  it("declines the remaining count templates", async () => {
    const i18n = await instance("ru")
    expect(i18n.t("route.stopsCount", { count: 1 })).toBe("1 остановка")
    expect(i18n.t("route.stopsCount", { count: 4 })).toBe("4 остановки")
    expect(i18n.t("syncCenter.offlinePending", { count: 1 })).toBe("Офлайн · ожидает 1")
    expect(i18n.t("syncCenter.offlinePending", { count: 7 })).toBe("Офлайн · ожидают 7")
    expect(i18n.t("syncCenter.conflictsShort", { count: 1 })).toBe("Требует внимания: 1")
    expect(i18n.t("organizations.contactsTemplate", { count: 21 })).toBe("Контактов: 21")
    expect(i18n.t("organizations.hiddenSelectedTemplate", { count: 1 }))
      .toBe("1 выбранная запись скрыта текущим фильтром. Уберите её перед назначением.")
  })
})

describe("English and Azerbaijani count templates", () => {
  it("keeps singular and plural in English", async () => {
    const i18n = await instance("en")
    expect(i18n.t("week.stopsTemplate", { count: 1 })).toBe("1 stop")
    expect(i18n.t("week.stopsTemplate", { count: 3 })).toBe("3 stops")
    expect(i18n.t("syncCenter.pendingShort", { count: 1 })).toBe("1 waiting")
  })

  it("renders Azerbaijani counts", async () => {
    const i18n = await instance("az")
    expect(i18n.t("week.stopsTemplate", { count: 1 })).toBe("1 nöqtə")
    expect(i18n.t("week.stopsTemplate", { count: 22 })).toBe("22 nöqtə")
  })
})
