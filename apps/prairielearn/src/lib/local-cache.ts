export class LocalCache {
  expirySec: number | null;
  data: Record<any, any>;
  oldData: Record<any, any>;
  /**
   * @param expirySec Minimum time to keep keys in cache; null means never expire (optional, default null).
   */
  constructor(expirySec: number | null = null) {
    this.expirySec = expirySec;
    this.data = {};
    this.oldData = {};

    const clearOldData = () => {
      this.oldData = this.data;
      this.data = {};
    };

    if (this.expirySec != null) {
      // Unref the timer so it doesn't prevent the process from exiting.
      setInterval(clearOldData, this.expirySec * 1000).unref();
    }
  }

  /**
   * @param key The key for the value to set.
   * @param value The value to set.
   */
  set(key: any, value: any) {
    this.data[key] = value;
  }

  /**
   * @param key The key for the value to retrieve.
   * @returns The value associated with the key, or undefined if the key is not present in the cache.
   */
  get(key: any): any {
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
