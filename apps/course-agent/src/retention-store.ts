import source from './retention.sql';

// Exact SDK 0.23.0 / ai-chat 0.12.0 content tables in this conversation's DO.
// Keep cf_agents_state (binding/tombstone) and use the SDK to cancel schedules.
const queries = Object.fromEntries(
  [...source.matchAll(/-- BLOCK (\w+)\n([\s\S]*?)(?=-- BLOCK|$)/g)].map(([, name, sql]) => [
    name,
    sql,
  ]),
);

export async function purgeChatStorage(storage: DurableObjectStorage) {
  storage.transactionSync(() => {
    const tables = new Set(
      storage.sql
        .exec<{ name: string }>(queries.tables)
        .toArray()
        .map((r) => r.name),
    );
    for (const [name, query] of Object.entries(queries)) {
      if (name !== 'tables' && tables.has(name)) storage.sql.exec(query);
    }
  });
  // The pinned SDK stores recovery snapshots in KV, separate from its SQLite tables.
  // Bound each delete batch and never enumerate/delete another conversation's DO.
  for (const prefix of ['cf:chat:', 'cf:chat-recovery:', '__cf_chat_turn_snapshot:']) {
    for (;;) {
      const keys = [...(await storage.list({ prefix, limit: 100 })).keys()];
      if (keys.length === 0) break;
      await storage.delete(keys);
    }
  }
}
