import path from 'path';

/**
 * Returns true if the parent path contains the child path. Used to allow code to make checks that
 * prevent directory traversal attacks.
 * @param parentPath The path of the parent directory. If provided, assumed to be absolute. If set to null, the child path is normalized and checked against an arbitrary parent directory.
 * @param childPath The path of the child directory. If relative, resolved in relation to the parent directory (if one exists) or normalized.
 * @param includeSelf Return value if both paths point to the same directory.
 * @return True if the child path is a child of the parent path, false otherwise.
 */
export function contains(
  parentPath: string | null,
  childPath: string,
  includeSelf = true,
): boolean {
  const relPath =
    parentPath == null
      ? path.normalize(childPath)
      : path.relative(parentPath, path.resolve(parentPath, childPath));
  if (!relPath || relPath === '.') return includeSelf;
  return !(relPath.split(path.sep)[0] === '..' || path.isAbsolute(relPath));
}
