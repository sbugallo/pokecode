import { createTextAttributes } from "@opentui/core"

export const bold = createTextAttributes({ bold: true })

type ActionTone = "primary" | "secondary" | "success"

export function PokecodeActionButton(properties: {
  readonly hovered: () => boolean
  readonly label: string
  readonly onActivate: () => Promise<void>
  readonly onHover: () => void
  readonly onLeave: () => void
  readonly tone: ActionTone
}) {
  const colors = {
    primary: { base: "#2563eb", hovered: "#1d4ed8" },
    secondary: { base: "#6b7280", hovered: "#4b5563" },
    success: { base: "#16a34a", hovered: "#15803d" },
  }[properties.tone]
  return (
    <button
      alignItems="center"
      backgroundColor={properties.hovered() ? colors.hovered : colors.base}
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
      <text fg="#ffffff">{properties.label}</text>
    </button>
  )
}
