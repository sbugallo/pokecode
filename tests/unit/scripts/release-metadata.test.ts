import { describe, expect, test } from "bun:test"
import {
  calculateNextDevelopmentVersion,
  calculateReleaseVersion,
  insertReleaseIntoChangelog,
} from "../../../scripts/release-metadata.js"

describe("release metadata rules", () => {
  test("sorts stable tags semantically and ignores prerelease or malformed tags", () => {
    // GIVEN
    const tags = ["v2.9.9", "v10.0.0-rc.1", "v3.0.0", "v2.10.0", "release-4.0.0"]

    // WHEN
    const release = calculateReleaseVersion(tags, "minor")

    // THEN
    expect(release).toBe("3.1.0")
  })

  test("starts release numbering at zero when no stable tags exist", () => {
    // GIVEN
    const tags = ["v1.0.0-rc.1", "invalid"]

    // WHEN
    const release = calculateReleaseVersion(tags, "minor")

    // THEN
    expect(release).toBe("0.1.0")
  })

  test.each([
    { bump: "patch" as const, expected: "1.2.4" },
    { bump: "minor" as const, expected: "1.3.0" },
    { bump: "major" as const, expected: "2.0.0" },
  ])("applies the $bump stable release bump", ({ bump, expected }) => {
    // GIVEN
    const tags = ["v1.2.3"]

    // WHEN
    const release = calculateReleaseVersion(tags, bump)

    // THEN
    expect(release).toBe(expected)
  })

  test.each([
    { release: "0.0.0", expected: "0.1.0-dev.0" },
    { release: "1.2.3", expected: "1.3.0-dev.0" },
    { release: "1.9.9", expected: "1.10.0-dev.0" },
  ])("calculates the next-minor development version after $release", ({ release, expected }) => {
    // GIVEN
    const stableRelease = release

    // WHEN
    const developmentVersion = calculateNextDevelopmentVersion(stableRelease)

    // THEN
    expect(developmentVersion).toBe(expected)
  })

  test.each(["1.2.3-dev.0", "01.2.3"])(
    "rejects a non-stable or noncanonical release version: %s",
    (release) => {
      // GIVEN
      const stableRelease = release

      // WHEN
      const calculate = () => calculateNextDevelopmentVersion(stableRelease)

      // THEN
      expect(calculate).toThrow("must be stable SemVer")
    },
  )

  test("inserts a dated stable release below the Unreleased heading", () => {
    // GIVEN
    const changelog = "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Feature.\n"

    // WHEN
    const updated = insertReleaseIntoChangelog(changelog, "1.2.3", "2026-10-14")

    // THEN
    expect(updated).toBe(
      "# Changelog\n\n## [Unreleased]\n\n## [1.2.3] - 2026-10-14\n\n### Added\n\n- Feature.\n",
    )
  })

  test.each([
    {
      name: "missing",
      changelog: "# Changelog\n",
    },
    {
      name: "duplicate",
      changelog: "## [Unreleased]\n\n## [1.2.0]\n\n## [Unreleased]\n",
    },
  ])("rejects a changelog with $name Unreleased section", ({ changelog }) => {
    // GIVEN
    const invalidChangelog = changelog

    // WHEN
    const insert = () => insertReleaseIntoChangelog(invalidChangelog, "1.2.3", "2026-10-14")

    // THEN
    expect(insert).toThrow("exactly one ## [Unreleased] section")
  })
})
