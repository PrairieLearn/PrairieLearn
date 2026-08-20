interface SessionKey {
  projectKey: string;
  sessionId: string;
  subpath?: string;
}

interface SessionStoreEntry {
  type: string;
  uuid?: string;
  [key: string]: unknown;
}

interface SessionManifest {
  version: 1;
  key: SessionKey;
  nextSequence: number;
  parts: string[];
  uuids: string[];
  modifiedAt: number;
  totalBytes: number;
}

const storagePrefix = 'session-manifest:';
const totalBytesStorageKey = 'session-total-bytes';
const maxManifestParts = 2_048;
const maxManifestUuids = 100_000;
const maxConversationManifests = 256;
const maxConversationParts = 4_096;
const maxConversationBytes = 64 * 1024 * 1024;
const maxAppendBytes = 1024 * 1024;
const maxAppendEntries = 1_000;

export async function handleSessionStoreRequest({
  request,
  bucket,
  storage,
  conversationId,
}: {
  request: Request;
  bucket: R2Bucket;
  storage: DurableObjectStorage;
  conversationId: string;
}): Promise<Response> {
  const url = new URL(request.url);
  const body = await parseObject(request);

  switch (`${request.method} ${url.pathname}`) {
    case 'POST /append': {
      const key = parseSessionKey(body.key);
      const entries = parseEntries(body.entries);
      const manifestStorageKey = await storageKey(key);
      const existingManifest = await storage.get<SessionManifest>(manifestStorageKey);
      const manifests = await storage.list<SessionManifest>({ prefix: storagePrefix });
      if (existingManifest === undefined && manifests.size >= maxConversationManifests) {
        throw new Error('Session store manifest limit reached');
      }
      if (
        [...manifests.values()].reduce((total, item) => total + item.parts.length, 0) >=
        maxConversationParts
      ) {
        throw new Error('Session store conversation part limit reached');
      }
      const manifest = existingManifest ?? newManifest(key);
      if (manifest.parts.length >= maxManifestParts) {
        throw new Error('Session store part limit reached');
      }
      const knownUuids = new Set(manifest.uuids);
      const appendedEntries = entries.filter((entry) => {
        if (entry.uuid === undefined) return true;
        if (knownUuids.has(entry.uuid)) return false;
        knownUuids.add(entry.uuid);
        return true;
      });

      if (appendedEntries.length === 0) {
        return Response.json({ appended: 0, deduplicated: entries.length });
      }

      if (knownUuids.size > maxManifestUuids) throw new Error('Session store UUID limit reached');

      const serializedEntries = JSON.stringify(appendedEntries);
      const appendedBytes = new TextEncoder().encode(serializedEntries).byteLength;
      if (appendedBytes > maxAppendBytes) throw new Error('Session store append is too large');
      const currentTotalBytes = (await storage.get<number>(totalBytesStorageKey)) ?? 0;
      if (currentTotalBytes + appendedBytes > maxConversationBytes) {
        throw new Error('Session store conversation byte limit reached');
      }

      const partKey = sessionPartKey(
        conversationId,
        key,
        manifest.nextSequence,
        crypto.randomUUID(),
      );
      await bucket.put(partKey, serializedEntries, {
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: 'application/json' },
      });

      const nextManifest: SessionManifest = {
        ...manifest,
        nextSequence: manifest.nextSequence + 1,
        parts: [...manifest.parts, partKey],
        uuids: [...knownUuids],
        modifiedAt: Date.now(),
        totalBytes: (manifest.totalBytes ?? 0) + appendedBytes,
      };
      await storage.put(manifestStorageKey, nextManifest);
      await storage.put(totalBytesStorageKey, currentTotalBytes + appendedBytes);
      return Response.json({
        appended: appendedEntries.length,
        deduplicated: entries.length - appendedEntries.length,
      });
    }

    case 'POST /load': {
      const key = parseSessionKey(body.key);
      const manifest = await storage.get<SessionManifest>(await storageKey(key));
      if (!manifest) return Response.json({ entries: null });

      const entries: SessionStoreEntry[] = [];
      for (const partKey of manifest.parts) {
        const part = await bucket.get(partKey);
        if (!part) throw new Error(`Missing immutable session part: ${partKey}`);
        entries.push(...parseEntries(await part.json()));
      }
      return Response.json({ entries });
    }

    case 'POST /list-subkeys': {
      const key = parseSessionKey(body.key, false);
      const manifests = await storage.list<SessionManifest>({ prefix: storagePrefix });
      const subkeys = [...manifests.values()]
        .filter(
          (manifest) =>
            manifest.key.projectKey === key.projectKey &&
            manifest.key.sessionId === key.sessionId &&
            manifest.key.subpath !== undefined,
        )
        .map((manifest) => manifest.key.subpath as string)
        .sort();
      return Response.json({ subkeys });
    }

    case 'POST /list-sessions': {
      const projectKey = body.project_key;
      if (projectKey !== '/workspace/course') {
        throw new Error('project_key must be /workspace/course');
      }
      const manifests = await storage.list<SessionManifest>({ prefix: storagePrefix });
      const sessions = [...manifests.values()]
        .filter(
          (manifest) =>
            manifest.key.projectKey === projectKey && manifest.key.subpath === undefined,
        )
        .map((manifest) => ({ sessionId: manifest.key.sessionId, mtime: manifest.modifiedAt }));
      return Response.json({ sessions });
    }

    case 'POST /delete': {
      const key = parseSessionKey(body.key, false);
      const manifests = await storage.list<SessionManifest>({ prefix: storagePrefix });
      const matches = [...manifests.entries()].filter(
        ([, manifest]) =>
          manifest.key.projectKey === key.projectKey && manifest.key.sessionId === key.sessionId,
      );
      await Promise.all(
        matches.flatMap(([, manifest]) => manifest.parts.map((part) => bucket.delete(part))),
      );
      await storage.delete(matches.map(([manifestKey]) => manifestKey));
      const deletedBytes = matches.reduce(
        (total, [, manifest]) => total + (manifest.totalBytes ?? 0),
        0,
      );
      const totalBytes = (await storage.get<number>(totalBytesStorageKey)) ?? 0;
      await storage.put(totalBytesStorageKey, Math.max(0, totalBytes - deletedBytes));
      return Response.json({ deleted: matches.length });
    }
  }

  return new Response('Not found', { status: 404 });
}

