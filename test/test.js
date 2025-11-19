'use strict';

var obcache = require('../index');
var assert = require('assert');

// Helper: create async function for testing
function createAsyncFn(delay) {
  delay = delay || 0;
  return function(id, cb) {
    setTimeout(function() {
      cb(null, { id: id });
    }, delay);
  };
}

describe('wrap()', function() {
  var cache;

  beforeEach(function() {
    cache = new obcache.Create({ max: 100, queueEnabled: true });
  });

  it('should cache function results', function(done) {
    var callCount = 0;
    var fn = cache.wrap(function(id, cb) {
      callCount++;
      cb(null, id);
    });

    fn(1, function(err, res) {
      assert.strictEqual(res, 1);
      fn(1, function(err, res) {
        assert.strictEqual(res, 1);
        assert.strictEqual(callCount, 1);
        done();
      });
    });
  });

  it('should track hits and misses', function(done) {
    var fn = cache.wrap(createAsyncFn());

    fn(1, function() {
      assert.strictEqual(cache.stats.miss, 1);
      assert.strictEqual(cache.stats.hit, 0);
      fn(1, function() {
        assert.strictEqual(cache.stats.hit, 1);
        done();
      });
    });
  });

  it('should use different keys for different args', function(done) {
    var fn = cache.wrap(createAsyncFn());

    fn(1, function() {
      fn(2, function() {
        assert.strictEqual(cache.stats.miss, 2);
        done();
      });
    });
  });

  it('should deduplicate concurrent requests', function(done) {
    var callCount = 0;
    var fn = cache.wrap(function(id, cb) {
      callCount++;
      setTimeout(function() {
        cb(null, id);
      }, 10);
    });

    var completed = 0;
    function onComplete() {
      completed++;
      if (completed === 3) {
        assert.strictEqual(callCount, 1);
        done();
      }
    }

    fn(1, onComplete);
    fn(1, onComplete);
    fn(1, onComplete);
  });
});

describe('wrap() Promise API', function() {
  var cache;

  beforeEach(function() {
    cache = new obcache.Create({ max: 100 });
  });

  it('should return promise when no callback', async function() {
    var fn = cache.wrap(createAsyncFn());
    var result = await fn(1);
    assert.strictEqual(result.id, 1);
  });

  it('should cache with promise API', async function() {
    var callCount = 0;
    var fn = cache.wrap(function(id, cb) {
      callCount++;
      cb(null, id);
    });

    await fn(1);
    await fn(1);
    assert.strictEqual(callCount, 1);
  });

  it('should reject on error', async function() {
    var fn = cache.wrap(function(id, cb) {
      cb(new Error('test error'));
    });

    try {
      await fn(1);
      assert.fail('should have thrown');
    } catch (err) {
      assert.strictEqual(err.message, 'test error');
    }
  });
});

describe('warmup()', function() {
  var cache, fn;

  beforeEach(function() {
    cache = new obcache.Create({ max: 100 });
    fn = cache.wrap(createAsyncFn());
  });

  it('should pre-populate cache', function(done) {
    cache.warmup(fn, 1, { id: 1, warmed: true });

    fn(1, function(err, res) {
      assert.strictEqual(res.warmed, true);
      assert.strictEqual(cache.stats.miss, 0);
      assert.strictEqual(cache.stats.hit, 1);
      done();
    });
  });

  it('should throw for non-cache function', function() {
    assert.throws(function() {
      cache.warmup(function() {}, 1, 'value');
    }, /Not an obcachejs function/);
  });
});

describe('invalidate()', function() {
  var cache, fn;

  beforeEach(function() {
    cache = new obcache.Create({ max: 100 });
    fn = cache.wrap(createAsyncFn());
  });

  it('should remove cached value', function(done) {
    fn(1, function() {
      assert.strictEqual(cache.stats.miss, 1);

      cache.invalidate(fn, 1);

      fn(1, function() {
        assert.strictEqual(cache.stats.miss, 2);
        done();
      });
    });
  });

  it('should only invalidate specific key', function(done) {
    fn(1, function() {
      fn(2, function() {
        cache.invalidate(fn, 1);

        fn(1, function() {
          fn(2, function() {
            assert.strictEqual(cache.stats.miss, 3); // 1, 2, then 1 again
            assert.strictEqual(cache.stats.hit, 1);  // 2 was still cached
            done();
          });
        });
      });
    });
  });

  it('should throw for non-cache function', function() {
    assert.throws(function() {
      cache.invalidate(function() {}, 1);
    }, /Not an obcachejs function/);
  });
});

