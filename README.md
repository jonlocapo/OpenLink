# OpenLink

A GitHub Pages chat UI that runs the [opencode](https://opencode.ai) agent **remotely on GitHub Actions**, so that opencode API traffic originates from GitHub's infrastructure instead of the laptop's network.

Built for a sanctioned network-filter bypass exercise: the laptop has full internet access except that the opencode API endpoints are blocked at the network level (the CLI opens but every query fails to reach the API). OpenLink routes everything through GitHub domains, which are allowed.

```
┌────────────┐   dispatch + poll     ┌──────────────────────────┐
│  Browser    │ ───────────────────▶ │  api.github.com          │
│ (Pages UI)  │   (only GitHub       │  raw.githubusercontent    │
│  laptop     │    domains egress)   │              ▲           │
└────────────┘                       └──────────────┼───────────┘
                                                     │
                                    ┌────────────────┼──────────┐
                                    │  GitHub Actions runner    │
                                    │  (Azure, unfiltered)      │
                                    │  opencode run --model ... │──▶ opencode API
                                    └───────────────────────────┘
```

The laptop never calls the opencode API. The runner does, and commits the reply back to `responses/<session>.md`, which the UI polls.

## What's in this repo

| File | Role |
|---|---|
| `index.html` | The whole frontend: chat UI, model/variant picker, settings, dispatch + polling. Zero dependencies, single file. |
| `.github/workflows/agent.yml` | The relay: installs opencode on the runner, runs the agent headlessly with your Go key, persists the agent's session DB between runs via Actions cache, commits the transcript back. |

**The harness**: opencode's own CLI *is* the agent harness (model calls, tool execution, permissions, session memory). OpenLink does not reimplement any of that — it only transports the prompt in and the transcript out. Session memory is preserved across runs by caching `~/.local/share/opencode` and resuming with `opencode run --session <id>`.

## Setup

1. **Push this repo to GitHub** and add your OpenCode Go key as a repo secret:
   - Get a key at <https://opencode.ai/auth> (OpenCode Go plan).
   - Repo → Settings → Secrets and variables → Actions → New repository secret:
     - Name: `OPENCODE_API_KEY`
     - Value: your key
   - Without the secret the relay still works in **mock mode** (test the transport first).
2. **Enable Pages**: Settings → Pages → Source: "Deploy from a branch" → branch `main`, folder `/` → Save. Site appears at `https://<owner>.github.io/OpenLink/` (public Pages is required for free unlimited Actions minutes).
3. **Create a GitHub token for the UI** at <https://github.com/settings/personal-access-tokens>:
   - Fine-grained: repository access → this repo → `Actions → Workflows: read and write` (fine-grained PATs require you to be a repo member/collaborator).
   - Or classic: `workflow` scope.
4. Open the Pages URL, click **Settings**, paste the token, pick a **model + variant** (all 24 OpenCode Go models are listed), and chat. The token stays in your browser's localStorage and is only sent to `api.github.com`.

## Model picker

All OpenCode Go models from `models.dev` are listed: `gpt-5.6-luna`, `deepseek-v4-pro`, `deepseek-v4-flash`, `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6`, `kimi-k2.5`, `grok-4.5`, `qwen3.8-max`, `qwen3.7-max`, `qwen3.7-plus`, `qwen3.6-plus`, `qwen3.5-plus`, `glm-5.2`, `glm-5.1`, `glm-5`, `minimax-m3`, `minimax-m2.7`, `minimax-m2.5`, `mimo-v2.5-pro`, `mimo-v2.5`, `mimo-v2-pro`, `mimo-v2-omni`, `hy3`.

Variants use opencode's `--variant` flag with OpenAI-style reasoning effort (`minimal`/`low`/`medium`/`high`/`xhigh`); leave on `default` for models that don't expose effort control.

## How it works

1. **Send**: the UI POSTs to `POST /repos/{owner}/{repo}/actions/workflows/agent.yml/dispatches` with inputs `{session_id, message, model, variant}` (65,535-char input limit — far above chat needs).
2. **Run**: a runner checks out the repo, restores the cached opencode session DB for this session, runs `opencode run <message> --model <model> [--variant v] [--session id] --format json` with `OPENCODE_API_KEY` from the secret, filters the `text` events, and appends them to `responses/<session>.md`; the session DB is re-cached and the transcript committed (GITHUB_TOKEN pushes don't retrigger workflows or Pages builds).
3. **Receive**: the UI polls `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/responses/{session}.md` every 3s and renders only the new delta.

## Notes & limits

- **Scope**: use this within the bounds of your competition/engagement. Don't push sensitive data through it — transcripts are committed to the repo (visible publicly if the repo is public).
- **Costs**: public repos get free Actions minutes; each message is one workflow run (~1 min). Cache is capped by GitHub (10 GB/repo); old session entries get evicted.
- **Errors**: if the agent run fails, no transcript update lands and the UI times out — check the Actions tab for logs.
- **Rate limits**: authenticated API calls are 5,000/hr — polling at one request per 3s is fine. Avoid spamming dispatches (content-creation bucket: 500/hr).
- **GitHub ToS**: Actions is meant for software development; a personal agent relay is off-label usage. Keep volume modest.
