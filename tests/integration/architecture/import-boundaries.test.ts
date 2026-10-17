import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import {
  checkArchitecture,
  checkImportBoundaries,
} from "../../support/architecture/import-boundary-checker.js"

describe("source import boundaries", () => {
  test("domain and application modules obey dependency direction", () => {
    // GIVEN
    const sourceRoot = resolve(import.meta.dir, "../../../src")

    // WHEN
    const violations = checkImportBoundaries(sourceRoot)

    // THEN
    expect(violations).toEqual([])
  })

  test("checks type imports, re-exports, JavaScript specifiers, and nonliteral imports", () => {
    // GIVEN
    const fixtureRoot = resolve(
      import.meta.dir,
      "./_support/import-boundaries/fixtures/import-boundaries/src",
    )

    // WHEN
    const violations = checkImportBoundaries(fixtureRoot)
    const messages = violations.map((violation) => violation.message)

    // THEN
    expect(
      messages.some((message) => message.includes("domain import '../application/valid.js'")),
    ).toBe(true)
    expect(
      messages.some((message) => message.includes("application import '../adapters/store.js'")),
    ).toBe(true)
    expect(messages.some((message) => message.includes("../game-repository.js"))).toBe(true)
    expect(messages.some((message) => message.includes("../content-catalog.js"))).toBe(true)
    expect(messages.some((message) => message.includes("nonliteral import type"))).toBe(true)
    expect(
      messages.some((message) => message.includes("nonliteral dynamic import is not allowed")),
    ).toBe(true)
    expect(
      violations.some(
        ({ file, message }) =>
          file.endsWith("forbidden-import-equals.ts") &&
          message.includes("runtime module 'node:fs'"),
      ),
    ).toBe(true)
    expect(messages.some((message) => message.includes("runtime module 'node:fs'"))).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("nonliteral dynamic import is not allowed (including require())"),
      ),
    ).toBe(true)
    expect(messages.some((message) => message.includes("'@opencode/plugin'"))).toBe(true)
    expect(messages.some((message) => message.includes("'@opentui/solid'"))).toBe(true)
    expect(messages.some((message) => message.includes("runtime module 'fs'"))).toBe(true)
    expect(messages.some((message) => message.includes("runtime module 'net'"))).toBe(true)
    expect(messages.some((message) => message.includes("runtime module 'node:net'"))).toBe(true)
    expect(messages.some((message) => message.includes("runtime module 'node:fs/promises'"))).toBe(
      true,
    )
  })

  test("allows only domain/application source imports and the explicitly approved zod package", () => {
    // GIVEN
    const allowedRoot = resolve(
      import.meta.dir,
      "./_support/import-boundaries/fixtures/import-boundaries/allowed/src",
    )

    // WHEN
    const violations = checkImportBoundaries(allowedRoot)

    // THEN
    expect(violations).toEqual([])
  })

  test("rejects cycles, globals, public-entrypoint imports, and runtime graph crossings", () => {
    // GIVEN
    const fixtureRoot = resolve(
      import.meta.dir,
      "./_support/import-boundaries/fixtures/architecture/src",
    )

    // WHEN
    const violations = checkArchitecture(fixtureRoot)
    const messages = violations.map((violation) => violation.message)

    // THEN
    expect(messages.some((message) => message.includes("dependency cycle"))).toBe(true)
    expect(
      messages.some(
        (message) =>
          message.includes("dependency cycle") &&
          message.includes("adapters/opencode/tui/feature.ts") &&
          message.includes("legacy-compat.ts"),
      ),
    ).toBe(true)
    for (const entrypoint of ["index.ts", "rpc.ts", "tui.tsx", "cli.ts"]) {
      expect(
        messages.some(
          (message) =>
            message.includes("implementation imports through formal public entrypoint") &&
            message.includes(`'${entrypoint}'`),
        ),
      ).toBe(true)
    }
    expect(
      messages.filter((message) =>
        message.includes("implementation imports through formal public entrypoint 'rpc.ts'"),
      ).length,
    ).toBeGreaterThan(1)
    for (const capability of ["fetch", "Bun", "process", "globalThis", "crypto"]) {
      expect(
        messages.some((message) => message.includes(`global runtime capability '${capability}'`)),
      ).toBe(true)
    }
    expect(
      violations.some(
        ({ file, message }) =>
          file.endsWith("domain/ambient-fetch.ts") &&
          message.includes("global runtime capability 'fetch'"),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("TUI entrypoint reaches forbidden runtime dependency 'adapters/sqlite/"),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes(
          "server entrypoint reaches forbidden runtime dependency 'adapters/opencode/tui/",
        ),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("server runtime graph imports forbidden dependency '@opentui/solid'"),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes(
          "server runtime graph imports forbidden dependency '@opencode/plugin/tui'",
        ),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("server runtime graph imports forbidden dependency 'solid-js/web'"),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("TUI runtime graph imports forbidden dependency 'node:fs'"),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("TUI runtime graph imports forbidden dependency 'bun:sqlite'"),
      ),
    ).toBe(true)
    expect(
      messages.filter((message) =>
        message.includes("TUI runtime graph imports forbidden dependency 'bun'"),
      ).length,
    ).toBeGreaterThan(1)
    expect(
      messages.some((message) =>
        message.includes(
          "RPC entrypoint reaches forbidden runtime dependency 'adapters/opencode/server/",
        ),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("RPC runtime graph imports forbidden dependency 'node:fs'"),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("RPC runtime graph imports forbidden dependency '@opencode/plugin'"),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("RPC runtime graph imports forbidden dependency 'bun'"),
      ),
    ).toBe(true)
    expect(
      messages.some((message) =>
        message.includes("RPC runtime graph imports forbidden dependency 'solid-js/store'"),
      ),
    ).toBe(true)
    for (const specifier of [
      "@opencode/plugin",
      "@opencode/plugin/effect",
      "@opencode/plugin/host",
      "@opencode/plugin/promise/rpc",
    ]) {
      expect(
        messages.some((message) =>
          message.includes(`TUI runtime graph imports forbidden dependency '${specifier}'`),
        ),
      ).toBe(true)
    }
    expect(
      messages.some((message) =>
        message.includes("TUI runtime graph imports forbidden dependency '@opencode/plugin/tui'"),
      ),
    ).toBe(false)
    expect(
      messages.some((message) =>
        message.includes("TUI runtime graph imports forbidden dependency '@opencode/plugin/rpc'"),
      ),
    ).toBe(false)
    expect(
      messages.some((message) =>
        message.includes(
          "TUI runtime graph has a nonliteral dynamic import that cannot be checked",
        ),
      ),
    ).toBe(true)
  })

  test("accepts a clean dependency and runtime-entrypoint fixture", () => {
    // GIVEN
    const allowedRoot = resolve(
      import.meta.dir,
      "./_support/import-boundaries/fixtures/architecture/allowed/src",
    )

    // WHEN
    const violations = checkArchitecture(allowedRoot)

    // THEN
    expect(violations).toEqual([])
  })

  test("treats preserved verbatimModuleSyntax imports as runtime edges", () => {
    // GIVEN
    const runtimeRoot = resolve(
      import.meta.dir,
      "./_support/import-boundaries/fixtures/architecture/verbatim-runtime/src",
    )

    // WHEN
    const runtimeMessages = checkArchitecture(runtimeRoot).map((violation) => violation.message)

    // THEN
    for (const module of ["empty-connection.ts", "type-connection.ts", "reexport-connection.ts"]) {
      expect(
        runtimeMessages.some((message) =>
          message.includes(
            `TUI entrypoint reaches forbidden runtime dependency 'adapters/sqlite/${module}'`,
          ),
        ),
      ).toBe(true)
    }
  })

  test("erases whole type-only imports from verbatimModuleSyntax runtime graphs", () => {
    // GIVEN
    const typeOnlyRoot = resolve(
      import.meta.dir,
      "./_support/import-boundaries/fixtures/architecture/verbatim-type-only/src",
    )

    // WHEN
    const violations = checkArchitecture(typeOnlyRoot)

    // THEN
    expect(violations).toEqual([])
  })

  test("follows .mjs/.cjs source substitutions through runtime graphs", () => {
    // GIVEN
    const extensionsRoot = resolve(
      import.meta.dir,
      "./_support/import-boundaries/fixtures/architecture/extensions/src",
    )

    // WHEN
    const messages = checkArchitecture(extensionsRoot).map((violation) => violation.message)

    // THEN
    expect(
      messages.some((message) =>
        message.includes("TUI runtime graph imports forbidden dependency 'node:fs'"),
      ),
    ).toBe(true)
  })

  test("accepts pure .mjs/.cjs source substitutions", () => {
    // GIVEN
    const pureExtensionsRoot = resolve(
      import.meta.dir,
      "./_support/import-boundaries/fixtures/architecture/extensions-pure/src",
    )

    // WHEN
    const violations = checkArchitecture(pureExtensionsRoot)

    // THEN
    expect(violations).toEqual([])
  })

  test("reports local imports that escape the indexed source root", () => {
    // GIVEN
    const escapeRoot = resolve(
      import.meta.dir,
      "./_support/import-boundaries/fixtures/architecture/escape/src",
    )

    // WHEN
    const messages = checkArchitecture(escapeRoot).map((violation) => violation.message)

    // THEN
    expect(messages.some((message) => message.includes("escapes the indexed source root"))).toBe(
      true,
    )
  })
})
