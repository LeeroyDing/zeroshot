# Providers

Zeroshot shells out to provider CLIs. It does not store API keys or manage
authentication. Use each CLI's login flow or API key setup.

## Supported Providers

| Provider | CLI         | Install                                    |
| -------- | ----------- | ------------------------------------------ |
| Claude   | Claude Code | `npm install -g @anthropic-ai/claude-code` |
| Codex    | Codex       | `npm install -g @openai/codex`             |
| Gemini   | Gemini      | `npm install -g @google/gemini-cli`        |
| Opencode | Opencode    | See https://opencode.ai                    |
| ACP      | ACP Agent   | `npm install -g <your-acp-agent>`          |

## Selecting a Provider

- List providers: `zeroshot providers`
- Set default: `zeroshot providers set-default <provider>`
- Configure levels: `zeroshot providers setup <provider>`
- Override per run: `zeroshot run ... --provider <provider>`
- Env override: `ZEROSHOT_PROVIDER=codex`

## Model Levels

Zeroshot uses provider-agnostic levels:

- `level1`: cheapest/fastest
- `level2`: default
- `level3`: most capable

Set levels per provider in settings:

```json
{
  "providerSettings": {
    "codex": {
      "minLevel": "level1",
      "maxLevel": "level3",
      "defaultLevel": "level2",
      "levelOverrides": {
        "level1": { "model": "codex-model-main", "reasoningEffort": "low" },
        "level3": { "model": "codex-model-main", "reasoningEffort": "xhigh" }
      }
    }
  }
}
```

Notes:

- `reasoningEffort` applies to Codex and Opencode only.
- `model` is still supported as a provider-specific escape hatch.

## ACP Provider Setup

The ACP provider allows Zeroshot to orchestrate any external agent that speaks the [Agent Client Protocol](https://agentclientprotocol.com).

### Configuration

You must configure the transport and connection details.

**Option A: Local Process (stdio)**
Spawns an agent command directly.

```bash
zeroshot settings set providerSettings.acp '{"transport": "stdio", "command": "npx my-acp-agent"}'
```

**Option B: Remote Server (http)**
Connects to an ACP server via HTTP/SSE.

```bash
zeroshot settings set providerSettings.acp '{"transport": "http", "url": "http://localhost:3000/sse"}'
```

### Usage

```bash
zeroshot run "Task description" --provider acp
```

## Docker Isolation and Credentials

Zeroshot does not inject credentials for non-Claude CLIs. When using
`--docker`, mount your provider config directories explicitly.

Examples:

```bash
# Codex
zeroshot run 123 --docker --mount ~/.config/codex:/home/node/.config/codex:ro

# Gemini (use gemini or gcloud config as needed)
zeroshot run 123 --docker --mount ~/.config/gemini:/home/node/.config/gemini:ro
zeroshot run 123 --docker --mount ~/.config/gcloud:/home/node/.config/gcloud:ro
```

Mount presets in `dockerMounts` include: `codex`, `gemini`, `gcloud`, `claude`, `opencode`.

Use `--no-mounts` to disable all credential mounts (you will get a warning if
credentials are missing).
