import { readFile } from "node:fs/promises"
import { type CommandExecutor, installGlobalPlugin } from "./install.js"

const PACKAGE_NAME = "@sbugallo/pokecode"
const EXACT_SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

const HELP = `Usage: npx ${PACKAGE_NAME} init [--dry-run]

Commands:
  init       Install this package version through OpenCode's global plugin manager.

Options:
  --dry-run  Show the native OpenCode command without running it.
  --help     Show this help text.
`

export type PackageManifest = Readonly<{ name: typeof PACKAGE_NAME; version: string }>

export type CliDependencies = Readonly<{
  readPackageManifest?: () => Promise<PackageManifest>
  execute?: CommandExecutor
  writeOut?: (text: string) => void
  writeError?: (text: string) => void
}>

type ParsedArguments =
  | Readonly<{ kind: "help" }>
  | Readonly<{ kind: "command"; command: "init"; dryRun: boolean }>
  | Readonly<{ kind: "invalid"; message: string }>

function isPackageManifest(value: unknown): value is PackageManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  if (!("name" in value) || !("version" in value)) return false
  const { name, version } = value
  return name === PACKAGE_NAME && typeof version === "string" && EXACT_SEMVER.test(version)
}

export async function readPackageManifestAt(packageManifestUrl: URL): Promise<PackageManifest> {
  const source = await readFile(packageManifestUrl, "utf8")
  const manifest: unknown = JSON.parse(source)
  if (!isPackageManifest(manifest)) {
    throw new Error("Invalid PokéCode package manifest.")
  }
  return manifest
}

function parseArguments(arguments_: readonly string[]): ParsedArguments {
  if (arguments_.length === 1 && arguments_[0] === "--help") return { kind: "help" }
  const [command, ...options] = arguments_
  if (command !== "init") {
    return { kind: "invalid", message: "Expected init." }
  }
  if (options.length === 0) return { kind: "command", command, dryRun: false }
  if (options.length === 1 && options[0] === "--dry-run") {
    return { kind: "command", command, dryRun: true }
  }
  return { kind: "invalid", message: "Only --dry-run is supported after a command." }
}

export async function runCli(
  arguments_: readonly string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const writeOut = dependencies.writeOut ?? ((text: string) => process.stdout.write(text))
  const writeError = dependencies.writeError ?? ((text: string) => process.stderr.write(text))
  const parsed = parseArguments(arguments_)

  if (parsed.kind === "help") {
    writeOut(HELP)
    return 0
  }
  if (parsed.kind === "invalid") {
    writeError(`${parsed.message}\n\n${HELP}`)
    return 2
  }

  const readManifest = dependencies.readPackageManifest
  if (readManifest === undefined) {
    throw new Error("The CLI composition root must provide its package manifest location.")
  }
  const manifest = await readManifest()
  if (!isPackageManifest(manifest)) {
    throw new Error("Invalid PokéCode package manifest.")
  }
  const packageSpec = `${manifest.name}@${manifest.version}`
  if (parsed.dryRun) {
    writeOut(`opencode plugin add ${packageSpec}\n`)
    return 0
  }

  await installGlobalPlugin(packageSpec, dependencies.execute)
  writeOut("OpenCode plugin installation completed. Restart OpenCode.\n")
  return 0
}
