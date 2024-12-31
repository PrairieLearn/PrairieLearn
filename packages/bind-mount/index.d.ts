/**
 * Creates a bind mount at `target` that points to `source`.
 */
export declare function mount(source: string, target: string): Promise<void>;
/**
 * Removes the bind mount at `target`.
 */
export declare function umount(target: string): Promise<void>;
