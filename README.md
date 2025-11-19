# obcachejs

Object caching for Node.js. Wraps async functions and caches results with automatic key generation.

## Features

- LRU in-memory cache with TTL support
- Optional Redis backend for distributed caching
- Request deduplication (prevents thundering herd)
- Promise and callback APIs
- TypeScript definitions included

## Installation

```bash
npm install obcachejs
```

Requires Node.js 18+

## Quick Start

```javascript
const obcache = require('obcachejs');

const cache = new obcache.Create({ max: 1000, maxAge: 60000 });

const getUser = cache.wrap(function(id, callback) {
  // Simulate async database lookup
  setTimeout(() => callback(null, { id, name: 'User ' + id }), 10);
});

// Promise style
const user = await getUser(123);
console.log(user); // { id: 123, name: 'User 123' }

// Callback style
getUser(456, (err, user) => console.log(user));
```

## API

### obcache.Create(options)

Creates a cache instance.

```javascript
const cache = new obcache.Create({
  max: 1000,           // max keys (default: 1000)
  maxAge: 60000,       // TTL in ms
  queueEnabled: true   // deduplicate concurrent requests
});
```

Options:

| Option | Description |
|--------|-------------|
| `max` | Maximum number of cached keys |
| `maxSize` | Maximum cache size in bytes (alternative to max) |
| `maxAge` | Time-to-live in milliseconds |
| `queueEnabled` | Enable request deduplication |
| `dispose` | Function called when entries are evicted |
| `reset.interval` | Auto-reset interval in ms |
| `reset.firstReset` | First reset time (Date or ms) |

### cache.wrap(fn, [thisobj], [skipArgs])

Wraps a callback-based function with caching. The wrapped function:
- Returns a Promise when called without a callback
- Calls the callback when provided as last argument
- Generates cache keys from function name and arguments

```javascript
const cached = cache.wrap(myAsyncFn);

// Exclude arguments from key generation
const cached = cache.wrap(function(id, timestamp, cb) {
  // timestamp won't affect cache key
  cb(null, result);
}, null, [1]);
```

### cache.warmup(fn, ...args, value)

Pre-populate cache for given arguments.

```javascript
cache.warmup(getUser, 123, { id: 123, name: 'Alice' });
```

### cache.invalidate(fn, ...args)

Remove cached entry for given arguments.

```javascript
cache.invalidate(getUser, 123);
```

### cache.isReady()

Returns true when cache backend is ready. Always true for LRU, waits for connection with Redis.

### cache.stats

Cache statistics object.

```javascript
{
  hit: 0,      // cache hits
  miss: 0,     // cache misses
  reset: 0,    // number of resets
  pending: 0   // queued requests
}
```

## Redis Backend

```javascript
const cache = new obcache.Create({
  max: 10000,
  maxAge: 300000,
  id: 1,  // required for Redis
  redis: {
    host: 'localhost',
    port: 6379,
    connectTimeout: 5000
  }
});

// Wait for connection
if (!cache.isReady()) {
  // handle not ready
}
```

Redis options:

| Option | Description |
|--------|-------------|
| `host` | Redis host |
| `port` | Redis port |
| `url` | Connection URL (alternative to host/port) |
| `database` | Redis database number |
| `connectTimeout` | Connection timeout in ms (default: 5000) |
| `twemproxy` | Enable twemproxy compatibility |

## Debug Interface

Register caches for inspection:

```javascript
obcache.debug.register(cache, 'users');

// Express middleware
app.get('/debug/cache', obcache.debug.view);

// Console output
obcache.debug.log();
```

## How It Works

obcachejs generates cache keys by hashing the function name and serialized arguments using sigmund. When a wrapped function is called:

1. Generate key from function name + arguments
2. Check cache for existing value
3. On hit: return cached value
4. On miss: call original function, cache result, return

With `queueEnabled`, concurrent calls with the same key are queued and resolved together, preventing duplicate work.

## TypeScript

Type definitions are included.

```typescript
const obcache = require('obcachejs');
// or with ES modules: import obcache from 'obcachejs';

const cache = new obcache.Create({ max: 100 });
```

Types available: `Cache`, `CacheOptions`, `CacheStats`, `CachedFunction`.

## License

BSD-3-Clause
