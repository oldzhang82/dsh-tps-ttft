# dsh-tps-ttft

Per-turn TPS and TTFT statistics for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): model time, tool time, time-to-first-token (TTFT), and output speed (TPS) per turn.

## What it does

After each turn completes, a **gauge-icon timing pill** appears in the turn tail (showing model time). Click it to open a popover with the full timing statistics:

- **Model time**: Wall-clock time for model inference (step/start → assistant/message)
- **Tool time**: Total time for tool calls (tool/call → tool/result; hidden when no tools ran)
- **TTFT**: Time to first token (step/start → first token)
- **Output speed**: Output speed in tokens/sec (decodeTokens / decodeMs; hidden when no data)

**Fully self-contained**: the plugin ships its own client component (registered to the `conversation.chat.turnTail` slot). **No DSH core changes required** — install and go.

The original "Turn Usage" (token usage) panel is unaffected; the two are independent.

## Installation

Install directly from GitHub (one command, no extra config):

```bash
dsh plugin --profile <your-profile> add "github:oldzhang82/dsh-tps-ttft#<commit-sha>"
```

> **Quote the argument**: in PowerShell, `#` starts a comment, so without quotes the SHA after `#` is dropped.
>
> Use the latest full SHA from the [commits page](https://github.com/oldzhang82/dsh-tps-ttft/commits/main). Pinning the commit prevents later pushes from silently changing what gets installed.

This plugin is pure JS with no build scripts, so the install does not trigger pnpm's allowBuilds prompt — one command and it's done.

After installing, **restart DSH**, run a turn, and the gauge-icon timing pill in the turn tail confirms success.

## How it works

The plugin has two parts, **neither modifies the DSH core**:

1. **Server side** (`index.js`): registers a **session projection** (`perTurnStats`) that performs a pure fold over the session event stream:
   - Listens to `step/start`, `assistant/attempt`, `assistant/message`, `tool/call`, `tool/result`, and `turn/end` events
   - Accumulates model time, tool time, TTFT, and output speed per turn
   - Cleans up per-turn transient state at `turn/end` to keep the view bounded

2. **Client side** (`lib/client.js`): registers a React component to the `conversation.chat.turnTail` slot, reads the `perTurnStats` projection, and renders the timing pill.

## Compatibility

- DSH `>=0.2.0-rc.1 <0.3.0-0` (see `engines.dsh`)

## Dependencies

- `zod` ^4.6.5 (schema validation)

## License

MIT
