'use strict';

var redis = require('redis');
var debug = require('debug')('obcachejs');

var redisStore = {

  init: function(options) {

    var client;
    var prefix;
    var keylen = 0;
    var maxAge = (options && options.maxAge) || 60000;
    var url = options.redis.url;
    var host = options.redis.host || 'localhost';
    var port = options.redis.port || 6379;

    if (!options || isNaN(Number(options.id))) {
      throw new Error('Specify an integer cacheid for persistence across reboots, not ' + options.id);
    }

    var clientOptions = {};

    if (url) {
      clientOptions.url = url;
    } else {
      clientOptions.socket = {
        host: host,
        port: port,
        connectTimeout: options.redis.connectTimeout || 5000
      };
    }

    if (options.redis.database !== undefined) {
      clientOptions.database = options.redis.database;
    } else if (!options.redis.twemproxy) {
      clientOptions.database = options.id;
    }

    client = redis.createClient(clientOptions);

    var connected = false;

    client.on('error', function(err) {
      debug('redis error ' + err);
      connected = false;
    });

    // Connect to Redis (v4 requires explicit connect)
    client.connect().then(function() {
      debug('redis connected');
      connected = true;
      if (!options.redis.twemproxy) {
        client.dbSize().then(function(size) {
          keylen = size;
        }).catch(function(err) {
          debug('dbsize error ' + err);
        });
      }
    }).catch(function(err) {
      debug('redis connect error ' + err);
      connected = false;
    });

    if (options.redis.twemproxy) {
      debug('twemproxy compat mode. stats on keys will not be available.');
    }

    prefix = 'obc:' + options.id + ':';

    var rcache = {
      maxAge: maxAge,
      client: client,

      get: function(key, cb) {
        key = prefix + key;
        client.get(key).then(function(data) {
          var result;
          if (!data) {
            return cb(null);
          }
          try {
            result = JSON.parse(data);
          } catch (e) {
            return cb(e);
          }
          return cb(null, result);
        }).catch(function(err) {
          cb(err);
        });
      },

      set: function(key, val, cb) {
        key = prefix + key;
        try {
          var ttl = Math.floor(this.maxAge / 1000);
          var obj = JSON.stringify(val);

          debug('setting key ' + key + ' in redis with ttl ' + ttl);
          client.setEx(key, ttl, obj).then(function() {
            if (cb) {
              cb(null, val);
            }
          }).catch(function(err) {
            if (cb) {
              cb(err);
            }
          });
        } catch (err) {
          if (cb) {
            cb(err);
          }
        }
      },

      expire: function(key, cb) {
        key = prefix + key;
        client.expire(key, 0).then(function() {
          cb && cb(null);
        }).catch(function(err) {
          cb && cb(err);
        });
      },

      reset: function() {
        if (options.redis.twemproxy) {
          throw new Error('Reset is not possible in twemproxy compat mode');
        }
        return client.flushDb().catch(function(err) {
          debug('flushdb error ' + err);
          throw err;
        });
      },

      size: function() {
        return 0;
      },

      keycount: function() {
        if (options.redis.twemproxy) {
          return -1;
        }
        return keylen;
      },

      isReady: function() {
        return connected;
      }
    };
    return rcache;
  }
};

module.exports = redisStore;
