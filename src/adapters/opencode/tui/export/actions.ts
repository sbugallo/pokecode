import type { Context } from "@opencode/plugin/tui/context"
import type { ClipboardService } from "@opentui/core"
import { uiCopy } from "../../../presentation/ui-copy.js"
import type { createPokemonTuiClient } from "../client.js"
import type { createTuiStateCoordinator } from "../state/coordinator.js"
import { clipboardResultToast } from "./presentation.js"

type TuiClient = ReturnType<typeof createPokemonTuiClient>
type TuiState = ReturnType<typeof createTuiStateCoordinator>

export function createExportAction(dependencies: {
  readonly rpc: TuiClient
  readonly state: TuiState
  readonly clipboard: ClipboardService
  readonly toast: Context["ui"]["toast"]
}) {
  return async (): Promise<void> => {
    const copy = () => uiCopy(dependencies.state.state().locale)
    const exported = await dependencies.rpc.exportTeam({})
    if (dependencies.state.isDisposed()) return
    if (exported.kind === "inactive") {
      dependencies.toast.show({
        title: copy().exportInactiveTitle,
        message: copy().exportInactiveMessage,
        variant: "warning",
      })
      return
    }
    const result = await dependencies.clipboard.writeText(exported.text, {
      destination: "all-available",
    })
    if (!dependencies.state.isDisposed()) {
      dependencies.toast.show(clipboardResultToast(result, copy()))
    }
  }
}
