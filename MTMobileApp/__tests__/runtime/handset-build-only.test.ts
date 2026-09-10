import fs from "fs"
import path from "path"

/**
 * Field UX audit 2026-09-05, task B22.
 *
 * The x86_64 branch exists in this repository (`claude/appetize-x86_64`) and
 * the APK workflow runs on every `claude/**` push, publishing a prerelease
 * tagged exactly like a real one. An emulator APK carries x86_64 and no field
 * handset can install it, so such a release is a trap sitting in the same list
 * an agent downloads from.
 *
 * The guard asks the built APK which processors it holds rather than trusting
 * a branch name, because the branch name is the thing that will be forgotten.
 */
const workflow = fs.readFileSync(
  path.resolve(__dirname, "../../../.github/workflows/build-apk.yml"),
  "utf8",
)
const gradleProperties = fs.readFileSync(
  path.resolve(__dirname, "../../android/gradle.properties"),
  "utf8",
)

describe("B22: only a handset build becomes a release", () => {
  it("builds handset architectures by default", () => {
    expect(gradleProperties).toContain("reactNativeArchitectures=armeabi-v7a,arm64-v8a")
    expect(gradleProperties).not.toContain("reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86")
  })

  it("reads the ABIs out of the APK instead of trusting the branch", () => {
    expect(workflow).toContain("unzip -Z1 \"$APK_FILE\" 'lib/*'")
    expect(workflow).toContain("Native ABIs")
  })

  it("refuses an emulator ABI that nobody asked for", () => {
    expect(workflow).toContain('if [ "${EMULATOR_BUILD:-false}" != "true" ]; then')
    expect(workflow).toContain("APK carries an emulator ABI")
  })

  it("refuses a handset build that no handset can run", () => {
    // The other direction: dropping arm64-v8a would produce an APK that
    // installs on nothing current and still looks like a release.
    expect(workflow).toContain("APK has no arm64-v8a code")
  })

  it("never publishes a release for an emulator build", () => {
    const publish = workflow.slice(workflow.indexOf("- name: Publish APK to GitHub prerelease"))
    expect(publish.split("\n")[1]).toContain("steps.verify.outputs.emulator != 'true'")
  })

  it("makes an emulator build something you ask for on purpose", () => {
    expect(workflow).toContain("emulator_build:")
    expect(workflow).toContain("EMULATOR_BUILD: ${{ inputs.emulator_build }}")
  })
})
