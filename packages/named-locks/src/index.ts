import { PostgresPool, PoolClient } from '@prairielearn/postgres';
import { PoolConfig } from 'pg';

interface NamedLocksConfig {
  /**
   * How often to renew the lock in milliseconds. Defaults to 60 seconds.
   * Auto-renewal must be explicitly enabled on each lock where it is desired.
   *
   */
  renewIntervalMs?: number;
}

interface Lock {
  client: PoolClient;
  intervalId: NodeJS.Timeout | null;
}

interface LockOptions {
  /** How many milliseconds to wait (anything other than a positive number means forever) */
  timeout?: number;

  /**
   * Whether or not this lock should automatically renew itself periodically.
   * By default, locks will not renew themselves.
   *
   * This is mostly useful for locks that may be held for longer than the idle
   * session timeout that's configured for the Postgres database. The lock is
   * "renewed" by making a no-op query.
   */
  autoRenew?: boolean;
}

interface WithLockOptions<T> extends LockOptions {
  onNotAcquired?: () => Promise<T> | T;
}

/*
 * The functions here all identify locks by "name", which is a plain
 * string. The locks use the named_locks DB table. Each lock name
 * corresponds to a unique table row. To take a lock, we:
 *     1. make sure a row exists for the lock name
 *     2. start a transaction
 *     3. acquire a "FOR UPDATE" row lock on the DB row for the named
 *        lock (this blocks all other locks on the same row). See
 *        https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS
 *     4. return to the caller with the transaction held open
 *
 * The caller then does some work and finally calls releaseLock(),
 * which ends the transaction, thereby releasing the row lock.
 *
 * The flow above will wait indefinitely for the lock to become
 * available. To implement optional timeouts, we set the DB variable
 * `lock_timeout`:
 * https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-LOCK-TIMEOUT
 * If we timeout then we will return an error to the caller.
 *
 * To implement a no-waiting tryLock() we use the PostgreSQL "SKIP
 * LOCKED" feature:
 * https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE
 * If we fail to acquire the lock then we immediately release the
 * transaction and return to the caller with `lock = null`. In this
 * case the caller should not call releaseLock().
 *
 * The lock object returned by functions in this module are of the
 * form `{client, done}`, where `client` and `done` are sqldb
 * transaction objects. These are simply the objects we need to end
 * the transaction, which will release the lock.
 *
 * Importantly, we use a separate pool of database connections for acquiring
 * and holding locks. This ensures that we don't end up with a deadlock.
 * For instance, if we have a pool of 10 clients and there are 10 locks held at
 * once, if any code inside of a lock tries to acquire another database client,
 * we'd deadlock if we weren't separating the two pools of connections.
 *
 * You should NEVER try to acquire a lock in code that is executing with another
 * lock already held. Since there are a finite pool of locks available, this
 * can lead to deadlocks.
 */

export const pool = new PostgresPool();
let renewIntervalMs = 60_000;

/**
 * Initializes a new {@link PostgresPool} that will be used to acquire named locks.
 */
export async function init(
  pgConfig: PoolConfig,
  idleErrorHandler: (error: Error, client: PoolClient) => void,
  namedLocksConfig: NamedLocksConfig = {},
) {
  renewIntervalMs = namedLocksConfig.renewIntervalMs ?? renewIntervalMs;
  await pool.initAsync(pgConfig, idleErrorHandler);
  await pool.queryAsync(
    'CREATE TABLE IF NOT EXISTS named_locks (id bigserial PRIMARY KEY, name text NOT NULL UNIQUE);',
    {},
  );
}

/**
 * Shuts down the database connection pool that was used to acquire locks.
 */
export async function close() {
  await pool.closeAsync();
}

/**
 * Acquires the given lock, executes the provided function with the lock held,
 * and releases the lock once the function has executed.
 *
 * If the lock cannot be acquired, the function is not executed. If an `onNotAcquired`
 * function was provided, this function is called and its return value is returned.
 * Otherwise, an error is thrown to indicate that the lock could not be acquired.
 */
export async function doWithLock<T, U = never>(
  name: string,
  options: WithLockOptions<U>,
  func: () => Promise<T>,
): Promise<T | U> {
  const lock = await getLock(name, { timeout: 0, ...options });

  if (!lock) {
    if (options.onNotAcquired) {
      return await options.onNotAcquired();
    } else {
      throw new Error(`failed to acquire lock: ${name}`);
    }
  }

  try {
    return await func();
  } finally {
    await releaseLock(lock);
  }
}

/**
 * Internal helper function to get a lock with optional waiting.
 * Do not call directly; use `doWithLock()` instead.
 *
 * @param name The name of the lock to acquire.
 * @param options Optional parameters.
 */
async function getLock(name: string, options: LockOptions) {
  await pool.queryAsync(
    'INSERT INTO named_locks (name) VALUES ($name) ON CONFLICT (name) DO NOTHING;',
    { name },
  );

  const client = await pool.beginTransactionAsync();

  let acquiredLock = false;
  try {
    if (options.timeout) {
      // SQL doesn't like us trying to use a parameterized query with
      // `SET LOCAL ...`. So, in this very specific case, we do the
      // parameterization ourselves using `escapeLiteral`.
      await pool.queryWithClientAsync(
        client,
        `SET LOCAL lock_timeout = ${client.escapeLiteral(options.timeout.toString())}`,
        {},
      );
    }

    // A stuck lock is a critical issue. To make them easier to debug, we'll
    // include the literal lock name in the query instead of using a
    // parameterized query. The lock name should never include PII, so it's
    // safe if it shows up in plaintext in logs, telemetry, error messages,
    // etc.
    const lockNameLiteral = client.escapeLiteral(name);
    const lock_sql = options.timeout
      ? `SELECT * FROM named_locks WHERE name = ${lockNameLiteral} FOR UPDATE;`
      : `SELECT * FROM named_locks WHERE name = ${lockNameLiteral} FOR UPDATE SKIP LOCKED;`;
    const result = await pool.queryWithClientAsync(client, lock_sql, { name });
    acquiredLock = result.rowCount === 1;
  } catch (err) {
    // Something went wrong, so we end the transaction and re-throw the
    // error.
    await pool.endTransactionAsync(client, err as Error);
    throw err;
  }

  if (!acquiredLock) {
    // We didn't acquire the lock so our parent caller will never
    // release it, so we have to end the transaction now.
    await pool.endTransactionAsync(client, null);
    return null;
  }

  let intervalId = null;
  if (options.autoRenew) {
    // Periodically "renew" the lock by making a query.
    intervalId = setInterval(() => {
      client.query('SELECT 1;').catch(() => {});
    }, renewIntervalMs);
  }

  // We successfully acquired the lock, so we return with the transaction
  // help open. The caller will be responsible for releasing the lock and
  // ending the transaction.
  return { client, intervalId };
}

/**
 * Release a lock.
 *
 * @param lock A previously-acquired lock.
 */
async function releaseLock(lock: Lock) {
  if (lock == null) throw new Error('lock is null');
  clearInterval(lock.intervalId ?? undefined);
  await pool.endTransactionAsync(lock.client, null);
}
