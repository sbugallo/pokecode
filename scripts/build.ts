import { chmod, lstat, readdir, rm } from "node:fs/promises"
import { basename, dirname, resolve, sep } from "node:path"
import solidPlugin from "@opentui/solid/bun-plugin"

const root = resolve(import.meta.dir, "..")
const outputDirectory = resolve(root, "dist")
process.chdir(root)

function assertOutputPathIsScoped(): void {
  if (
    outputDirectory !== resolve(root, "dist") ||
    dirname(outputDirectory) !== root ||
    basename(outputDirectory) !== "dist"
  ) {
    throw new Error(`Refusing to clean an unexpected build output path: ${outputDirectory}`)
  }
}

async function collectGeneratedOutputFiles(directory: string): Promise<string[]> {
  const generatedFiles: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (path !== outputDirectory && !path.startsWith(`${outputDirectory}${sep}`)) {
      throw new Error(`Build output escaped the guarded directory: ${path}`)
    }
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error(`Refusing to follow non-regular build output: ${path}`)
    }
    if (entry.isDirectory()) {
      generatedFiles.push(...(await collectGeneratedOutputFiles(path)))
    } else if (
      entry.name.endsWith(".d.ts") ||
      [".js", ".jsx", ".map"].some((extension) => entry.name.endsWith(extension)) ||
      path === resolve(outputDirectory, "package.json") ||
      path === resolve(outputDirectory, "generated/catalog.json")
    ) {
      generatedFiles.push(path)
    }
  }
  return generatedFiles
}

assertOutputPathIsScoped()
try {
  const outputStat = await lstat(outputDirectory)
  if (outputStat.isSymbolicLink() || !outputStat.isDirectory()) {
    throw new Error(`Refusing to clean a non-directory build output: ${outputDirectory}`)
  }
  const generatedFiles = await collectGeneratedOutputFiles(outputDirectory)
  for (const generatedFile of generatedFiles) {
    if (!generatedFile.startsWith(`${outputDirectory}${sep}`)) {
      throw new Error(`Refusing to remove a path outside build output: ${generatedFile}`)
    }
  }
  await Promise.all(generatedFiles.map((generatedFile) => rm(generatedFile)))
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
}

await Bun.$`bunx tsc --incremental false`

const sources = ["src/index.ts", "src/rpc.ts", "src/tui.tsx", "src/cli.ts"] as const

const result = await Bun.build({
  entrypoints: [...sources],
  root: resolve(root, "src"),
  outdir: outputDirectory,
  naming: { entry: "[dir]/[name].js" },
  target: "bun",
  format: "esm",
  splitting: false,
  plugins: [solidPlugin],
  external: ["@opencode/plugin", "@opencode/plugin/*", "@opentui/*", "solid-js", "zod"],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exitCode = 1
} else {
  // OpenCode resolves local TUI plugins without an extension and prefers JSX over JS.
  await Promise.all([
    rm(resolve(outputDirectory, "tui.jsx"), { force: true }),
    rm(resolve(outputDirectory, "tui.jsx.map"), { force: true }),
    chmod(resolve(outputDirectory, "cli.js"), 0o755),
  ])

  await Bun.write(
    resolve(outputDirectory, "package.json"),
    JSON.stringify(
      {
        name: "@sbugallo/pokecode-local",
        private: true,
        type: "module",
        main: "./index.js",
        exports: {
          ".": "./index.js",
          "./tui": "./tui.js",
        },
      },
      null,
      2,
    ),
  )
}
