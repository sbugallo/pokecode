import type { Context } from "@opencode/plugin/tui/context"
import type { SpriteResolver } from "../../../sprites/contracts.js"
import type { createPokemonTuiClient } from "../client.js"
import type { createTuiStateCoordinator } from "../state/coordinator.js"
import { LocationTravelDialog } from "./dialog.js"
import { locationTravelProjection } from "./projection.js"

type TuiClient = ReturnType<typeof createPokemonTuiClient>
type TuiState = ReturnType<typeof createTuiStateCoordinator>

/** Owns the location dialog workflow without coupling it to plugin setup. */
export function createLocationTravelAction(dependencies: {
  readonly rpc: TuiClient
  readonly state: TuiState
  readonly dialog: Pick<Context["ui"]["dialog"], "show" | "set" | "clear">
  readonly resolveSprite: SpriteResolver
  readonly travelToLocation: (locationId: string) => Promise<void>
}) {
  return async (): Promise<void> => {
    const state = await dependencies.rpc.status({})
    dependencies.state.apply(state)
    if (dependencies.state.isDisposed()) return
    const exploration = state.exploration
    const regionId = state.region
    if (exploration === null || regionId === null) return
    const dex = await dependencies.rpc.dex({})
    if (dependencies.state.isDisposed()) return
    const projection = locationTravelProjection(state, dex)
    if (projection === null) return

    dependencies.dialog.show(() => (
      <LocationTravelDialog
        {...projection}
        onClose={() => {
          if (!dependencies.state.isDisposed()) dependencies.dialog.clear()
        }}
        onTravel={async (locationId) => {
          await dependencies.travelToLocation(locationId)
          if (!dependencies.state.isDisposed()) dependencies.dialog.clear()
        }}
        resolveSprite={dependencies.resolveSprite}
      />
    ))
    dependencies.dialog.set({ size: "large", centered: true })
  }
}
