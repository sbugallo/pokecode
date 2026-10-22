import type { Context } from "@opencode/plugin/tui/context"
import type { Accessor } from "solid-js"
import type { GameState } from "../../../../application/contracts/game.js"
import { uiCopy } from "../../../presentation/ui-copy.js"
import type { SpriteResolver } from "../../../sprites/contracts.js"
import { DexCommand, ExportCommand, LocationsCommand, PcCommand } from "../commands/commands.js"
import type { ImageProtocolAccessor } from "../components/image-protocol.js"
import type { createSidebarActions } from "./actions.js"
import { SidebarView } from "./view.js"

type SidebarActions = ReturnType<typeof createSidebarActions>

export function registerPokemonSidebar(dependencies: {
  readonly slot: Context["ui"]["slot"]
  readonly state: Accessor<GameState>
  readonly theme: { readonly base: Accessor<string>; readonly muted: Accessor<string> }
  readonly hoveredStarter: Accessor<string | null>
  readonly setHoveredStarter: (speciesId: string | null) => void
  readonly hoveredEncounterAction: Accessor<"catch" | "run" | null>
  readonly setHoveredEncounterAction: (action: "catch" | "run" | null) => void
  readonly actions: SidebarActions
  readonly chooseLocation: () => Promise<void>
  readonly showDex: () => Promise<void>
  readonly chooseParty: () => Promise<void>
  readonly exportTeam: () => Promise<void>
  readonly resolveSprite: SpriteResolver
  readonly imageProtocol: ImageProtocolAccessor
}) {
  const copy = () => uiCopy(dependencies.state().locale)
  return dependencies.slot({
    append: "sidebar.content",
    render: () => (
      <box flexDirection="column" paddingTop={1} gap={1}>
        <SidebarTitle color={dependencies.theme.base} title={copy().title} />
        <LocationsCommand
          enabled={() => dependencies.state().phase === "active"}
          language={() => dependencies.state().locale}
          onChoose={dependencies.chooseLocation}
        />
        <DexCommand language={() => dependencies.state().locale} onChoose={dependencies.showDex} />
        <PcCommand
          enabled={() => dependencies.state().phase === "active"}
          language={() => dependencies.state().locale}
          onChoose={dependencies.chooseParty}
        />
        <ExportCommand
          enabled={() => dependencies.state().phase === "active"}
          language={() => dependencies.state().locale}
          onExport={dependencies.exportTeam}
        />
        <SidebarView
          hoveredEncounterAction={dependencies.hoveredEncounterAction}
          hoveredStarter={dependencies.hoveredStarter}
          hoverStarter={dependencies.setHoveredStarter}
          mutedColor={dependencies.theme.muted}
          onChooseStarter={dependencies.actions.chooseStarter}
          onTravelRegion={dependencies.actions.travelToRegion}
          onTravelLocation={dependencies.actions.travelToLocation}
          onResolveEncounter={dependencies.actions.resolveEncounter}
          onResolveEvolution={dependencies.actions.resolveEvolutionChoice}
          onResolveMove={dependencies.actions.resolveMoveChoice}
          resolveSprite={dependencies.resolveSprite}
          imageProtocol={dependencies.imageProtocol}
          setHoveredEncounterAction={dependencies.setHoveredEncounterAction}
          starterHoverBackground={dependencies.theme.muted}
          state={dependencies.state}
        />
      </box>
    ),
  })
}

export function SidebarTitle(properties: {
  readonly color: Accessor<string>
  readonly title: string
}) {
  return <text fg={properties.color()}>{properties.title}</text>
}
