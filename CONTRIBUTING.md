# Contributing to AgentDeck

Thanks for your interest in contributing to AgentDeck!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies:
   ```bash
   npm install --no-bin-links
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

## Prerequisites

- Windows 10/11 with WSL2 (Ubuntu recommended)
- Node.js 22+
- At least one AI coding agent installed in WSL

## Code Standards

- **TypeScript strict mode** — all source files are `.ts`/`.tsx`
- **ESLint** — zero-warning policy (`npm run lint`)
- **Prettier** — consistent formatting (`npm run format`)
- **Vitest** — tests run with `npm test`

## Before Submitting a PR

1. Run the full lint check: `npm run lint`
2. Run all tests: `npm test`
3. Run the type checker: `npm run typecheck`
4. Ensure zero warnings and all tests pass

## Commit Messages

- Use imperative mood ("Add feature" not "Added feature")
- Keep the first line under 72 characters
- Reference issues where applicable

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure all checks pass (lint, tests, typecheck)
4. Open a PR against `main` with a clear description of what and why

## Architecture

See the [User Guide](./docs/USER-GUIDE.md) for feature documentation.

Key constraints:

- `node-pty` runs in the main process only (native bindings)
- Context isolation is always on (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`)
- All IPC goes through `contextBridge` — renderer never imports Node modules
- WSL paths only for project paths
- All colors come from CSS custom properties in `tokens.css` — never hardcode colors

## Reporting Issues

- Use [GitHub Issues](../../issues) for bugs and feature requests
- Include steps to reproduce for bugs
- Check existing issues before creating new ones

## Security

See [SECURITY.md](./SECURITY.md) for reporting security vulnerabilities.
