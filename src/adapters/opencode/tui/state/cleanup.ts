import type { createTuiStateCoordinator } from "./coordinator.js"

export function createTuiCleanup(dependencies: {
  readonly state: ReturnType<typeof createTuiStateCoordinator>
  readonly unsubscribe?: () => void
  readonly unregisterSlot?: () => void
  readonly disposeClipboard?: () => void | Promise<void>
}) {
  let cleanupPromise: Promise<void> | undefined

  return (): Promise<void> => {
    if (cleanupPromise !== undefined) return cleanupPromise

    let resolveCleanup!: () => void
    let rejectCleanup!: (error: unknown) => void
    cleanupPromise = new Promise<void>((resolve, reject) => {
      resolveCleanup = resolve
      rejectCleanup = reject
    })

    // Invalidate callback state synchronously, before any external disposer runs.
    dependencies.state.dispose()

    const failures: unknown[] = []
    const runSynchronousDisposer = (dispose: (() => void) | undefined): void => {
      if (dispose === undefined) return
      try {
        dispose()
      } catch (error) {
        failures.push(error)
      }
    }
    runSynchronousDisposer(dependencies.unsubscribe)
    runSynchronousDisposer(dependencies.unregisterSlot)

    const finish = (): void => {
      if (failures.length === 1) throw failures[0]
      if (failures.length > 1) {
        throw new AggregateError(failures, "Multiple TUI resources failed to clean up")
      }
    }

    try {
      const disposal = dependencies.disposeClipboard?.()
      Promise.resolve(disposal).then(
        () => {
          try {
            finish()
            resolveCleanup()
          } catch (error) {
            rejectCleanup(error)
          }
        },
        (error: unknown) => {
          failures.push(error)
          try {
            finish()
            resolveCleanup()
          } catch (combinedError) {
            rejectCleanup(combinedError)
          }
        },
      )
    } catch (error) {
      failures.push(error)
      try {
        finish()
        resolveCleanup()
      } catch (combinedError) {
        rejectCleanup(combinedError)
      }
    }

    return cleanupPromise
  }
}
