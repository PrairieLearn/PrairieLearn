// @ts-check

class LocalCache {
    /**
     * @param {number?} expirySec Minimum time to keep keys in cache; null means never expire (optional, default null).
     */
    constructor(expirySec=null) {
        this.expirySec = expirySec;
        this.data = {};
        this.oldData = {};

        const that = this;
        function clearOldData() {
            that.oldData = that.data;
            that.data = {};
            setTimeout(clearOldData, that.expirySec * 1000);
        }
        if (this.expirySec != null) {
            clearOldData();
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

module.exports = LocalCache;
