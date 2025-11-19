# obcachejs

Object caching module for Node.js. Wraps async functions and caches their results with automatic key generation.

## Features

- LRU in-memory cache with TTL
- Optional Redis persistence
- Request deduplication (prevents thundering herd)
- Promise and callback support
- TypeScript definitions included

## Installation

```bash
npm install obcachejs
```

Requires Node.js 18+

## Usage

### Basic (async/await)

```javascript
const obcache = require('obcachejs');

const cache = new obcache.Create({ max: 1000, maxAge: 60000 });

// Wrap an async function
async function fetchUser(id) {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}

const cachedFetch = cache.wrap(async (id, callback) => {
  try {
    const user = await fetchUser(id);
    callback(null, user);
  } catch (err) {
    callback(err);
  }
});

// Use with async/await
const user = await cachedFetch(123);

// Or with callbacks
cachedFetch(123, (err, user) => {
  console.log(user);
});
```

### With Redis

```javascript
const cache = new obcache.Create({
  max: 10000,
  maxAge: 300000,
  id: 1, // required for Redis
  redis: {
    host: 'localhost',
    port: 6379
  }
});
```

## API

### obcache.Create(options)

Creates a new cache instance.

**Options:**
- `max` - Maximum number of keys (default: 1000)
- `maxSize` - Maximum cache size in bytes (alternative to max)
- `maxAge` - TTL in milliseconds
- `queueEnabled` - Enable request deduplication
- `redis` - Redis configuration `{ host, port, url, database }`
- `id` - Cache ID (required for Redis)

### cache.wrap(fn, [thisobj], [skipArgs])

Wraps a function with caching. Returns a cached version that:
- Returns a Promise when called without callback
- Uses callback when provided as last argument

```javascript
const cached = cache.wrap(myFunction);

// Promise style
const result = await cached(arg1, arg2);

// Callback style
cached(arg1, arg2, (err, result) => {});
```

**skipArgs** - Array of argument indices to exclude from cache key generation.

### cache.warmup(fn, ...args, value)

Pre-populate cache with a known value.

```javascript
cache.warmup(cachedFetch, 123, { id: 123, name: 'cached' });
```

### cache.invalidate(fn, ...args)

Remove cached value for given arguments.

```javascript
cache.invalidate(cachedFetch, 123);
```

### cache.stats

Object with cache statistics: `{ hit, miss, reset, pending }`

### obcache.debug

Debug interface for cache inspection.

```javascript
obcache.debug.register(cache, 'myCache');

// Express middleware
app.get('/cache-debug', obcache.debug.view);
```

## License

BSD-3-Clause
