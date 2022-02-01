const assert = require('chai').assert;
const ERR = require('async-stacktrace');
const LocalLock = require('../lib/local-lock');

describe('local locks', function () {
  describe('async calls', function () {
    it('should work with a single lock', async function () {
      this.timeout(1000);
      const lock = new LocalLock();
      assert.isFalse(lock._lock, 'lock was already locked');
      await lock.lockAsync();
      lock.unlock();
      assert.isFalse(lock._lock, 'lock was not returned');
    });

    it('should work with a single lock with no wait', async function () {
      this.timeout(1000);
      const lock = new LocalLock();
      assert.isFalse(lock._lock, 'lock was already locked');
      await lock.lockAsync(false);
      lock.unlock();
      assert.isFalse(lock._lock, 'lock was not returned');
    });

    it('should work with two callers', async function () {
      this.timeout(2000);
      return new Promise((resolve, reject) => {
        /* This looks horrible, I apologise in advance if you have to read this.
                   The idea here:
                   - caller 1 locks
                   - caller 2 locks
                   - caller 1 sets "unlocked flag" to true and unlocks
                   - caller 2 unlocks
                   - if "unlocked flag" isn't set, then things are being done in the wrong order
                   - success
                */
        const lock = new LocalLock();
        lock.lockAsync().then(() => {
          let unlocked = false;
          lock.lockAsync().then(() => {
            if (!unlocked) {
              reject(new Error('ran inner code before lock was released!'));
            }
            lock.unlock();
            resolve();
          });

          setTimeout(() => {
            unlocked = true;
            assert.isTrue(lock._lock);
            assert.equal(lock._waiting.length, 1);
            lock.unlock();
          }, 200);
        });
      });
    });

    /* queues up 10 callers then runs them all in order */
    it('should work with many callers', async function () {
      this.timeout(10000);
      const lock = new LocalLock();
      const num_runners = 10;

      await lock.lockAsync();
      setTimeout(async () => {
        assert.equal(lock._waiting.length, num_runners);
        lock.unlock();
      }, 1000);

      let current = 1;
      return new Promise((resolve, reject) => {
        for (let i = 1; i <= num_runners; i++) {
          (async () => {
            assert.isTrue(lock._lock, 'lock was not locked');
            await lock.lockAsync();
            if (current !== i) {
              assert.fail('running code in incorrect order!');
              reject();
            }
            current++;
            setTimeout(() => {
              lock.unlock();
              if (i === num_runners) {
                assert.isFalse(lock._lock, 'lock was locked after all callers finished');
                resolve();
              }
            }, 100);
          })();
        }
      });
    });

    it('should fail if we set wait to false and must wait', async function () {
      this.timeout(1000);
      const lock = new LocalLock();
      await lock.lockAsync();
      let errored = false;

      try {
        await lock.lockAsync(false);
        assert.fail('we should not be able to get the lock');
      } catch (err) {
        errored = true;
      }

      assert.isTrue(errored);
    });
  });

  describe('callback calls', function () {
    it('should work with a single lock', function (callback) {
      this.timeout(1000);
      const lock = new LocalLock();
      lock.lock(true, (err) => {
        if (ERR(err, callback)) return;
        lock.unlock();
        assert.isFalse(lock._lock, 'lock was not returned');
        callback(null);
      });
    });

    it('should work with a single lock with no wait', function (callback) {
      this.timeout(1000);
      const lock = new LocalLock();
      lock.lock(false, (err) => {
        if (ERR(err, callback)) return;
        lock.unlock();
        assert.isFalse(lock._lock, 'lock was not returned');
        callback(null);
      });
    });

    it('should work with two callers', function (callback) {
      this.timeout(2000);
      const lock = new LocalLock();
      lock.lock(true, (err) => {
        if (ERR(err, callback)) return;
        let unlocked = false;

        lock.lock(true, (err) => {
          if (ERR(err, callback)) return;
          if (!unlocked) {
            callback(new Error('ran inner code before lock was released!'));
          }
          lock.unlock();
          callback(null);
        });

        setTimeout(() => {
          unlocked = true;
          assert.isTrue(lock._lock);
          assert.equal(lock._waiting.length, 1);
          lock.unlock();
        });
      });
    });

    it('should work with many callers', function (callback) {
      this.timeout(10000);
      const num_runners = 10;
      const lock = new LocalLock();
      setTimeout(() => {
        assert.equal(lock._waiting.length, num_runners);
        lock.unlock();
      }, 1000);
      lock.lock(true, (err) => {
        if (ERR(err, callback)) return;

        let current = 1;
        for (let i = 1; i <= num_runners; i++) {
          assert.isTrue(lock._lock, 'lock was not locked');
          lock.lock(true, (err) => {
            if (ERR(err, callback)) return;
            if (current !== i) {
              assert.fail('running code in incorrect order!');
            }
            current++;

            setTimeout(() => {
              lock.unlock();
              if (i === num_runners) {
                assert.isFalse(lock._lock, 'lock was locked after all callers finished');
                callback(null);
              }
            }, 100);
          });
        }
      });
    });

    it('should fail if we set wait to false and must wait', function (callback) {
      this.timeout(1000);
      const lock = new LocalLock();

      lock.lock(true, (err) => {
        if (ERR(err, callback)) return;

        lock.lock(false, (err) => {
          if (!err) {
            assert.fail('we should not be able to get the lock');
            return callback(new Error());
          }
          callback(null);
        });
      });
    });
  });

  describe('mixed callback and async code', function () {
    it('should work with an async then callback call', function (callback) {
      this.timeout(2000);
      const lock = new LocalLock();
      lock.lockAsync().then(() => {
        lock.lock(true, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      });
      setTimeout(() => {
        assert.isTrue(lock._lock);
        assert.equal(lock._waiting.length, 1);
        lock.unlock();
      }, 500);
    });

    it('should work with a callback then async call', function (callback) {
      this.timeout(2000);
      const lock = new LocalLock();
      lock.lock(true, (err) => {
        if (ERR(err, callback)) return;

        lock.lockAsync().then(() => {
          callback(null);
        });
      });
      setTimeout(() => {
        assert.isTrue(lock._lock);
        assert.equal(lock._waiting.length, 1);
        lock.unlock();
      }, 500);
    });
  });
});
