import type { DirectoryBackupRecord } from '@cloudflare/sandbox';
import { expect, it, vi } from 'vitest';

import { RepositorySnapshot } from './repository-snapshot.js';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      readonly ctx: DurableObjectState,
      readonly env: Env,
    ) {}
  },
}));
vi.mock('../monitoring.js', () => ({ logEvent: vi.fn(), reportError: vi.fn() }));

const source = { repository: 'Org/course', branch: 'main' };
const commit = 'a'.repeat(40);

function backup(id: string) {
  return { id, size: 100 } as DirectoryBackupRecord;
}

function createSnapshot() {
  const stored = new Map<string, unknown>();
  const sandbox = { buildRepositorySnapshot: vi.fn(), deleteRepositorySnapshot: vi.fn() };
  const snapshot = new RepositorySnapshot(
    {
      storage: {
        kv: { get: (key: string) => stored.get(key), put: stored.set.bind(stored) },
        setAlarm: vi.fn(),
      },
    } as unknown as DurableObjectState,
    { CourseSandbox: { getByName: () => sandbox } } as unknown as Env,
  );
  return { snapshot, sandbox };
}

it('replaces the snapshot and deletes the archive it replaced', async () => {
  const { snapshot, sandbox } = createSnapshot();
  sandbox.buildRepositorySnapshot.mockResolvedValueOnce({ backup: backup('first'), commit });
  await snapshot.requestBuild(source);
  await snapshot.alarm();
  expect(sandbox.deleteRepositorySnapshot).not.toHaveBeenCalled();

  sandbox.buildRepositorySnapshot.mockResolvedValueOnce({ backup: backup('second'), commit });
  await snapshot.requestBuild(source);
  expect(snapshot.current()).toEqual(backup('first'));
  await snapshot.alarm();
  expect(snapshot.current()).toEqual(backup('second'));
  expect(sandbox.deleteRepositorySnapshot).toHaveBeenCalledExactlyOnceWith(backup('first'));
});

it('keeps the previous snapshot when a rebuild fails', async () => {
  const { snapshot, sandbox } = createSnapshot();
  sandbox.buildRepositorySnapshot.mockResolvedValueOnce({ backup: backup('first'), commit });
  await snapshot.requestBuild(source);
  await snapshot.alarm();

  sandbox.buildRepositorySnapshot.mockRejectedValueOnce(new Error('Remote branch not found'));
  await snapshot.requestBuild(source);
  await snapshot.alarm();
  expect(snapshot.current()).toEqual(backup('first'));
  expect(snapshot.status().build).toEqual({ status: 'failed', error: 'Remote branch not found' });
  expect(sandbox.deleteRepositorySnapshot).not.toHaveBeenCalled();
});
