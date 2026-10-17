import type { Database } from "bun:sqlite"

export type QueueKind = "choice" | "encounter"

/** Allocate a durable per-trainer queue sequence. Call only within the write transaction. */
export function nextQueueOrder(
  database: Database,
  trainerId: string,
  queueKind: QueueKind,
): number {
  database
    .query<void, [string, QueueKind]>(
      `INSERT INTO queue_order_sequences (trainer_id, queue_kind, last_order)
       VALUES (?1, ?2, 1)
       ON CONFLICT(trainer_id, queue_kind) DO UPDATE SET last_order = last_order + 1`,
    )
    .run(trainerId, queueKind)
  const order = database
    .query<{ readonly lastOrder: number }, [string, QueueKind]>(
      "SELECT last_order AS lastOrder FROM queue_order_sequences WHERE trainer_id = ?1 AND queue_kind = ?2",
    )
    .get(trainerId, queueKind)?.lastOrder
  if (order === undefined) throw new Error(`Failed to allocate ${queueKind} queue order`)
  return order
}