export async function deleteConversationSessionStore(
  bucket: R2Bucket,
  storage: DurableObjectStorage,
  conversationId: string,
): Promise<void> {
  await deleteR2Prefix(bucket, `conversations/${conversationId}/claude/`);
  const manifests = await storage.list({ prefix: storagePrefix });
  await storage.delete([...manifests.keys()]);
}

export async function deleteR2Prefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const result = await bucket.list({ prefix, cursor });
    await Promise.all(result.objects.map((object) => bucket.delete(object.key)));
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor !== undefined);
}

export function sessionPartKey(
  conversationId: string,
  key: SessionKey,
  sequence: number,
  partId: string,
): string {
  const subpath = key.subpath === undefined ? 'main' : encodeComponent(key.subpath);
  return `conversations/${conversationId}/claude/${encodeComponent(key.projectKey)}/${encodeComponent(key.sessionId)}/${subpath}/parts/${sequence.toString().padStart(12, '0')}-${partId}.json`;
}

async function storageKey(key: SessionKey): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(key));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `${storagePrefix}${hex(new Uint8Array(digest))}`;
}

function newManifest(key: SessionKey): SessionManifest {
  return {
    version: 1,
    key,
    nextSequence: 0,
    parts: [],
    uuids: [],
    modifiedAt: Date.now(),
    totalBytes: 0,
  };
}

function parseSessionKey(value: unknown, allowSubpath = true): SessionKey {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('key must be an object');
  }
  if (!('projectKey' in value) || value.projectKey !== '/workspace/course') {
    throw new Error('key.projectKey must be /workspace/course');
  }
  if (
    !('sessionId' in value) ||
    typeof value.sessionId !== 'string' ||
    !value.sessionId ||
    value.sessionId.length > 1_024
  ) {
    throw new Error('key.sessionId must be between 1 and 1024 characters');
  }
  const subpath = 'subpath' in value ? value.subpath : undefined;
  if (
    subpath !== undefined &&
    (!allowSubpath ||
      typeof subpath !== 'string' ||
      !subpath.startsWith('subagents/') ||
      subpath.length > 2_048)
  ) {
    throw new Error('Invalid key.subpath');
  }
  return { projectKey: value.projectKey, sessionId: value.sessionId, subpath };
}

function parseEntries(value: unknown): SessionStoreEntry[] {
  if (!Array.isArray(value)) throw new Error('entries must be an array');
  if (value.length > maxAppendEntries) throw new Error('Session store entry limit reached');
  return value.map((entry) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      Array.isArray(entry) ||
      !('type' in entry) ||
      typeof entry.type !== 'string' ||
      entry.type.length > 256
    ) {
      throw new Error('Invalid session store entry');
    }
    if (
      'uuid' in entry &&
      entry.uuid !== undefined &&
      (typeof entry.uuid !== 'string' || entry.uuid.length > 1_024)
    ) {
      throw new Error('Invalid session store entry UUID');
    }
    return entry as SessionStoreEntry;
  });
}

async function parseObject(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

function encodeComponent(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