describe('skipArgs', function() {
  var cache;

  beforeEach(function() {
    cache = new obcache.Create({ max: 100 });
  });

  it('should exclude args from cache key', function(done) {
    var callCount = 0;
    var fn = cache.wrap(function(id, timestamp, cb) {
      callCount++;
      cb(null, id);
    }, null, [1]); // Skip index 1 (timestamp)

    fn(1, 1000, function() {
      fn(1, 2000, function() {
        assert.strictEqual(callCount, 1); // Same key despite different timestamp
        done();
      });
    });
  });

  it('should work with warmup', function(done) {
    var fn = cache.wrap(function(id, timestamp, cb) {
      cb(null, { id: id, ts: timestamp });
    }, null, [1]);

    cache.warmup(fn, 1, 'ignored', { id: 1, warmed: true });

    fn(1, Date.now(), function(err, res) {
      assert.strictEqual(res.warmed, true);
      done();
    });
  });
});

describe('isReady()', function() {
  it('should return true for LRU cache', function() {
    var cache = new obcache.Create({ max: 100 });
    assert.strictEqual(cache.isReady(), true);
  });
});

describe('LRU eviction', function() {
  it('should evict when max reached', function(done) {
    var cache = new obcache.Create({ max: 2 });
    var fn = cache.wrap(createAsyncFn());

    fn(1, function() {
      fn(2, function() {
        fn(3, function() {
          // Key 1 should be evicted
          fn(1, function() {
            assert.strictEqual(cache.stats.miss, 4);
            done();
          });
        });
      });
    });
  });

  it('should keep recently used', function(done) {
    var cache = new obcache.Create({ max: 2 });
    var fn = cache.wrap(createAsyncFn());

    fn(1, function() {
      fn(2, function() {
        fn(1, function() { // Access 1 again, making 2 oldest
          fn(3, function() {
            // Key 2 should be evicted, 1 kept
            fn(1, function() {
              assert.strictEqual(cache.stats.hit, 2); // 1 accessed twice from cache
              done();
            });
          });
        });
      });
    });
  });
});

describe('error handling', function() {
  var cache;

  beforeEach(function() {
    cache = new obcache.Create({ max: 100 });
  });

  it('should not cache errors', function(done) {
    var callCount = 0;
    var fn = cache.wrap(function(id, cb) {
      callCount++;
      if (callCount === 1) {
        cb(new Error('first call fails'));
      } else {
        cb(null, 'success');
      }
    });

    fn(1, function(err) {
      assert.ok(err);
      fn(1, function(err, res) {
        assert.strictEqual(err, null);
        assert.strictEqual(res, 'success');
        assert.strictEqual(callCount, 2);
        done();
      });
    });
  });

  it('should propagate errors to callback', function(done) {
    var fn = cache.wrap(function(id, cb) {
      cb(new Error('test'));
    });

    fn(1, function(err) {
      assert.strictEqual(err.message, 'test');
      done();
    });
  });
});

describe('thisobj binding', function() {
  it('should bind wrapped function to thisobj', function(done) {
    var cache = new obcache.Create({ max: 100 });
    var context = { value: 42 };

    var fn = cache.wrap(function(id, cb) {
      cb(null, this.value);
    }, context);

    fn(1, function(err, res) {
      assert.strictEqual(res, 42);
      done();
    });
  });
});

describe('stats', function() {
  it('should track all operations', function(done) {
    var cache = new obcache.Create({ max: 100 });
    var fn = cache.wrap(createAsyncFn());

    assert.deepStrictEqual(cache.stats, { hit: 0, miss: 0, reset: 0, pending: 0 });

    fn(1, function() {
      fn(1, function() {
        fn(2, function() {
          assert.strictEqual(cache.stats.hit, 1);
          assert.strictEqual(cache.stats.miss, 2);
          done();
        });
      });
    });
  });
});

describe('debug', function() {
  it('should register cache', function() {
    var cache = new obcache.Create({ max: 100 });
    var result = obcache.debug.register(cache, 'test');
    assert.strictEqual(result, cache);
  });
});
