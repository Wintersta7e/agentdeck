# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in AgentDeck, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, use [GitHub's private vulnerability reporting](https://github.com/Wintersta7e/agentdeck/security/advisories/new) to submit your report. Include:

1. A description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)

You should receive an acknowledgment within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Scope

The following are in scope for security reports:

- **IPC channel injection** — bypassing contextBridge isolation
- **Command injection** — via terminal input, file paths, or workflow variables
- **Credential exposure** — API keys stored via safeStorage leaking in logs, IPC, or disk
- **Path traversal** — accessing files outside intended WSL project directories
- **Prototype pollution or XSS** — in the renderer process
- **Dependency vulnerabilities** — in production dependencies with a known exploit

## Security Architecture

AgentDeck follows Electron security best practices:

- `contextIsolation: true` — renderer cannot access Node.js APIs
- `nodeIntegration: false` — no `require()` in renderer
- `sandbox: true` — renderer runs in a sandboxed process
- API keys encrypted at rest via Electron `safeStorage`
- PTY spawn environment blocklist prevents injection of `LD_PRELOAD`, `NODE_OPTIONS`, etc.
- IPC handlers validate types and enforce size limits
- Workflow event channels validated against safe ID regex in preload

## Supported Versions

| Version | Supported |
|---------|-----------|
| 4.x     | Yes       |
| < 4.0   | No        |
