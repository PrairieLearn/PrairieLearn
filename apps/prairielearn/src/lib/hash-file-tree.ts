import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';

import { limitAsync } from 'es-toolkit/promise';

export interface FileTreeHash {
  name: string;
  hash: string;
  children: FileTreeHash[];
}

// Bound open files across recursive walks while allowing parallel disk I/O.
const hashFile = limitAsync(async (filename: string) => {
  const hash = createHash('sha256').update(path.basename(filename));
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}, 16);

/** Computes content hashes for asset files and their ancestor directories. */
export async function hashFileTree(filename: string): Promise<FileTreeHash> {
  const name = path.basename(filename);

  // Follow symlinks so changes to the served content also invalidate its cache.
  if ((await stat(filename)).isDirectory()) {
    const names = (await readdir(filename)).sort();
    const children = await Promise.all(
      names.map((name) => hashFileTree(path.join(filename, name))),
    );
    const hash = createHash('sha256').update(name);
    for (const child of children) {
      hash.update(child.hash);
    }

    return { name, hash: hash.digest('hex'), children };
  }

  return { name, hash: await hashFile(filename), children: [] };
}
