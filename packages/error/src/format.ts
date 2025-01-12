function indentString(stack: string, depth: number) {
  if (depth === 0) return stack;

  const indent = '    '.repeat(depth);
  return stack
    .split('\n')
    .map((line) => (indent + line).trimEnd())
    .join('\n');
}

/**
 * Recursively formats an error into a string. Correctly handles both the
 * `.cause` property and `AggregateError` instances.
 */
export function formatErrorStack(err: any, depth = 0, prefix = ''): string {
  // This will handle both circular references and unnecessarily deep chains.
  if (depth > 10) return '...';

  let stack = indentString(prefix + err.stack, depth);

  if (err.cause) {
    stack += `\n\n${formatErrorStack(err.cause, depth + 1, 'Cause: ')}`;
  }

  if (err instanceof AggregateError) {
    const indent = '    '.repeat(depth + 1);
    stack += `\n\n${indent}Errors: [\n`;

    err.errors.forEach((error, i) => {
      stack += formatErrorStack(error, depth + 2);
      if (i < err.errors.length - 1) stack += '\n\n';
    });

    stack += `\n${indent}]`;
  }

  return stack;
}

/**
 * This is a version of {@link formatErrorStack} that won't error in the case
 * of an unexpected error object. We'll use the original function if it works,
 * but if it fails for any reason, we'll just return the plain stack, whatever
 * it might be.
 */
export function formatErrorStackSafe(err: any): string {
  try {
    return formatErrorStack(err);
  } catch {
    return err.stack;
  }
}
