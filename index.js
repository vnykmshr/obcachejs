'use strict';

var sigmund = require('sigmund');
var log = require('debug')('obcachejs');
var util = require('util');

function keygen(name, args) {
  return sigmund({ f: name, a: args }, 8);
}

function CacheError(message) {
  this.message = message || '';
  Error.captureStackTrace(this, CacheError);
}

util.inherits(CacheError, Error);
CacheError.prototype.name = 'CacheError';

function filterArgs(args, skipArgs) {
  if (!skipArgs || !skipArgs.length) return args;
  return args.filter(function(a, i) {
    return skipArgs.indexOf(i) === -1;
  });
}

function validateCacheFunction(func) {
  if (!func || typeof func !== 'function' || !func.cacheName) {
    throw new Error('Not an obcachejs function');
  }
}

var cache = {

  Error: CacheError,

  Create: function(options) {
    var nextResetTime;
    var anonFnId = 0;
    var store;

    if (options && options.redis) {
      log('creating redis cache');
      store = require('./redis').init(options);
    } else {
      store = require('./lru').init(options);
    }

    this.store = store;
    this.pending = options.queueEnabled ? {} : null;
    this.stats = { hit: 0, miss: 0, reset: 0, pending: 0 };

    if (options && options.reset) {
      nextResetTime = options.reset.firstReset || Date.now() + options.reset.interval;
    }

    this.wrap = function(fn, thisobj, skipArgs) {
      var stats = this.stats;
      var fname = (fn.name || '_') + anonFnId++;
      var cachedfunc;
      var pending = this.pending;

      log('wrapping function %s', fname);

      cachedfunc = function() {
        var self = thisobj || this;
        var args = Array.prototype.slice.apply(arguments);
        var lastArg = args[args.length - 1];
        var callback;
        var usePromise = typeof lastArg !== 'function';
        var key, keyArgs;

        if (usePromise) {
          return new Promise(function(resolve, reject) {
            args.push(function(err, result) {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
            cachedfunc.apply(self, args);
          });
        }

        callback = args.pop();

        if (nextResetTime && nextResetTime < Date.now()) {
          log('resetting cache %d', nextResetTime);
          store.reset();
          stats.reset++;
          nextResetTime += options.reset.interval;
        }

        keyArgs = filterArgs(args, skipArgs);
        key = keygen(fname, keyArgs);

        log('fetching from cache %s', key);
        store.get(key, onget);

        function onget(err, data) {
          var v;

          if (!err && data !== undefined) {
            log('cache hit %s', key);
            process.nextTick(function() {
              callback.call(self, err, data);
            });
            stats.hit++;
            return;
          }

          log('cache miss %s', key);

          if (pending) {
            v = pending[key];
            if (v === undefined) {
              pending[key] = [log];
              stats.pending++;
            } else {
              log('fetch pending, queuing %s', key);
              return v.push(callback);
            }
          }

          args.push(function(err, res) {
            if (!err) {
              log('saving key %s', key);
              store.set(key, res);
            }

            callback.call(self, err, res);

            if (pending) {
              v = pending[key];
              if (v !== undefined && v.length) {
                log('processing queue for %s', key);
                process.nextTick(function() {
                  v.forEach(function(x) { x.call(self, err, res); });
                });
                stats.pending--;
                delete pending[key];
              }
            }
          });

          fn.apply(self, args);
          stats.miss++;
        }
      };

      log('created cache function %s', fname);
      cachedfunc.cacheName = fname;
      cachedfunc.skipArgs = skipArgs;
      return cachedfunc;
    };

    this.warmup = function() {
      var args = Array.prototype.slice.apply(arguments);
      var func = args.shift();
      var res = args.pop();

      validateCacheFunction(func);

      var keyArgs = filterArgs(args, func.skipArgs);
      var key = keygen(func.cacheName, keyArgs);
      log('warming cache %s key %s', func.cacheName, key);
      store.set(key, res);
    };

    this.invalidate = function() {
      var args = Array.prototype.slice.apply(arguments);
      var func = args.shift();

      validateCacheFunction(func);

      var keyArgs = filterArgs(args, func.skipArgs);
      var key = keygen(func.cacheName, keyArgs);
      log('invalidating %s key %s', func.cacheName, key);
      store.expire(key);
    };

    this.isReady = function() {
      return store.isReady();
    };
  },

  debug: require('./debug')
};

module.exports = cache;
