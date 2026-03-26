import * as path from 'path';

import fs from 'fs-extra';

/**
 * Recursively discovers directories under {@link rootDirectory} that contain
 * a file named {@link infoFile}. Returns relative paths from the root.
 *
 * Once a directory is found to contain the info file, its subdirectories are
 * not searched (mirroring how the sync process works).
 */
export async function discoverInfoDirs(rootDirectory: string, infoFile: string): Promise<string[]> {
  const results: string[] = [];

  const walk = async (relativeDir: string) => {
    const entries = await fs
      .readdir(path.join(rootDirectory, relativeDir), { withFileTypes: true })
      .catch((err) => {
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
          return [] as fs.Dirent[];
        }
        throw err;
      });

    await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (entry) => {
          const subdirPath = path.join(relativeDir, entry.name);
          const infoPath = path.join(rootDirectory, subdirPath, infoFile);
          if (await fs.pathExists(infoPath)) {
            results.push(subdirPath);
          } else {
            await walk(subdirPath);
          }
        }),
    );
  };

  await walk('');
  return results.sort();
}
