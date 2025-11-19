'use strict';
/*jslint undef: true */

var sigmund = require('sigmund');
var log = require('debug')('obcachejs');
var util = require('util');

function keygen(name,args) {
  var input = { f: name, a: args };
  return sigmund(input,8);
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


var cache = {
  
  Error: CacheError,

  /**
   * ## cache.Create
   *
   * Constructor
   *
   * Creates a new instance with its own LRU Cache
   *
   * @param {Object} Cache Options
   * ```js
   * {
   *  reset: {
   *    interval: 10000, // msec reset interval
   *    firstReset: 1000, // time for first reset (optional)
   *  },
   *  maxAge: 10000 // lru max age
   *  ...
   * }
   *
   * ```
   *
   **/
  Create: function(options) {
    var nextResetTime;
    var anonFnId = 0;
    var store;

    if (options && options.redis) {
      log('creating a redis cache');
      store = require('./redis').init(options);
    } else {
      store = require('./lru').init(options);
    }

    this.store = store;

    this.pending = options.queueEnabled?{}:false;

    this.stats = { hit: 0, miss: 0, reset: 0, pending: 0};

    if (options && options.reset) {
      nextResetTime = options.reset.firstReset || Date.now() + options.reset.interval;
    }
    /**
    *
    * ## cache.wrap
    *
    * @param {Function} function to be wrapped
    * @param {Object} this object for the function being wrapped. Optional
    * @return {Function} Wrapped function that is cache aware
    *
    * Workhorse
    *
    * Given a function, generates a cache aware version of it.
    * The given function must have a callback as its last argument
    * skipArgs is the array of indexes for which arguments should 
    * be skipped for key generation
    *
    **/
    this.wrap = function (fn, thisobj, skipArgs) {
      var stats = this.stats;
      var fname = (fn.name || '_') + anonFnId++;
      var cachedfunc;
      var pending = this.pending;

      log('wrapping function ' + fname);

      cachedfunc = function() {
        var self = thisobj || this;
        var args = Array.prototype.slice.apply(arguments);
        var lastArg = args[args.length - 1];
        var callback;
        var usePromise = typeof lastArg !== 'function';
        var key, keyArgs;

        if (usePromise) {
          // Promise mode - return a Promise
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

        if (nextResetTime && (nextResetTime < Date.now())) {
          log('resetting cache ' + nextResetTime);
          store.reset();
          stats.reset++;
          nextResetTime += options.reset.interval;
          // we aren't resetting pending here, don't think we need to.
        }

        keyArgs = filterArgs(args, skipArgs);
        key = keygen(fname, keyArgs);

        log('fetching from cache ' + key);
        store.get(key, onget);

        function onget(err, data) {
          var v;

          if (!err && data != undefined) {
            log('cache hit' + key);
            process.nextTick(function() {
              callback.call(self,err,data); // found in cache
            });
            stats.hit++;
            return;
          }

          log('cache miss ' + key);

          if (pending) {
            v = pending[key];
            if (v == undefined) {
              pending[key] = [log];
              stats.pending++;
            } else {
              log('fetch is pending, queuing up for ' + key);
              return v.push(callback);
            }
          }

          // this gets called when the original function returns.
          // we will first save the result in cache, and then 
          // call the callback
          args.push(function(err,res) {
            if (!err) {
              log('saving key ' + key);
              store.set(key,res);
            }

            callback.call(self, err, res);

            // call any remaining callbacks

            if (pending) {
              v = pending[key];
              if ( v != undefined && v.length) {
                log('fetch completed, processing queue for ' + key);
                // by doing this in next tick, we are just ensuring correctness of pending stats,
                // else the callback will see incorrect value of pending.
                // this also ensures that the callbacks are called in the correct order, with the 
                // first caller getting the value first instead of last.
                process.nextTick(function() {
                  v.forEach(function(x) { x.call(self,err,res); });
                });
                log('pending queue cleared for ' + key);
                stats.pending--;
                delete pending[key];
              }
            }
          });

          fn.apply(self,args);
          stats.miss++;
        }

      };
      log('created new cache function with name ' + fname + JSON.stringify(options));
      cachedfunc.cacheName = fname;
      return cachedfunc;
    };


    /* first argument is the function, last is the value */
    this.warmup = function(skipArgs) {
      var args = Array.prototype.slice.apply(arguments);
      var func = args.shift();
      var res = args.pop();
      var fname,key,keyArgs;

      if (!func || typeof(func) != 'function' || !func.cacheName) {
        throw new Error('Not an obcachejs function');
      }

      keyArgs = filterArgs(args, skipArgs);
      fname = func.cacheName;
      key = keygen(fname, keyArgs);
      log('warming up cache for ' + fname + ' with key ' + key);
      store.set(key, res);
    };

    this.invalidate = function(skipArgs) {
      var args = Array.prototype.slice.apply(arguments);
      var func = args.shift();
      var fname, key, keyArgs;

      if (!func || typeof(func) != 'function' || !func.cacheName) {
        throw new Error('Not an obcachejs function');
      }

      keyArgs = filterArgs(args, skipArgs);
      fname = func.cacheName;
      key = keygen(fname, keyArgs);
      log('invalidating cache for ' + fname + ' with key ' + key);
      store.expire(key);
    };

    this.isReady = function() {
      return store.isReady();
    };

  },

  debug: require('./debug')
};

module.exports = cache;
