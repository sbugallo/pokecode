import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { chmod, mkdir, readFile, rm, stat } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import ts from "typescript"
import {
  createPackageWorkspace,
  packageFiles,
  packPackage,
  runPackageCommand,
} from "../../support/package.js"

let workspace: Awaited<ReturnType<typeof createPackageWorkspace>>
let packed: Awaited<ReturnType<typeof packPackage>>

beforeAll(async () => {
  workspace = await createPackageWorkspace()
  const prepack = await runPackageCommand(workspace.root, ["bun", "run", "prepack"], workspace.env)
  if (prepack.exitCode !== 0) throw new Error(`${prepack.stdout}\n${prepack.stderr}`)
  packed = await packPackage(workspace)
}, 30_000)

afterAll(async () => {
  await workspace?.dispose()
})

function typeDiagnostics(consumerFile: string) {
  const program = ts.createProgram([consumerFile], {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: ["bun-types"],
  })
  // Check our consumer and declaration closure, not unrelated dependency-library diagnostics.
  const sources = program
    .getSourceFiles()
    .filter(
      (file) =>
        file.fileName === consumerFile ||
        file.fileName.startsWith(`${join(packed.root, "dist")}${sep}`),
    )
  return [
    ...program.getOptionsDiagnostics(),
    ...sources.flatMap((source) => [
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    ]),
  ].map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
}

describe("isolated package build and packing", () => {
  test("packs every declared entrypoint and preserves the executable Node CLI", async () => {
    // GIVEN
    const { manifest } = packed

    // WHEN
    const files = await packageFiles(packed.root)
    const { pokecode: cliPath } = manifest.bin
    if (cliPath === undefined) throw new Error("Missing named CLI binary")
    const cli = await readFile(resolve(packed.root, cliPath), "utf8")
    const cliMode = (await stat(resolve(packed.root, cliPath))).mode

    // THEN
    expect(manifest.name).toBe("@sbugallo/pokecode")
    expect(cliPath).toBe("./dist/cli.js")
    expect(Object.keys(manifest.exports).sort()).toEqual([".", "./rpc", "./tui"])
    expect(manifest.exports["."]?.import).toBe(manifest.main)
    for (const path of [
      manifest.main,
      cliPath,
      ...Object.values(manifest.exports).flatMap((entry) => [entry.import, entry.types]),
    ]) {
      expect(files).toContain(path.replace(/^\.\//, ""))
      expect((await stat(resolve(packed.root, path))).size).toBeGreaterThan(0)
    }
    expect(files).toContain("README.md")
    expect(files).toContain("LICENSE")
    expect(files.some((file) => /^(src|tests|scripts)\//.test(file))).toBe(false)
    expect(files.filter((file) => /^dist\/[^/]+\.js$/.test(file))).toEqual([
      "dist/cli.js",
      "dist/index.js",
      "dist/rpc.js",
      "dist/tui.js",
    ])
    expect(files).not.toContain("dist/tui.jsx")
    expect(cli.startsWith("#!/usr/bin/env node")).toBe(true)
    expect(cliMode & 0o111).not.toBe(0)
  })

  test("resolves public consumer types through the packed declaration closure without source files", async () => {
    // GIVEN
    const consumerFile = join(packed.root, "consumer-types.ts")
    await Bun.write(
      consumerFile,
      `
      import server from ${JSON.stringify(packed.manifest.name)}
      import { PokecodeRpc } from ${JSON.stringify(`${packed.manifest.name}/rpc`)}
      import tui from ${JSON.stringify(`${packed.manifest.name}/tui`)}
      type Rpc = typeof PokecodeRpc
      const method: keyof Rpc["methods"] = "status"
      void [server, tui, method]
    `,
    )
    try {
      // WHEN
      const diagnostics = typeDiagnostics(consumerFile)

      // THEN
      expect(diagnostics).toEqual([])
    } finally {
      await rm(consumerFile, { force: true })
    }
  }, 30_000)

  test("a rebuild removes stale generated files at every depth and stale TUI resolver output", async () => {
    // GIVEN
    const staleFiles = [
      ...["unused", "nested/unused"].flatMap((name) =>
        [".js", ".js.map", ".d.ts", ".d.ts.map"].map((suffix) => `${name}${suffix}`),
      ),
      "tui.jsx",
      "tui.jsx.map",
    ]
    for (const file of staleFiles)
      await Bun.write(join(workspace.root, "dist", file), "stale output")

    // WHEN
    const build = await runPackageCommand(workspace.root, ["bun", "run", "build"], workspace.env)
    const files = await packageFiles(join(workspace.root, "dist"))

    // THEN
    expect(build.exitCode, `${build.stdout}\n${build.stderr}`).toBe(0)
    for (const file of staleFiles) expect(files).not.toContain(file)
    for (const entry of ["index", "rpc", "tui", "cli"]) {
      expect(files).toContain(`${entry}.js`)
      expect(files).toContain(`${entry}.d.ts`)
    }
  }, 30_000)

  test.each([
    { name: "successful native installation", exitCode: 0, expectedExit: 0 },
    { name: "failed native installation", exitCode: 17, expectedExit: 1 },
  ])(
    "forwards the versioned package to OpenCode during $name",
    async ({ name, exitCode, expectedExit }) => {
      // GIVEN
      const directory = join(workspace.root, name.replaceAll(" ", "-"))
      const fakeBin = join(directory, "bin")
      const log = join(directory, "arguments.log")
      await mkdir(fakeBin, { recursive: true })
      const executable = join(fakeBin, "opencode")
      await Bun.write(
        executable,
        `#!/bin/sh\nprintf '%s\\n' "$@" > "$OPENCODE_LOG"\nexit "$OPENCODE_EXIT_CODE"\n`,
      )
      await chmod(executable, 0o755)
      const { pokecode: cliPath } = packed.manifest.bin
      const node = Bun.which("node")
      if (cliPath === undefined || node === null)
        throw new Error("Node and the CLI binary are required")

      // WHEN
      const installed = await runPackageCommand(
        directory,
        [node, resolve(packed.root, cliPath), "init"],
        {
          PATH: fakeBin,
          OPENCODE_LOG: log,
          OPENCODE_EXIT_CODE: String(exitCode),
        },
      )

      // THEN
      expect(installed.exitCode).toBe(expectedExit)
      expect(await readFile(log, "utf8")).toBe(
        `plugin\nadd\n${packed.manifest.name}@${packed.manifest.version}\n`,
      )
      expect(installed.stdout).toBe(
        exitCode === 0 ? "OpenCode plugin installation completed. Restart OpenCode.\n" : "",
      )
      expect(installed.stderr).toBe(
        exitCode === 0 ? "" : "OpenCode plugin installer exited with status 17.\n",
      )
    },
  )
})
