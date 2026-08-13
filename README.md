# OpenLink

A GitHub Pages web app that runs a **full opencode agent instance** on GitHub Actions, so opencode API traffic originates from GitHub's infrastructure instead of the laptop's network.

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
                                    │  clones target repo       │
                                    │  opencode run --auto      │──▶ opencode API
                                    │  snapshots workspace      │
                                    └───────────────────────────┘
```

The laptop never calls the opencode API. The runner does.

## What "full instance" means here

- **Real opencode harness**: the agent loop, model calls, tool execution and permission handling are all opencode's own (`opencode run --auto`). OpenLink only transports prompts in and events out.
- **Persistent agent memory**: the runner caches `~/.local/share/opencode` (session DB) between runs and resumes with `opencode run --session <id>`, so the agent keeps conversation and tool state across turns.
- **A real workspace, two ways**:
  - **Linked local folder** (Chrome/Edge/Firefox): pick a folder on the laptop; it's packed, uploaded before each turn, the agent works on it on the runner, and the changed files are written **back into the local folder** when the turn completes. No repo needed.
  - **GitHub repo**: set `owner/repo[@branch]`; it's cloned on the runner, the agent edits it, and the result is snapshotted to the relay repo's `workspace/<session>` branch — browseable on GitHub.
- **Live event stream**: the runner appends the raw NDJSON event stream (`sessions/<session>.ndjson`) to the repo; the UI renders message parts and tool activity live as they land.
- **Model + variant picker**: all 24 OpenCode Go models with reasoning-effort variants.

## What's in this repo

| File | Role |
|---|---|
| `index.html` | The whole frontend: chat UI, model/variant picker, target-repo picker, settings (PAT + API key), dispatch + polling. Zero dependencies, single file. |
| `.github/workflows/relay.yml` | The relay: installs opencode, restores session state, clones the target repo, runs the agent headlessly, appends the event stream, snapshots the workspace, commits the transcript. |

## Setup

1. **Push this repo to GitHub** and (recommended) add your OpenCode Go key as a repo secret:
   - Get a key at <https://opencode.ai/auth> (OpenCode Go plan).
   - Repo → Settings → Secrets and variables → Actions → New repository secret: name `OPENCODE_API_KEY`, value = your key.
   - Alternatively paste the key in the UI's Settings — but a key sent as a workflow input is **visible on the public Actions run page**, so prefer the secret unless the repo is private.
   - Without a key the relay runs in **mock mode** (test the transport first).
2. **Enable Pages**: Settings → Pages → Source: "Deploy from a branch" → branch `main`, folder `/` → Save. Site appears at `https://<owner>.github.io/OpenLink/` (public Pages = free unlimited Actions minutes).
3. **Create a GitHub token for the UI** at <https://github.com/settings/personal-access-tokens>:
   - Fine-grained: repository access → this repo → `Actions → Workflows: read and write` and `Contents → Read and write` (Contents is needed for folder linking).
   - Or classic: `workflow` + `repo` scopes.
4. Open the Pages URL → **Settings** → paste the PAT. Then pick your workspace:
   - **Link a local folder** via the `folder:` chip (Chrome/Edge/Firefox; skips `.git`, `node_modules`, `dist`, `build`; 5 MB/file and 20 MB total caps). The folder is synced both ways each turn.
   - Or set a **target repository** (`owner/repo` or `owner/repo@branch`, public repos; empty = work inside the relay repo).
   - Pick a **model + variant**, then chat.

## How a turn works

1. **Send**: (with a linked folder) the UI packs the folder into `{"files":[{path, content(base64)}]}` and PUTs it to `uploads/<session>/workspace.json`, then POSTs `POST /repos/{owner}/{repo}/actions/workflows/relay.yml/dispatches` with inputs `{session_id, message, model, variant, repo_spec, workspace_upload, api_key}`.
2. **Run**: a runner restores the cached opencode session DB, prepares the workspace (unpack the folder upload, or clone the target repo overlaying the previous `workspace/<session>` snapshot), then runs `opencode run <message> --model <model> [--variant v] [--session id] --dir <workspace> --auto --format json` with the Go key from the secret (or the input).
3. **Persist**: the NDJSON event stream is appended to `sessions/<session>.ndjson`, the session DB is re-cached, and the workspace is persisted back (re-packed into `uploads/<session>/workspace.json`, or committed to the `workspace/<session>` branch), plus the plain transcript appended to `responses/<session>.md`.
4. **Receive**: the UI polls the NDJSON (fallback: the `.md` transcript) every 3s and renders only new events: assistant text per message, plus dim `[tool]` activity lines. With a linked folder, the runner's re-packed workspace is then written back into the local folder.

## Notes & limits

- **Scope**: use this within the bounds of your competition/engagement. Don't push sensitive data through it — transcripts and event streams are committed to the repo (visible publicly if the repo is public). The API-key input is likewise visible on the run page.
- **Workspace edits** are snapshotted to the relay repo, not pushed back to the target repo (that would need a PAT with write access to it — possible extension).
- **Switching target repos mid-session**: opencode sessions are scoped to a project directory; start a new session when you change `owner/repo@branch`.
- **Costs**: public repos get free Actions minutes; each turn is one workflow run (~1 min, longer when the agent uses tools). Run timeouts: 15 min per turn; the UI polls up to 6 min.
- **Errors**: if the agent run fails, nothing lands and the UI times out — check the Actions tab for logs.
- **Rate limits**: authenticated API calls are 5,000/hr; polling once per 3s is fine; avoid spamming dispatches (content-creation bucket: 500/hr).
- **GitHub ToS**: Actions is meant for software development; a personal agent relay is off-label usage. Keep volume modest.
- **Full TUI parity** (the terminal UI itself) can't run on a static Pages site — runners can't accept inbound connections. The GitHub-native alternative is Codespaces (opencode in a cloud terminal on GitHub domains).
