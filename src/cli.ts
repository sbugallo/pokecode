#!/usr/bin/env node
import { realpathSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageManifestAt, runCli } from "./cli/command.js"

const invokedPath = process.argv[1]
if (
  invokedPath !== undefined &&
  realpathSync(resolve(invokedPath)) === realpathSync(fileURLToPath(import.meta.url))
) {
  runCli(process.argv.slice(2), {
    readPackageManifest: () => readPackageManifestAt(new URL("../package.json", import.meta.url)),
  }).then(
    (exitCode) => {
      process.exitCode = exitCode
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "Unexpected CLI failure."
      process.stderr.write(`${message}\n`)
      process.exitCode = 1
    },
  )
}
