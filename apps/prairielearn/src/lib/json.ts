/**
 * Given an original object and a modified object, returns a new object
 * that contains all the data from the modified object, but with the keys
 * matching the order that they appear in the original object. Keys that are
 * not present in the original object are added at the end.
 *
 *
 * This function is meant to be used when programmatically editing JSON data.
 * It's designed to minimize the changes in the JSON data such that a `git diff`
 * doesn't show spurious changes unrelated to the actual data changes.
 */
export function applyKeyOrder(original: any, modified: any): any {
  if (typeof original !== 'object' || original === null) {
    return modified;
  }

  if (typeof modified !== 'object' || modified === null) {
    return modified;
  }

  if (Array.isArray(original) && Array.isArray(modified)) {
    return modified.map((value, index) => applyKeyOrder(original[index], value));
  }

  if (typeof original === 'object' && typeof modified === 'object') {
    const result: any = {};

    // Add keys from original in the order they appear.
    for (const key of Object.keys(original)) {
      if (key in modified) {
        result[key] = applyKeyOrder(original[key], modified[key]);
      }
    }

    // Add keys from modified that are not in original.
    for (const key of Object.keys(modified)) {
      if (!(key in result)) {
        result[key] = modified[key];
      }
    }

    return result;
  }

  return modified;
}
