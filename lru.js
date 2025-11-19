'use strict';

var LRUCache = require('lru-cache').LRUCache;

var lru = {

  init: function(options) {

    var cache, store;
    var lruOptions = {};

    if (options.maxSize) {
      lruOptions.sizeCalculation = function(v) {
        return JSON.stringify(v).length;
      };
      lruOptions.maxSize = options.maxSize;
    } else {
      lruOptions.max = options.max || 1000;
    }

    if (options.maxAge) {
      lruOptions.ttl = options.maxAge;
    }

    if (options.dispose) {
      lruOptions.dispose = options.dispose;
    }

    cache = new LRUCache(lruOptions);

    store = {

      lru: cache,

      get: function(key, cb) {
        var data = cache.get(key);
        cb(null, data);
      },

      set: function(key, val, cb) {
        cache.set(key, val);
        if (cb) {
          cb(null, val);
        }
      },

      expire: function(key, cb) {
        cache.delete(key);
        if (cb) {
          process.nextTick(function() { cb(null); });
        }
      },

      reset: function() {
        cache.clear();
      },

      size: function() {
        return cache.size;
      },

      keycount: function() {
        return cache.size;
      },

      values: function() {
        return Array.from(cache.values());
      },

      isReady: function() {
        return true;
      }
    };

    return store;
  }

};

module.exports = lru;
