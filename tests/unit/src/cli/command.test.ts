import { describe, expect, test } from "bun:test"
import { runCli } from "../../../../src/cli/command.js"

describe("installer CLI command", () => {
  test("invokes the injected OpenCode executor with the exact package version", async () => {
    // GIVEN
    let command = ""
    let arguments_: readonly string[] = []
    const output: string[] = []

    // WHEN
    const exitCode = await runCli(["init"], {
      readPackageManifest: async () => ({
        name: "@sbugallo/pokecode",
        version: "1.2.3",
      }),
      execute: async (nextCommand, nextArguments) => {
        command = nextCommand
        arguments_ = nextArguments
      },
      writeOut: (text) => output.push(text),
    })

    // THEN
    expect(exitCode).toBe(0)
    expect(command).toBe("opencode")
    expect(arguments_).toEqual(["plugin", "add", "@sbugallo/pokecode@1.2.3"])
    expect(output.join("")).toContain("Restart OpenCode")
  })

  test("prints the native install command without executing it in dry-run mode", async () => {
    // GIVEN
    const output: string[] = []
    let installed = false

    // WHEN
    const exitCode = await runCli(["init", "--dry-run"], {
      readPackageManifest: async () => ({
        name: "@sbugallo/pokecode",
        version: "1.2.3",
      }),
      execute: async () => {
        installed = true
      },
      writeOut: (text) => output.push(text),
    })

    // THEN
    expect(exitCode).toBe(0)
    expect(output.join("")).toBe("opencode plugin add @sbugallo/pokecode@1.2.3\n")
    expect(installed).toBe(false)
  })

  test("rejects unsupported commands without invoking OpenCode", async () => {
    // GIVEN
    const errors: string[] = []

    // WHEN
    const exitCode = await runCli(["install"], { writeError: (text) => errors.push(text) })

    // THEN
    expect(exitCode).toBe(2)
    expect(errors.join("")).toContain("Expected init")
  })
})
