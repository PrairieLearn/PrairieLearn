import path from 'path';

/**
 * Returns true if the parent path contains the child path. Used to allow code
 * to make checks that prevent directory traversal attacks.
 *
 * @param parentPath The path of the parent directory. Must be absolute.
 * @param childPath The path of the child file/directory. If relative, resolved
 * in relation to the parent directory.
 * @param includeSelf Return value if both paths point to the same directory.
 * @return True if the child path is a child of the parent path, false
 * otherwise.
 */
export function contains(parentPath: string, childPath: string, includeSelf = true): boolean {
  return isContainedRelativePath(
    path.relative(parentPath, path.resolve(parentPath, childPath)),
    includeSelf,
  );
}

/**
 * Returns true if the path, when normalized, is relative and does not require a
 * visit to the parent directory. In other words, returns true if, when resolved
 * against any arbitrary directory, will never result in a file outside of that
 * directory. Used to allow code to make checks that prevent directory traversal
 * attacks.
 *
 * @param relPath The path of the child directory. Path will be normalized
 * before checking.
 * @param includeSelf Return value if the path refers to the directory itself
 * (i.e. '.' or '').
 * @return True if the path is contained within the current directory, false
 * otherwise.
 */
export function isContainedRelativePath(relPath: string, includeSelf = true): boolean {
  relPath = path.normalize(relPath);
  if (relPath === '.') return includeSelf;
  return !(relPath.split(path.sep)[0] === '..' || path.isAbsolute(relPath));
}
