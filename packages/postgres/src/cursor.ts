import type Cursor from 'pg-cursor';
import { z } from 'zod';

export async function* iterateCursor(cursor: Cursor, batchSize: number): AsyncGenerator<any[]> {
  while (true) {
    const rows = await cursor.read(batchSize);
    if (rows.length === 0) {
      break;
    }
    yield rows;
  }
}

export async function* iterateValidatedCursor<Model extends z.ZodTypeAny>(
  cursor: Cursor,
  batchSize: number,
  model: Model
): AsyncGenerator<Array<z.infer<Model>>> {
  for await (const rows of iterateCursor(cursor, batchSize)) {
    yield z.array(model).parse(rows);
  }
}
