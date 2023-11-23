/**
 * Creates a bind mount at `target` that points to `source`.
 *
 * @param source
 * @param target
 */
export function mount(source: string, target: string): Promise<void>;

/**
 * Removes the bind mount at `target`.
 * @param target
 */
export function umount(target: string): Promise<void>;
