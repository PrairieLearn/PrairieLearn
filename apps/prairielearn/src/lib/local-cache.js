// @ts-check

// Store all intervalIDs so we can clear them later.
const intervalIDs = [];

/**
 * Clear all setIntervals. Will allow the process to exit cleanly.
 */
export function close() {
  for (const intervalID of intervalIDs) {
    clearInterval(intervalID);
  }
}

export class LocalCache {
  /**
   * @param {number?} expirySec Minimum time to keep keys in cache; null means never expire (optional, default null).
   */
  constructor(expirySec = null) {
    this.expirySec = expirySec;
    this.data = {};
    this.oldData = {};

    const clearOldData = () => {
      this.oldData = this.data;
      this.data = {};
    };

    if (this.expirySec != null) {
      const intervalID = setInterval(clearOldData, this.expirySec * 1000);
      intervalIDs.push(intervalID);
    }
  }

  /**
   * @param {any} key The key for the value to set.
   * @param {any} value The value to set.
   */
  set(key, value) {
    this.data[key] = value;
  }

  /**
   * @param {any} key The key for the value to retrieve.
   * @return {any} The value associated with the key, or undefined if the key is not present in the cache.
   */
  get(key) {
    if (key in this.data) {
      return this.data[key];
    }
    if (key in this.oldData) {
      this.data[key] = this.oldData[key];
      delete this.oldData[key];
      return this.data[key];
    }
  }
}
