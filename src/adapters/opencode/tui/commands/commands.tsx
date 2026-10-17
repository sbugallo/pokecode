import { usePlugin } from "@opencode/plugin/tui"
import type { GameState } from "../../../../application/contracts/game.js"
import { uiCopy } from "../../../presentation/ui-copy.js"

export function LocationsCommand(properties: {
  readonly enabled: () => boolean
  readonly language: () => GameState["locale"]
  readonly onChoose: () => Promise<void>
}) {
  const context = usePlugin()
  context.keymap.layer(() => ({
    mode: "global",
    priority: 10,
    commands: [
      {
        id: "pokecode.locations",
        title: uiCopy(properties.language()).locationsCommand,
        group: uiCopy(properties.language()).commandGroup,
        palette: true,
        slash: { name: "pokecode-locations" },
        enabled: properties.enabled,
        run: properties.onChoose,
      },
    ],
  }))
  return null
}

export function DexCommand(properties: {
  readonly language: () => GameState["locale"]
  readonly onChoose: () => Promise<void>
}) {
  const context = usePlugin()
  context.keymap.layer(() => ({
    mode: "global",
    priority: 10,
    commands: [
      {
        id: "pokecode.dex",
        title: uiCopy(properties.language()).dexCommand,
        group: uiCopy(properties.language()).commandGroup,
        palette: true,
        slash: { name: "pokecode-dex" },
        run: properties.onChoose,
      },
    ],
  }))
  return null
}

export function PcCommand(properties: {
  readonly enabled: () => boolean
  readonly language: () => GameState["locale"]
  readonly onChoose: () => Promise<void>
}) {
  const context = usePlugin()
  context.keymap.layer(() => ({
    mode: "global",
    priority: 10,
    commands: [
      {
        id: "pokecode.pc",
        title: uiCopy(properties.language()).pcCommand,
        group: uiCopy(properties.language()).commandGroup,
        palette: true,
        slash: { name: "pokecode-pc" },
        enabled: properties.enabled,
        run: properties.onChoose,
      },
    ],
  }))
  return null
}

export function ExportCommand(properties: {
  readonly enabled: () => boolean
  readonly language: () => GameState["locale"]
  readonly onExport: () => Promise<void>
}) {
  const context = usePlugin()
  context.keymap.layer(() => ({
    mode: "global",
    priority: 10,
    commands: [
      {
        id: "pokecode.export",
        title: uiCopy(properties.language()).exportCommand,
        group: uiCopy(properties.language()).commandGroup,
        palette: true,
        slash: { name: "pokecode-export" },
        enabled: properties.enabled,
        run: properties.onExport,
      },
    ],
  }))
  return null
}
