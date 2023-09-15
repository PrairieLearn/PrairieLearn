import path from 'path';

/**
 * Returns true if the parent path contains the child path. Used to allow code to make checks that
 * prevent directory traversal attacks.
 * @param parentPath The path of the parent directory. Assumed to be absolute.
 * @param childPath The path of the child directory. Usually absolute, but if relative, resolved in relation to the parent directory.
 * @param includeSelf Return value if both paths point to the same directory.
 * @return True if the child path is a child of the parent path, false otherwise.
 */
export function contains(parentPath: string, childPath: string, includeSelf = true): boolean {
  const relPath = path.relative(parentPath, path.resolve(parentPath, childPath));
  if (!relPath) return includeSelf;
  return !(relPath.split(path.sep)[0] === '..' || path.isAbsolute(relPath));
}
