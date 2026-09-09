# Entire

This repo is wired into [Entire](https://entire.io) for session tracking, checkpointing, multi-agent review, and repository mirroring. Entire does **not** manage branches or pull requests; use `gh` and `git` for that.

## Setup

Entire is enabled in `.entire/settings.json`:

```json
{
  "enabled": true,
  "checkpoints": {
    "primary": {
      "type": "git-refs"
    }
  }
}
```

- GitHub App is installed for `shlomokabareti/convex-better-auth-2.0`.
- Repo is mirrored to `entire://aws-us-east-2.entire.io/gh/shlomokabareti/convex-better-auth-2.0`.
- Agent hooks are configured for Claude Code and Codex (Cursor passively discovers `entire agent-help`).

## Commands we use

### Session and checkpoint tracking

- `entire session list` — list tracked sessions.
- `entire session get <id>` — inspect a session.
- `entire checkpoint` — inspect git-based checkpoints.
- `entire dispatch` — generate a dispatch summary of recent work.
- `entire recap` — summarize recent checkpoint activity.
- `entire activity` — view activity overview.

### Multi-agent labs

Run from `package.json` or directly:

- `entire review` — multi-agent branch review with a judge.
- `entire investigate` — deep-dive on a topic or seed doc.
- `entire why` — show why a line exists.
- `entire blame` — show which lines came from Entire checkpoints.
- `entire experts` — show agent/skill provenance for files.
- `entire tokens` — token usage diagnostics.
- `entire tokens profile` — aggregate token usage across checkpoints.
- `entire session tokens` — token usage for a session.

### Repository and project

- `entire repo list` — list Entire repositories.
- `entire project list` — list Entire projects.
- `entire mirror` — manage GitHub mirror placements.
- `entire status` — show local Entire status.
- `entire doctor` — diagnose session issues.

### Import

- `entire import claude-code` — import Claude Code transcripts as local, read-only history.

## Scripts

`package.json` exposes the most useful lab commands as pnpm scripts:

```bash
pnpm run entire:review
pnpm run entire:investigate
pnpm run entire:why
pnpm run entire:blame
pnpm run entire:experts
pnpm run entire:tokens
pnpm run entire:tokens:profile
```
