import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { createBuiltPackage, packageFiles, runPackageCommand } from "../../support/package.js"

let artifact: Awaited<ReturnType<typeof createBuiltPackage>>

function consumerEnvironment() {
  return {
    PATH: "",
    HOME: resolve(artifact.root, "../consumer-home"),
    XDG_DATA_HOME: resolve(artifact.root, "../consumer-data"),
    XDG_CONFIG_HOME: resolve(artifact.root, "../consumer-config"),
  }
}

beforeAll(async () => {
  artifact = await createBuiltPackage()
}, 30_000)

afterAll(async () => {
  await artifact?.dispose()
})

describe("packed package consumer smoke checks", () => {
  test.each([
    {
      name: "server",
      runtime: "bun",
      suffix: "",
      check: "if (!entry.default) throw new Error('Missing server plugin')",
    },
    {
      name: "RPC",
      runtime: "node",
      suffix: "/rpc",
      check: "if (entry.PokecodeRpc?.id !== 'pokecode') throw new Error('Missing RPC contract')",
    },
    {
      name: "TUI",
      runtime: "bun",
      suffix: "/tui",
      check:
        "if (!entry.default || Object.keys(entry).join() !== 'default') throw new Error('Invalid TUI exports'); if (Bun.resolveSync('./dist/tui', process.cwd()) !== process.cwd() + '/dist/tui.js') throw new Error('Incorrect extensionless TUI resolution')",
    },
  ])("loads the $name entrypoint from the packed artifact", async ({ runtime, suffix, check }) => {
    // GIVEN
    const specifier = `${artifact.manifest.name}${suffix}`
    const executable = Bun.which(runtime)
    if (executable === null) throw new Error(`Missing runtime: ${runtime}`)
    const before = await packageFiles(artifact.root)

    // WHEN
    const loaded = await runPackageCommand(
      artifact.root,
      [
        executable,
        "--input-type=module",
        "--eval",
        `import * as entry from ${JSON.stringify(specifier)}; ${check}`,
      ],
      consumerEnvironment(),
    )

    // THEN
    expect(loaded.exitCode, `${loaded.stdout}\n${loaded.stderr}`).toBe(0)
    expect(await packageFiles(artifact.root)).toEqual(before)
    expect(
      await Bun.file(resolve(consumerEnvironment().XDG_DATA_HOME, "pokecode/game.sqlite")).exists(),
    ).toBe(false)
  })

  test.each([
    { name: "help", args: ["--help"], expected: "Usage: npx ", exitCode: 0 },
    { name: "dry run", args: ["init", "--dry-run"], expected: "opencode plugin add ", exitCode: 0 },
    { name: "invalid command", args: ["install"], expected: "Expected init.", exitCode: 2 },
  ])(
    "runs CLI $name under Node without writing package files",
    async ({ args, expected, exitCode }) => {
      // GIVEN
      const { pokecode: cli } = artifact.manifest.bin
      if (cli === undefined) throw new Error("Missing CLI binary")
      const node = Bun.which("node")
      if (node === null) throw new Error("Node is required for CLI consumer checks")
      const before = await packageFiles(artifact.root)

      // WHEN
      const result = await runPackageCommand(
        artifact.root,
        [node, resolve(artifact.root, cli), ...args],
        consumerEnvironment(),
      )

      // THEN
      expect(result.exitCode, result.stderr).toBe(exitCode)
      expect(exitCode === 0 ? result.stdout : result.stderr).toContain(expected)
      expect(exitCode === 0 ? result.stderr : result.stdout).toBe("")
      expect(await packageFiles(artifact.root)).toEqual(before)
    },
  )
})
