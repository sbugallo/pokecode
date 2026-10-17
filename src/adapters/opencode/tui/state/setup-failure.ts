export async function cleanupAfterSetupFailure(
  cleanup: () => Promise<void>,
  setupError: unknown,
): Promise<never> {
  try {
    await cleanup()
  } catch (cleanupError) {
    throw new AggregateError(
      [setupError, cleanupError],
      "TUI setup failed and cleanup also failed",
      { cause: setupError },
    )
  }
  throw setupError
}
