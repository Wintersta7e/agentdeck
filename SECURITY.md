# Security Policy

## Status

AgentDeck is archived (October 2026) and receives no fixes, including security
fixes. No version is supported, and vulnerability reports are not acted on. The
known issues in the last release, v7.2.0, are listed at the top of the
[README](./README.md).

## Security Architecture

The last release follows these Electron security practices:

- `contextIsolation: true` — renderer cannot access Node.js APIs
- `nodeIntegration: false` — no `require()` in renderer
- `sandbox: true` — renderer runs in a sandboxed process
- Secrets encrypted via Electron `safeStorage` where the OS provides it (always on
  Windows); on Linux without a keyring, project environment variables are stored
  as plain text
- PTY spawn environment blocklist prevents injection of `LD_PRELOAD`, `NODE_OPTIONS`, etc.
- IPC handlers validate types and enforce size limits
- Workflow event channels validated against safe ID regex in preload

## Supported Versions

| Version | Supported |
|---------|-----------|
| all     | No        |
