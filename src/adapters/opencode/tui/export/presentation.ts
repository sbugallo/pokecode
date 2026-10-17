import type { ClipboardWriteResult } from "@opentui/core"

export function clipboardResultToast(
  result: ClipboardWriteResult,
  copy: {
    readonly exportTitle: string
    readonly exportSuccessMessage: string
    readonly exportFailedTitle: string
    readonly clipboardUnavailable: string
  },
) {
  const copied = result.host.status === "written" || result.terminal.status === "attempted"
  return copied
    ? {
        title: copy.exportTitle,
        message: copy.exportSuccessMessage,
        variant: "success" as const,
      }
    : {
        title: copy.exportFailedTitle,
        message:
          result.host.status === "failed" ? result.host.error.message : copy.clipboardUnavailable,
        variant: "error" as const,
      }
}
