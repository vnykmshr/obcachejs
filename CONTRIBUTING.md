# Contributing

## Development

```bash
git clone https://github.com/vnykmshr/obcachejs.git
cd obcachejs
npm install
```

## Running Tests

```bash
npm test
```

## Linting

```bash
npm run lint
```

## Pull Requests

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run `npm test` and `npm run lint`
5. Submit PR against `master`

Keep changes focused and minimal. One feature or fix per PR.

## Code Style

- Use `'use strict'`
- Prefer callbacks over Promises in core code (Promise wrapper is in wrap())
- Use `var` for consistency with existing code
- Run ESLint before committing
