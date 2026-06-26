# aem-ams-mcp — AEM MCP Server (fork)

[![AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Fork of easingthemes/aem-mcp-server](https://img.shields.io/badge/fork%20of-easingthemes%2Faem--mcp--server-blue.svg)](https://github.com/easingthemes/aem-mcp-server)

> **🍴 This is a fork of [easingthemes/aem-mcp-server](https://github.com/easingthemes/aem-mcp-server).**
> It adds an LLM-driven **content-review** workflow and a **Figma → AEM design-token** pipeline
> (7 tools + 3 governance resources) on top of the upstream tools, targeting **AEM AMS 6.5 LTS**.
> All upstream functionality is preserved — no upstream tools were removed or modified.
>
> Fork modifications by Alessio Galletti, June 2026, distributed under the upstream **AGPL-3.0-only**
> license (see [LICENSE](LICENSE)). The upstream documentation below is retained as-is; the
> fork-specific additions are documented under
> [Content Review & Design Tokens](#content-review--design-tokens). Upstream npm-package and CI
> badges have been removed because they reflect the upstream project, not this fork.

AEM MCP Server is a full-featured Model Context Protocol (MCP) server for Adobe Experience Manager (AEM). 
It provides a simple integration with any AI Agent.
This project is designed for non-technical persons who want to manage AEM via natural language.

---

## Overview

- **Manage your AEM instance with natural language** — content, components, assets, workflows
- **Works with any MCP-compatible client:**
  - **AI IDEs** — Cursor, VS Code + Copilot, Windsurf, Cline, JetBrains AI Assistant, Zed
  - **CLI agents** — Claude Code, GitHub Copilot CLI, Gemini CLI, Amazon Q CLI
  - **Chat & desktop apps** — Claude Desktop, ChatGPT Desktop, Goose
- **Supports both AEMaaCS and self-hosted AEM instances**
- **Two transport modes** — stdio via `npx` (recommended, zero install) and streamable HTTP

---

## Quick Start

### Prerequisites
- Node.js 20.19.0+ || 22.12.0+ || 23+
- Access to an AEM instance (local or remote)

> **⚠️ Running this fork:** This fork is **not published to npm**. The `npx aem-mcp-server` and
> `npm install -g aem-mcp-server` commands shown below install the **upstream** package, which does
> **not** include the content-review / design-token additions. To run *this* fork, build from source
> and point your MCP client at the local entry point:
>
> ```sh
> git clone https://github.com/Alessio-G/aem-ams-mcp.git && cd aem-ams-mcp
> npm install && npm run build
> ```
>
> Then in your MCP config use the local build instead of the `npx` form:
>
> ```json
> {
>   "mcpServers": {
>     "AEM": {
>       "command": "node",
>       "args": ["/abs/path/to/aem-ams-mcp/dist/cli.js", "-t", "stdio", "-H", "http://localhost:4502", "-u", "admin", "-p", "admin"]
>     }
>   }
> }
> ```
>
> Set `ANTHROPIC_API_KEY` (and the Figma / AEM token-path vars) in the environment for the
> content-review and design-token tools — see [Content Review & Design Tokens](#content-review--design-tokens).

### Stdio Transport (recommended)

No installation needed — the AI agent downloads and spawns the process automatically via `npx`.

Add to your project's MCP config (`.mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, etc.):

```json
{
  "mcpServers": {
    "AEM": {
      "command": "npx",
      "args": ["-y", "aem-mcp-server", "-t", "stdio", "-H", "http://localhost:4502", "-u", "admin", "-p", "admin"]
    }
  }
}
```

> **Secrets:** Since MCP config files are typically committed to the repo, avoid hardcoding credentials. Use your client's env var syntax instead:
>
> | Client | Syntax |
> |---|---|
> | Claude Code (`.mcp.json`) | `${AEM_PASSWORD}` or `${AEM_PASSWORD:-admin}` |
> | VS Code / Copilot | `${input:aem-password}` (prompts securely) or `envFile` |
> | Cursor | `${env:AEM_PASSWORD}` |
>
> Example with env var references (Claude Code):
> ```json
> {
>   "mcpServers": {
>     "AEM": {
>       "command": "npx",
>       "args": ["-y", "aem-mcp-server", "-t", "stdio", "-H", "${AEM_HOST:-http://localhost:4502}", "-u", "${AEM_USER:-admin}", "-p", "${AEM_PASSWORD:-admin}"]
>     }
>   }
> }
> ```

### Streamable HTTP Transport (alternative)

For scenarios where you need a persistent server (shared team server, multiple clients connecting simultaneously, etc.), install globally and start the server manually:

```sh
npm install aem-mcp-server -g
aem-mcp -H=http://localhost:4502 -u=admin -p=admin
```

Then point your AI agent to the URL:

```json
{
  "mcpServers": {
    "AEM": {
      "url": "http://127.0.0.1:8502/mcp"
    }
  }
}
```

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=AEM&config=eyJ1cmwiOiJodHRwOi8vMTI3LjAuMC4xOjg1MDIvbWNwIn0%3D)

### Configuration

```
Options:
      --version    Show version number                                 [boolean]
  -H, --host                         [string] [default: "http://localhost:4502"]
  -u, --user                                         [string] [default: "admin"]
  -p, --pass                                         [string] [default: "admin"]
  -i, --id         clientId                               [string] [default: ""]
  -s, --secret     clientSecret                           [string] [default: ""]
  -m, --mcpPort                                         [number] [default: 8502]
  -t, --transport  Transport mode: http (default) or stdio
                           [string] [choices: "http", "stdio"] [default: "http"]
  -I, --instances  Named AEM instances: "local:http://localhost:4502:admin:admin
                   ,qa:https://qa.example.com:user:pass"  [string] [default: ""]
  -h, --help       Show help                                           [boolean]
```

**Authentication:**
- For **AEMaaCS**, use `clientId` and `clientSecret` for OAuth S2S authentication. [More info](https://developer.adobe.com/developer-console/docs/guides/authentication/ServerToServerAuthentication/implementation).
- For **self-hosted AEM**, use `user`/`pass`. Default credentials are `admin:admin`.

**Multi-instance:** Connect to multiple AEM instances simultaneously:
```sh
aem-mcp --instances "author:http://localhost:4502:admin:admin,publish:http://localhost:4503:admin:admin"
```
All tools will get an `instance` parameter to target a specific instance.

---

## Features

- **58 MCP Tools** — the upstream tools (pages, components, assets, workflows, content fragments, experience fragments) **plus 7 added by this fork** for content review and design tokens (see [Content Review & Design Tokens](#content-review--design-tokens))
- **MCP Resources** — agents discover components, sites, templates, and workflow models upfront via `resources/list`, eliminating discovery roundtrips
- **Tool Annotations** — every tool tagged with `group`, `readOnly`, and `complexity` so agents can make smarter tool selection decisions
- **Response Verbosity** — `verbosity` parameter (`summary`/`standard`/`full`) on content-reading tools strips JCR internals and truncates long text
- **Actionable Errors** — error responses include `suggestion` and `alternatives` fields for self-healing agent workflows
- **Component Operations**: Update, scan, add, convert, and bulk-manage AEM components (including Experience Fragments)
- **Content & Experience Fragments**: Full CRUD + variation management for both CF and XF, plus server-side JSON-string field merging (`manageContentFragment` action `mergeJsonField`) for CFs that store a whole key→value map inside one JSON-encoded field
- **Advanced Search**: QueryBuilder, fulltext, fuzzy, and enhanced page search
- **Replication & Workflows**: Publish/unpublish content, start/advance/delegate workflow stages
- **Text & Image Extraction**: Extract all text and images from pages, including fragments
- **Template & Structure Discovery**: List templates, analyze page/component structure
- **Multi-instance**: Connect to multiple AEM instances simultaneously; tools and resources are instance-aware
- **Security**: Basic auth and OAuth S2S, environment-based config, safe operation defaults

---

## Usage

Once configured in your AI IDE, just ask in natural language:

```
List all components on MyPage
```

### Merging into a JSON-string field

Some Content Fragments store an entire key→value map inside a single field as a JSON-encoded
string. To upsert a few keys without round-tripping the whole blob, use the `mergeJsonField`
action — the read-merge-write happens server-side:

```jsonc
{
  "action": "mergeJsonField",
  "fragmentPath": "/content/dam/<site>/.../labels",
  "field": "CFMValue",                 // the field holding the JSON string
  "jsonPointer": "/0/content/0/value", // RFC-6901 pointer to the object to merge into ("" = field root)
  "merge": { "search": "Search", "clear_search": "Clear search" },
  "variation": "master"                // default: master
}
```

New keys are added, existing keys overwritten (deep-merge), and untouched keys preserved. The
response reports the keys added/overwritten and the before/after key count at the pointer.

## MCP Resources

The server exposes read-only MCP resources so agents can discover AEM catalogs without tool calls:

| Resource URI | Description |
|---|---|
| `aem://{instance}/components` | All components (name, resourceType, title, group) |
| `aem://{instance}/sites` | Site roots and language structure under /content |
| `aem://{instance}/templates` | Available page templates (path, title) |
| `aem://{instance}/workflow-models` | Workflow models (ID, title, description) |

Resources return summary data only. In multi-instance mode, each instance gets its own set of resource URIs.

## Content Review & Design Tokens

This fork adds an LLM-driven **content review** workflow (review AEM content against governance
rulesets with Claude, then apply fixes) and a **design-token** sync pipeline (pull tokens from
Figma, render CSS custom properties, diff against and write the AEM tokens clientlib). These build
on the existing authenticated AEM client — they reuse the same `--host` / `--user` / `--pass` /
`--id` / `--secret` configuration and add a few extra environment variables.

### Additional environment variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | API key for the content-review LLM calls (`runContentReview`). |
| `FIGMA_ACCESS_TOKEN` | Figma personal access token (scope `file_variables:read`) for `fetchDesignTokens` with `source=figma`. |
| `FIGMA_FILE_KEY` | Figma file key to pull variables from. |
| `AEM_TOKENS_CLIENTLIB_PATH` | JCR path to the tokens clientlib CSS file, e.g. `/apps/myproject/clientlibs/tokens/css/tokens.css`. Used by `diffTokens` and `writeTokensToClientlib`. |
| `AEM_GOVERNANCE_PATH` | JCR path where the ruleset JSON files live, e.g. `/conf/myproject/governance`. |

The content-review model is pinned to `claude-haiku-4-5-20251001` (fast and cheap for review).

### Tools

| Tool | Description |
|---|---|
| `getReviewableContent` | Fetch a page (`.infinity.json`) or content fragment (Assets HTTP API) and return a clean, flattened representation (`{ path, type, title, fields, rawText }`) — JCR/CQ/Sling internals stripped (except `jcr:title`/`jcr:description`). |
| `runContentReview` | Review the content against a named ruleset (`brand-voice`, `seo`, `token-compliance`, or `all`) using Claude. Returns `{ score, findings[], summary }`; an unparseable LLM response is reported as an error finding rather than throwing. |
| `applyReviewSuggestion` | Apply a single suggestion back to AEM. Pages → Sling POST servlet; content fragments → Assets HTTP API. Supports `dryRun`. |
| `fetchDesignTokens` | Fetch design tokens from the Figma Variables API (one-level alias resolution) or a local JSON file → `{ source, count, tokens[] }`. |
| `transformTokensToCss` | Pure transform: token array → CSS custom properties string (kebab-cased names, configurable `prefix`/`scope`). No AEM or Figma calls. |
| `diffTokens` | Diff an incoming CSS string against the current AEM tokens clientlib → `{ added, removed, changed, unchanged }` (a 404 on the clientlib is treated as empty). |
| `writeTokensToClientlib` | Write a CSS string to the tokens clientlib via the Sling POST servlet. Supports `dryRun` and `createIfMissing`. |

### Governance resources

Three additional read-only MCP resources expose the governance rulesets (instance-independent —
they read from `${AEM_GOVERNANCE_PATH}/<file>.json` via the default instance). A missing node
returns an empty object `{}` with a logged warning rather than an error.

| Resource URI | Source file |
|---|---|
| `aem://governance/brand-voice` | `${AEM_GOVERNANCE_PATH}/brand-voice.json` |
| `aem://governance/seo-rules` | `${AEM_GOVERNANCE_PATH}/seo-rules.json` |
| `aem://governance/token-compliance` | `${AEM_GOVERNANCE_PATH}/token-compliance.json` |

### Path safety

Every tool parameter that accepts a JCR path is validated by a shared `validateJcrPath` utility
(`src/utils/jcr-path.ts`): paths containing `..` are rejected, and paths must start with
`/content`, `/conf`, or `/apps/myproject`.

### Tests

The content-review and design-token tools have a dedicated Jest suite under `src/__tests__/`
(separate from the upstream `node --test` suite). Run it with:

```sh
npm run test:jest
```

## API Documentation

For detailed API documentation, please refer to the [API Docs](docs/API.md).

## Similar Projects

1. https://github.com/easingthemes/aem-mcp-server (Used as a base for this project)
1. https://github.com/indrasishbanerjee/aem-mcp-server (Used as a base for #1)
1. https://www.npmjs.com/package/@myea/aem-mcp-handler (Looks like an original source of #2)
