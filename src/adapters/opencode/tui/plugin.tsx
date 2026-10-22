import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { createClipboard, createHostClipboard, createRendererClipboardAdapter } from "@opentui/core"
import { createSignal } from "solid-js"
import type { SpriteResolver } from "../../sprites/contracts.js"
import { PokecodeRpc } from "../rpc/contract.js"
import { createPokemonTuiClient } from "./client.js"
import { createImageProtocolState } from "./components/image-protocol.js"
import { createDexAction } from "./dex/actions.js"
import { createExportAction } from "./export/actions.js"
import { createPcAction } from "./pc/actions.js"
import { createSidebarActions } from "./sidebar/actions.js"
import { registerPokemonSidebar } from "./sidebar/register.js"
import { createTuiCleanup } from "./state/cleanup.js"
import { createTuiStateCoordinator, initialTuiState } from "./state/coordinator.js"
import { cleanupAfterSetupFailure } from "./state/setup-failure.js"
import { createLocationTravelAction } from "./travel/actions.js"
import "./controls/native.js"

type TuiClipboard = ReturnType<typeof createClipboard>

type TuiPluginDependencies = {
  readonly createClipboard: (context: Context) => TuiClipboard
  readonly registerSidebar?: typeof registerPokemonSidebar
}

const defaultDependencies: TuiPluginDependencies = {
  createClipboard: (context) =>
    createClipboard({
      host: createHostClipboard(),
      terminal: createRendererClipboardAdapter(context.renderer),
    }),
}

export function createPokemonTuiPlugin(dependencies = defaultDependencies) {
  return Plugin.define({
    id: "sbugallo.pokecode.tui",
    async setup(context) {
      const state = createTuiStateCoordinator(initialTuiState(), (notification) => {
        context.ui.toast.show(notification)
      })
      let clipboard: TuiClipboard | undefined
      let unsubscribe: (() => void) | undefined
      let unregisterSlot: (() => void) | undefined
      let disposeImageProtocol: (() => void) | undefined
      const cleanup = createTuiCleanup({
        state,
        unsubscribe: () => unsubscribe?.(),
        unregisterSlot: () => unregisterSlot?.(),
        disposeClipboard: () => clipboard?.dispose(),
        disposeImageProtocol: () => disposeImageProtocol?.(),
      })

      try {
        const rpc = createPokemonTuiClient(context.client.rpc(PokecodeRpc))
        clipboard = dependencies.createClipboard(context)
        const imageProtocol = createImageProtocolState(context.renderer)
        disposeImageProtocol = imageProtocol.dispose
        const initialStatus = await rpc.status({})
        state.initialize(initialStatus)
        unsubscribe = rpc.onStatusChanged(state.apply)
        const [hoveredStarter, setHoveredStarter] = createSignal<string | null>(null)
        const [hoveredEncounterAction, setHoveredEncounterAction] = createSignal<
          "catch" | "run" | null
        >(null)
        const resolveSprite: SpriteResolver = (speciesId, shiny, gender) =>
          rpc.sprite({ speciesId, shiny, gender })

        const sidebarActions = createSidebarActions({
          rpc,
          state,
          toast: (options) => context.ui.toast.show(options),
        })
        const chooseLocation = createLocationTravelAction({
          rpc,
          state,
          dialog: context.ui.dialog,
          resolveSprite,
          imageProtocol: imageProtocol.protocol,
          travelToLocation: sidebarActions.travelToLocation,
        })
        const showDex = createDexAction({ rpc, state, dialog: context.ui.dialog })
        const chooseParty = createPcAction({
          rpc,
          state,
          dialog: context.ui.dialog,
          theme: {
            base: () => context.theme.text.base,
            muted: () => context.theme.text.muted,
          },
          resolveSprite,
          imageProtocol: imageProtocol.protocol,
        })
        const exportTeam = createExportAction({
          rpc,
          state,
          clipboard,
          toast: context.ui.toast,
        })
        unregisterSlot = (dependencies.registerSidebar ?? registerPokemonSidebar)({
          slot: context.ui.slot,
          state: state.state,
          theme: {
            base: () => context.theme.text.base,
            muted: () => context.theme.text.muted,
          },
          hoveredStarter,
          setHoveredStarter,
          hoveredEncounterAction,
          setHoveredEncounterAction,
          actions: sidebarActions,
          chooseLocation,
          showDex,
          chooseParty,
          exportTeam,
          resolveSprite,
          imageProtocol: imageProtocol.protocol,
        })

        return cleanup
      } catch (error) {
        await cleanupAfterSetupFailure(cleanup, error)
      }
    },
  })
}

export default createPokemonTuiPlugin()
