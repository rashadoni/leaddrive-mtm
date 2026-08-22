import fs from "fs"
import path from "path"

describe("mobile visit guidance", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/visit/VisitScreen.tsx"),
    "utf8",
  )

  it("keeps a dismissible three-step guide beside the visit actions", () => {
    expect(source).toContain('id="visits.flow.v2"')
    expect(source).toContain("Planlıdırsa «Marşrut»u açıb nöqtəni seçin")
    expect(source).toContain("Plansızdırsa müştərini aşağıda tapın")
    expect(source).toContain("lazım olan fotoları əlavə edib «Bitir»")
  })
})
