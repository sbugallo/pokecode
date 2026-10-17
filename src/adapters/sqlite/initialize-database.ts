type ClosableDatabase = {
  close(force?: boolean): void
}

export function initializeSqliteDatabase(database: ClosableDatabase, initialize: () => void): void {
  try {
    initialize()
  } catch (initializationFailure) {
    try {
      database.close(true)
    } catch (closeFailure) {
      throw new AggregateError(
        [initializationFailure, closeFailure],
        "SQLite initialization and cleanup failed.",
      )
    }
    throw initializationFailure
  }
}
