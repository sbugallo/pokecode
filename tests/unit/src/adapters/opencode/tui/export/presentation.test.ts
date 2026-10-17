import { describe, expect, test } from "bun:test"
import type { ClipboardWriteResult } from "@opentui/core"
import { clipboardResultToast } from "../../../../../../../src/adapters/opencode/tui/export/presentation.js"

const copy = {
  exportTitle: "Team copied",
  exportSuccessMessage: "The team is ready to paste.",
  exportFailedTitle: "Copy failed",
  clipboardUnavailable: "Clipboard unavailable.",
}

describe("clipboard result presentation", () => {
  test.each([
    {
      name: "host clipboard wrote the text",
      result: {
        host: { status: "written" },
        terminal: { status: "not-attempted", capability: "unsupported" },
      } as ClipboardWriteResult,
      expected: { title: copy.exportTitle, message: copy.exportSuccessMessage, variant: "success" },
    },
    {
      name: "terminal clipboard attempted the write",
      result: {
        host: { status: "unsupported" },
        terminal: { status: "attempted", capability: "supported" },
      } as ClipboardWriteResult,
      expected: { title: copy.exportTitle, message: copy.exportSuccessMessage, variant: "success" },
    },
    {
      name: "host clipboard returned an error",
      result: {
        host: { status: "failed", error: new Error("host denied") },
        terminal: { status: "not-attempted", capability: "unsupported" },
      } as ClipboardWriteResult,
      expected: { title: copy.exportFailedTitle, message: "host denied", variant: "error" },
    },
    {
      name: "no clipboard can accept the text",
      result: {
        host: { status: "unsupported" },
        terminal: { status: "local-failure", capability: "unknown" },
      } as ClipboardWriteResult,
      expected: {
        title: copy.exportFailedTitle,
        message: copy.clipboardUnavailable,
        variant: "error",
      },
    },
  ])("$name", ({ result, expected }) => {
    // GIVEN

    // WHEN
    const presentation = clipboardResultToast(result, copy)

    // THEN
    expect(presentation).toEqual(expected)
  })
})
