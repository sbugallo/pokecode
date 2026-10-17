import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises"
import { basename, join, resolve } from "node:path"

const projectRoot = resolve(import.meta.dir, "../..")

export type PackageManifest = {
  readonly name: string
  readonly version: string
  readonly main: string
  readonly bin: Readonly<Record<string, string>>
  readonly exports: Readonly<Record<string, { readonly import: string; readonly types: string }>>
}

export async function runPackageCommand(
  cwd: string,
  command: readonly string[],
  env: Record<string, string | undefined> = process.env,
) {
  const process = Bun.spawn([...command], { cwd, env, stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

export async function packageFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await packageFiles(path)).map((file) => `${entry.name}/${file}`))
    } else {
      files.push(entry.name)
    }
  }
  return files.sort()
}

/** Each caller owns a fresh source-only workspace, with no dependency on checkout dist/. */
export async function createPackageWorkspace() {
  await mkdir("/tmp/opencode", { recursive: true })
  const root = await mkdtemp("/tmp/opencode/pokecode-package-")
  try {
    await Promise.all(
      [
        "src",
        "scripts/build.ts",
        "scripts/prepack.ts",
        "tsconfig.json",
        "package.json",
        "README.md",
        "LICENSE",
      ].map(async (path) => {
        const destination = join(root, path)
        await mkdir(resolve(destination, ".."), { recursive: true })
        await cp(join(projectRoot, path), destination, { recursive: true })
      }),
    )
    await symlink(join(projectRoot, "node_modules"), join(root, "node_modules"), "dir")
    const testBin = join(root, "test-bin")
    await mkdir(testBin)
    const blockedInstaller = join(testBin, "opencode")
    await Bun.write(
      blockedInstaller,
      "#!/bin/sh\necho 'Unexpected OpenCode installation during package setup' >&2\nexit 99\n",
    )
    await chmod(blockedInstaller, 0o755)
    const { PATH: inheritedPath } = process.env
    const env = {
      ...process.env,
      HOME: join(root, "home"),
      XDG_DATA_HOME: join(root, "data"),
      XDG_CONFIG_HOME: join(root, "config"),
      PATH: `${testBin}:${inheritedPath ?? ""}`,
    }
    const manifest = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    ) as PackageManifest
    return {
      root,
      manifest,
      env,
      async dispose() {
        await rm(root, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

/** Consume the real tarball, not a copy of sources or an assumed manifest inventory. */
export async function packPackage(workspace: Awaited<ReturnType<typeof createPackageWorkspace>>) {
  const outputDirectory = join(workspace.root, "packed")
  await mkdir(outputDirectory)
  const packed = await runPackageCommand(
    workspace.root,
    [
      "npm",
      "pack",
      "--json",
      "--ignore-scripts",
      "--offline",
      "--cache",
      join(workspace.root, "npm-cache"),
      "--pack-destination",
      outputDirectory,
    ],
    workspace.env,
  )
  if (packed.exitCode !== 0) throw new Error(`npm pack failed:\n${packed.stdout}\n${packed.stderr}`)
  const output = JSON.parse(packed.stdout) as
    | { readonly name: string; readonly filename: string }[]
    | Record<string, { readonly name: string; readonly filename: string }>
  const entries = Array.isArray(output) ? output : Object.values(output)
  const entry = entries.find((entry) => entry.name === workspace.manifest.name)
  if (!entry?.filename.endsWith(".tgz") || basename(entry.filename) !== entry.filename) {
    throw new Error("npm pack did not report the expected package tarball")
  }
  const root = join(workspace.root, "consumer")
  await mkdir(root)
  const unpacked = await runPackageCommand(workspace.root, [
    "tar",
    "-xzf",
    join(outputDirectory, entry.filename),
    "--strip-components=1",
    "-C",
    root,
  ])
  if (unpacked.exitCode !== 0) throw new Error(`Cannot unpack package: ${unpacked.stderr}`)
  await symlink(join(projectRoot, "node_modules"), join(root, "node_modules"), "dir")
  return { root, manifest: workspace.manifest }
}

/** One explicitly owned build/pack stage per smoke file; always clean up failed setup. */
export async function createBuiltPackage() {
  const workspace = await createPackageWorkspace()
  try {
    const build = await runPackageCommand(workspace.root, ["bun", "run", "build"], workspace.env)
    if (build.exitCode !== 0) throw new Error(`Build failed:\n${build.stdout}\n${build.stderr}`)
    return { ...(await packPackage(workspace)), dispose: workspace.dispose }
  } catch (error) {
    await workspace.dispose()
    throw error
  }
}
