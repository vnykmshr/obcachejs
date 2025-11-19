# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-11-19

### Added
- Promise support for `wrap()` - use async/await without callbacks
- TypeScript type definitions (`index.d.ts`)
- GitHub Actions CI pipeline
- ESLint configuration
- Dependabot for automated dependency updates
- `cache.isReady()` method to check store connection status
- Redis connection timeout configuration (`connectTimeout` option)

### Changed
- **BREAKING**: Minimum Node.js version is now 18
- **BREAKING**: Rebranded from `obcache` to `obcachejs`
- Upgraded `lru-cache` from v2 to v11
- Upgraded `redis` from v3 to v5
- Upgraded `debug` to v4
- Redis `reset()` now returns a Promise
- LRU `expire()` now calls callback asynchronously for consistency
- Updated repository URLs to github.com/vnykmshr/obcachejs

### Fixed
- Race condition in Redis `keycount()` returning stale data
- Redis errors now propagate correctly (removed silent error suppression)
- CacheError now has proper `name` property for stack traces
- Compatibility with modern Node.js versions
- LRU cache API compatibility issues

### Removed
- Support for Node.js < 18
- Silent CacheError suppression (errors now propagate normally)

---

## Migration from v0.x (obcache) to v1.0 (obcachejs)

### Package Name Change
```javascript
// Before
const obcache = require('obcache');

// After
const obcache = require('obcachejs');
```

### Node.js Version
v1.0 requires Node.js 18 or higher.

### Promise Support
Wrapped functions now support async/await:
```javascript
// Callback style (still works)
cached(arg, (err, result) => {});

// Promise style (new)
const result = await cached(arg);
```

### Redis Configuration
```javascript
// New option: connectTimeout (default 5000ms)
const cache = new obcache.Create({
  redis: {
    host: 'localhost',
    port: 6379,
    connectTimeout: 10000  // 10 seconds
  },
  id: 1
});

// Check connection status
if (cache.isReady()) {
  // Redis is connected
}
```

### Error Handling
CacheError instances are no longer silently converted to success. If your code relied on this behavior, update error handling:
```javascript
// Errors now propagate normally
try {
  const result = await cached(arg);
} catch (err) {
  // Handle error
}
```
