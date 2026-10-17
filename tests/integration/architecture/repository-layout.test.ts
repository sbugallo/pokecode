import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { checkRepositoryLayout } from "../../support/architecture/import-boundary-checker.js"

const stagingParent = "/tmp/opencode"

async function writeProjectFile(root: string, path: string, contents = "") {
  const destination = join(root, path)
  await mkdir(resolve(destination, ".."), { recursive: true })
  await writeFile(destination, contents)
}

async function withProject<Result>(
  configure: (root: string) => Result | Promise<Result>,
): Promise<Result> {
  await mkdir(stagingParent, { recursive: true })
  const root = await mkdtemp(join(stagingParent, "pokemon-repository-layout-"))
  try {
    await writeProjectFile(root, "src/index.ts")
    return await configure(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("repository test layout", () => {
  test("keeps the current repository within its source and test layout boundaries", () => {
    // GIVEN
    const projectRoot = resolve(import.meta.dir, "../../..")

    // WHEN
    const violations = checkRepositoryLayout(projectRoot)

    // THEN
    expect(violations).toEqual([])
  })

  test("accepts approved categories, exact unit mirrors, and purpose-grouped support without requiring full module coverage", async () => {
    // GIVEN
    const violations = withProject(async (root) => {
      await writeProjectFile(root, "src/domain/value.tsx")
      await writeProjectFile(root, "src/domain/without-a-unit-test.ts")
      await writeProjectFile(root, "scripts/lib/check.ts")
      await writeProjectFile(root, "tests/unit/src/domain/value.test.tsx")
      await writeProjectFile(root, "tests/unit/scripts/lib/check.test.ts")
      await writeProjectFile(root, "tests/integration/architecture/layout.test.ts")
      await writeProjectFile(root, "tests/integration/gameplay/usage.test.ts")
      await writeProjectFile(root, "tests/smoke/package/entrypoints.test.ts")
      await writeProjectFile(
        root,
        "tests/support/architecture/sample-projects/invalid-import.ts",
        "import '../src/private-module.js'\n",
      )
      await writeProjectFile(
        root,
        "tests/integration/architecture/_support/layout/sample-project.ts",
        "import '../../../src/private-module.js'\n",
      )

      // WHEN
      return checkRepositoryLayout(root)
    })

    // THEN
    expect(await violations).toEqual([])
  })

  test("rejects legacy and unapproved immediate test roots", async () => {
    // GIVEN
    const violations = await withProject(async (root) => {
      for (const directory of [
        "domain",
        "application",
        "adapters",
        "architecture",
        "package",
        "tooling",
        "content",
        "helpers",
        "fixtures",
        "e2e",
        "custom",
      ]) {
        await mkdir(join(root, "tests", directory), { recursive: true })
      }

      // WHEN
      return checkRepositoryLayout(root)
    })

    // THEN
    const messages = violations.map(({ message }) => message)
    for (const directory of [
      "domain",
      "application",
      "adapters",
      "architecture",
      "package",
      "tooling",
      "content",
      "helpers",
      "fixtures",
      "e2e",
      "custom",
    ]) {
      expect(
        messages.some((message) => message.includes(`tests/ root directory '${directory}'`)),
      ).toBe(true)
    }
  })

  test("rejects root-level tests and tests nested under shared or local support", async () => {
    // GIVEN
    const violations = await withProject(async (root) => {
      await writeProjectFile(root, "tests/root.test.ts")
      await writeProjectFile(root, "tests/integration/direct.test.ts")
      await writeProjectFile(root, "tests/smoke/direct.test.ts")
      await writeProjectFile(root, "tests/support/architecture/sample.test.ts")
      await writeProjectFile(root, "tests/integration/architecture/_support/layout/hidden.test.ts")

      // WHEN
      return checkRepositoryLayout(root)
    })

    // THEN
    const messages = violations.map(({ message }) => message)
    expect(
      messages.some((message) =>
        message.includes("tests/ may contain only approved category directories"),
      ),
    ).toBe(true)
    expect(
      messages.filter((message) =>
        message.includes("tests must be placed inside an approved behavior bucket"),
      ),
    ).toHaveLength(2)
    expect(
      messages.filter((message) =>
        message.includes("must not live in shared support or local _support directories"),
      ),
    ).toHaveLength(2)
  })

  test("requires each unit test to mirror an implementation path, basename, and extension", async () => {
    // GIVEN
    const violations = await withProject(async (root) => {
      await writeProjectFile(root, "src/domain/value.ts")
      await writeProjectFile(root, "src/domain/other.tsx")
      await writeProjectFile(root, "tests/unit/domain/value.test.ts")
      await writeProjectFile(root, "tests/unit/src/domain/other.test.ts")
      await writeProjectFile(root, "tests/unit/src/domain/missing.test.ts")

      // WHEN
      return checkRepositoryLayout(root)
    })

    // THEN
    const messages = violations.map(({ message }) => message)
    expect(messages.some((message) => message.includes("must mirror a source module"))).toBe(true)
    expect(messages.some((message) => message.includes("src/domain/other.ts'"))).toBe(true)
    expect(messages.some((message) => message.includes("src/domain/missing.ts'"))).toBe(true)
  })

  test("allows only approved integration buckets and rejects generic or mismatched support grouping", async () => {
    // GIVEN
    const violations = await withProject(async (root) => {
      await writeProjectFile(root, "tests/integration/adapters/sqlite/database.test.ts")
      await writeProjectFile(
        root,
        "tests/integration/architecture/_support/unowned/sample-project.ts",
      )
      await mkdir(join(root, "tests/support/helpers"), { recursive: true })

      // WHEN
      return checkRepositoryLayout(root)
    })

    // THEN
    const messages = violations.map(({ message }) => message)
    expect(
      messages.some((message) => message.includes("unapproved integration directory 'adapters'")),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("local support must be grouped in _support/<test-basename>"),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("shared support directory 'helpers' is too generic"),
      ),
    ).toBe(true)
  })

  test("preserves root-source and non-entrypoint import checks", async () => {
    // GIVEN
    const violations = await withProject(async (root) => {
      await writeProjectFile(root, "src/domain.ts")
      await writeProjectFile(root, "src/index.ts", "import './domain.js'\n")
      await writeProjectFile(root, "tests/support/game.ts", "import '../../src/domain.js'\n")

      // WHEN
      return checkRepositoryLayout(root)
    })

    // THEN
    const messages = violations.map(({ message }) => message)
    expect(
      messages.some((message) => message.includes("unexpected root source file 'domain.ts'")),
    ).toBe(true)
    expect(
      messages.some((message) => message.includes("targets a non-entrypoint root source path")),
    ).toBe(true)
    expect(
      violations.some(
        ({ file, message }) =>
          file.endsWith("tests/support/game.ts") &&
          message.includes("targets a non-entrypoint root source path"),
      ),
    ).toBe(true)
  })
})
