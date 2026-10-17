import type { Context } from "@opencode/plugin/tui/context"
import { uiCopy } from "../../../presentation/ui-copy.js"
import type { createPokemonTuiClient } from "../client.js"
import type { createTuiStateCoordinator } from "../state/coordinator.js"
import { PokemonDexDialog } from "./dialog.js"

type TuiClient = ReturnType<typeof createPokemonTuiClient>
type TuiState = ReturnType<typeof createTuiStateCoordinator>

export function createDexAction(dependencies: {
  readonly rpc: TuiClient
  readonly state: TuiState
  readonly dialog: Pick<Context["ui"]["dialog"], "show" | "set" | "clear">
}) {
  return async (): Promise<void> => {
    const dex = await dependencies.rpc.dex({})
    if (dependencies.state.isDisposed()) return
    dependencies.dialog.show(() => (
      <PokemonDexDialog
        onClose={() => {
          if (!dependencies.state.isDisposed()) dependencies.dialog.clear()
        }}
        pokemon={dex.pokemon}
        title={uiCopy(dependencies.state.state().locale).dexDialog}
      />
    ))
    dependencies.dialog.set({ size: "medium", centered: true })
  }
}
