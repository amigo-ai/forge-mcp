# Contributing to Forge MCP

Thank you for contributing to `@amigo-ai/forge-tools`.

This repository is an experimental prototype. Public behavior may evolve quickly while the MCP surface is being validated.

## Development Setup

```bash
npm install
```

## Scripts

- `npm run build` compiles TypeScript to `dist/`
- `npm run lint` runs the TypeScript checker in no-emit mode
- `npm test` builds the package and runs the Node test suite
- `npm run dev` runs the compiler in watch mode

## Testing

```bash
npm run lint
npm test
```

Tests live alongside the implementation under `src/`.

## Project Structure

```text
src/
├── api/         # API clients and client pool
├── config/      # constants, logging, credential storage
├── resources/   # MCP resources exposed to clients
├── tools/       # MCP tool registrations and handlers
└── index.ts     # server entry point
```

## Pull Requests

Before opening a PR:

1. Run `npm run lint`
2. Run `npm test`
3. Update README if customer-visible behavior changed
4. Add or update tests when tool behavior changes

## Releases

The `publish.yml` workflow publishes to npm from `main`. If your change affects install, runtime behavior, or public tool contracts, include enough context in the PR description for maintainers to produce clear release notes.
