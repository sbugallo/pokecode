import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const metadataScript = resolve(import.meta.dir, "../../../scripts/release-metadata.ts")
const stagingParent = "/tmp/opencode"
const changelogFixture = "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A fixture change.\n"

async function createFixture(version: string) {
  await mkdir(stagingParent, { recursive: true })
  const directory = await mkdtemp(join(stagingParent, "pokemon-release-metadata-"))
  const packageJsonPath = join(directory, "package.json")
  const changelogPath = join(directory, "CHANGELOG.md")
  const outputPath = join(directory, "github-output.txt")

  try {
    await writeFile(packageJsonPath, `${JSON.stringify({ name: "fixture", version }, null, 2)}\n`)
    await writeFile(changelogPath, changelogFixture)
    return { directory, packageJsonPath, changelogPath, outputPath }
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

function runMetadataCli(
  args: readonly string[],
  options: { readonly tags?: string; readonly outputPath?: string } = {},
) {
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "GITHUB_OUTPUT")),
    ...(options.outputPath === undefined ? {} : { GITHUB_OUTPUT: options.outputPath }),
  }
  return Bun.spawnSync([process.execPath, metadataScript, ...args], {
    stdin: new Blob([options.tags ?? ""]),
    stdout: "pipe",
    stderr: "pipe",
    env,
  })
}

function releaseArguments(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return [
    "--package-json",
    fixture.packageJsonPath,
    "--changelog",
    fixture.changelogPath,
    "--bump",
    "patch",
    "--date",
    "2026-10-16",
  ]
}

describe("release metadata CLI", () => {
  test("writes approved release metadata and then the calculated next development version", async () => {
    // GIVEN
    const fixture = await createFixture("1.3.0-dev.0")
    try {
      const originalChangelog = await readFile(fixture.changelogPath, "utf8")

      // WHEN
      const release = runMetadataCli(releaseArguments(fixture), {
        tags: "v1.2.3\n",
        outputPath: fixture.outputPath,
      })
      const packageAtRelease = JSON.parse(await readFile(fixture.packageJsonPath, "utf8"))
      const changelogAtRelease = await readFile(fixture.changelogPath, "utf8")
      const githubOutput = await readFile(fixture.outputPath, "utf8")
      const nextVersion = runMetadataCli([
        "set-package-version",
        fixture.packageJsonPath,
        "1.3.0-dev.0",
      ])
      const packageAtDevelopment = JSON.parse(await readFile(fixture.packageJsonPath, "utf8"))

      // THEN
      expect(release.exitCode).toBe(0)
      expect(JSON.parse(release.stdout.toString())).toEqual({
        nextDevVersion: "1.3.0-dev.0",
        releaseVersion: "1.2.4",
      })
      expect(githubOutput).toBe("release_version=1.2.4\nnext_dev_version=1.3.0-dev.0\n")
      expect(packageAtRelease.version).toBe("1.2.4")
      expect(changelogAtRelease).toBe(
        originalChangelog.replace("## [Unreleased]", "## [Unreleased]\n\n## [1.2.4] - 2026-10-16"),
      )
      expect(nextVersion.exitCode).toBe(0)
      expect(packageAtDevelopment.version).toBe("1.3.0-dev.0")
      expect(await readFile(fixture.changelogPath, "utf8")).toBe(changelogAtRelease)
    } finally {
      await rm(fixture.directory, { recursive: true, force: true })
    }
  })

  test("rejects an unapproved release source without changing package, changelog or outputs", async () => {
    // GIVEN
    const fixture = await createFixture("1.2.3")
    try {
      const originalPackage = await readFile(fixture.packageJsonPath, "utf8")
      const originalChangelog = await readFile(fixture.changelogPath, "utf8")

      // WHEN
      const result = runMetadataCli(releaseArguments(fixture), {
        tags: "v1.2.3\n",
        outputPath: fixture.outputPath,
      })

      // THEN
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain("1.3.0-dev.0")
      expect(await readFile(fixture.packageJsonPath, "utf8")).toBe(originalPackage)
      expect(await readFile(fixture.changelogPath, "utf8")).toBe(originalChangelog)
      expect(await Bun.file(fixture.outputPath).exists()).toBe(false)
    } finally {
      await rm(fixture.directory, { recursive: true, force: true })
    }
  })

  test("does not write an unapproved package version and accepts the exact next-minor version", async () => {
    // GIVEN
    const fixture = await createFixture("1.2.4")
    try {
      const originalPackage = await readFile(fixture.packageJsonPath, "utf8")
      const originalChangelog = await readFile(fixture.changelogPath, "utf8")

      // WHEN
      const rejected = runMetadataCli([
        "set-package-version",
        fixture.packageJsonPath,
        "1.2.5-dev.0",
      ])
      const packageAfterRejection = await readFile(fixture.packageJsonPath, "utf8")
      const accepted = runMetadataCli([
        "set-package-version",
        fixture.packageJsonPath,
        "1.3.0-dev.0",
      ])
      const packageAfterAcceptance = JSON.parse(await readFile(fixture.packageJsonPath, "utf8"))

      // THEN
      expect(rejected.exitCode).not.toBe(0)
      expect(rejected.stderr.toString()).toContain("next-minor development version")
      expect(packageAfterRejection).toBe(originalPackage)
      expect(accepted.exitCode).toBe(0)
      expect(packageAfterAcceptance.version).toBe("1.3.0-dev.0")
      expect(await readFile(fixture.changelogPath, "utf8")).toBe(originalChangelog)
    } finally {
      await rm(fixture.directory, { recursive: true, force: true })
    }
  })
})
