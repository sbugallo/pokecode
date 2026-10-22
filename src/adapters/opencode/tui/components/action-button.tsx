import { createTextAttributes } from "@opentui/core"
import { fallbackPokecodeTheme, type PokecodeSurface } from "../theme.js"

export const bold = createTextAttributes({ bold: true })

export type ActionTone = "primary" | "secondary" | "success"

export function PokecodeActionButton(properties: {
  readonly hovered: () => boolean
  readonly label: string
  readonly onActivate: () => Promise<void>
  readonly onHover: () => void
  readonly onLeave: () => void
  readonly theme?: (() => PokecodeSurface) | undefined
  readonly tone: ActionTone
}) {
  const surface = () => properties.theme?.() ?? fallbackPokecodeTheme.current
  const colors = () => {
    const action = properties.tone === "secondary" ? surface().secondary : surface().primary
    return {
      background: properties.hovered() ? action.backgroundHovered : action.background,
      label:
        properties.tone === "success"
          ? surface().success
          : properties.hovered()
            ? action.labelHovered
            : action.label,
    }
  }
  return (
    <button
      alignItems="center"
      backgroundColor={colors().background}
      focusable
      justifyContent="center"
      paddingLeft={2}
      paddingRight={2}
      type="button"
      onBlur={properties.onLeave}
      onFocus={properties.onHover}
      onMouseOut={properties.onLeave}
      onMouseOver={properties.onHover}
      onMouseUp={() => void properties.onActivate()}
    >
      <text fg={colors().label}>{properties.label}</text>
    </button>
  )
}
