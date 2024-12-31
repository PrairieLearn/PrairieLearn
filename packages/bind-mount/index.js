let addon;
try {
    addon = await import('bindings').then((bindings) => bindings.default('addon'));
}
catch {
    addon = null;
}
/**
 * Creates a bind mount at `target` that points to `source`.
 */
export function mount(source, target) {
    if (!addon) {
        throw new Error('Failed to load native bindings');
    }
    return new Promise((resolve, reject) => {
        addon.Mount(source, target, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}
/**
 * Removes the bind mount at `target`.
 */
export function umount(target) {
    if (!addon) {
        throw new Error('Failed to load native bindings');
    }
    return new Promise((resolve, reject) => {
        addon.Umount(target, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}
