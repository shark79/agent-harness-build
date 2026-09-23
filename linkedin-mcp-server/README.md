# linkedin-social-publisher (MCP server)

A local-only MCP server implementing a safe, human-in-the-loop LinkedIn publishing workflow:

**Create LinkedIn draft &rarr; show draft to human &rarr; human approves the exact version &rarr; publish to LinkedIn &rarr; return post ID and URL.**

This is one component of the `agent-harness-build` repo. It is not a public/hosted service - it runs on `127.0.0.1:8810`, for a single local operator, alongside the sibling `tools/openai-image-mcp` server (a different port, same "local MCP server wired into TrueForge" pattern).

## Prerequisites

- Node.js **>= 22.14**. Check with `node --version`; if the version on `PATH` is older, use a newer one, e.g. this machine also has one at `/opt/homebrew/opt/node/bin/node`.
- A LinkedIn Developer account and a LinkedIn Developer App (see below).
- macOS/Linux shell with `openssl` (for generating the encryption key).

## 1. Create a LinkedIn developer app

1. Go to https://www.linkedin.com/developers/apps and create a new app (you'll need an associated LinkedIn Company Page - you can create a minimal one if you don't have one already).
2. Under **Products**, request/add:
   - **Sign In with LinkedIn using OpenID Connect**
   - **Share on LinkedIn**
3. Under **Auth**, add this exact redirect URL:
   ```
   http://localhost:8810/oauth/linkedin/callback
   ```
4. Copy the **Client ID** and **Client Secret** from the Auth tab - you'll need them below.
5. Find LinkedIn's current API version (format `YYYYMM`) from their versioning docs (`https://learn.microsoft.com/en-us/linkedin/marketing/versioning`) - this is deliberately not defaulted in this project; pick a currently-supported version yourself.

## 2. Environment setup

```bash
cd mcp-server
cp .env.example .env
```

Generate a secure encryption key (32 bytes, base64-encoded - the format `TOKEN_ENCRYPTION_KEY` expects):

```bash
openssl rand -base64 32
```

Fill in `.env`:

```dotenv
SOCIAL_MCP_HOST=127.0.0.1
SOCIAL_MCP_PORT=8810
SOCIAL_MCP_PUBLIC_URL=http://localhost:8810
LINKEDIN_CLIENT_ID=<from LinkedIn developer app>
LINKEDIN_CLIENT_SECRET=<from LinkedIn developer app>
LINKEDIN_REDIRECT_URI=http://localhost:8810/oauth/linkedin/callback
LINKEDIN_VERSION=<YYYYMM, current version you looked up>
TOKEN_ENCRYPTION_KEY=<output of openssl rand -base64 32>
SOCIAL_DATABASE_PATH=./data/social-publisher.sqlite
```

The server validates all of these on startup and refuses to boot with a clear, single-line error message (not a stack trace) if anything's missing or malformed - e.g. `LINKEDIN_VERSION` must be exactly 6 digits, `TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes.

## 3. Install and build

```bash
npm install
npm run build
```

## 4. Start the server

```bash
npm start          # runs the build in dist/
# or, for development with auto-reload:
npm run dev
```

You should see:

```
LinkedIn social publisher MCP server listening on http://127.0.0.1:8810
MCP endpoint:   http://127.0.0.1:8810/mcp
OAuth start:    http://127.0.0.1:8810/oauth/linkedin/start
```

## 5. Complete the OAuth connection

Open `http://localhost:8810/oauth/linkedin/start` in a browser. You'll be redirected to LinkedIn, asked to authorize `openid profile w_member_social`, then redirected back to a page that says "LinkedIn connected successfully." Your token is encrypted (AES-256-GCM) and stored in the local SQLite database - it is never rendered on that page or returned by any tool/endpoint.

Check status any time:

```bash
curl http://localhost:8810/oauth/linkedin/status
```

To disconnect (local record only - see "Security warnings" below):

```bash
curl -X POST http://localhost:8810/oauth/linkedin/disconnect
```

## 6. Adding the connector to TrueForge

For the agent's system instructions, use the repository-level policy in
`../LINKEDIN_AGENT_SYSTEM_INSTRUCTIONS.md`. It enforces the draft → review →
approval → publish workflow and documents image attachment handling.

Mirroring this repo's existing `tools/openai-image-mcp` pattern (see the root `TRUEFORGE_SETUP.md`):

Add that URL in TrueForge Settings &rarr; Connectors as `linkedin-social-publisher`, pointing at `http://127.0.0.1:8810/mcp`, with **no connector authentication**, then attach it to the agent.

| Field | Value |
|---|---|
| Name | `linkedin-social-publisher` |
| URL | `http://127.0.0.1:8810/mcp` |
| Auth type | `None` |

**Why "None" is correct here** (same reasoning as the existing `openai-image-generator` tool): this MCP server is a local process on `127.0.0.1`, reachable only from this machine. It holds its own LinkedIn credentials (client secret, encrypted access token) server-side and never accepts or forwards caller-supplied credentials - there's nothing for a connector-level auth scheme to protect that isn't already protected by the process being local-only. Do not bind this server to `0.0.0.0` or expose it beyond localhost without adding real authentication first.

## 7. Testing draft creation

Through your MCP client (or `curl` against `/mcp` with a JSON-RPC `tools/call` body), call `create_linkedin_draft`:

```json
{ "text": "Excited to share our launch!" }
```

This requires an existing connection (step 5) and returns the full draft (status `awaiting_review`). It never publishes.

## 8. Testing approval

Call `approve_linkedin_draft` with the draft's `id`, its current `version`, an `approvedBy` identifier, and `confirmation` set to exactly `APPROVE_LINKEDIN_POST`. This pins the draft's exact text/media by SHA-256 hash and sets status `approved`. It never publishes.

## 9. Performing the first controlled real publication

**Do NOT do this automatically or as part of any scripted/batch flow.** This is a manual, deliberate step the operator performs after everything else (connection, draft, approval) has been verified:

1. Create a draft with real, intended content.
2. Read it back with `get_linkedin_draft` and actually review it yourself.
3. Approve it with the exact confirmation phrase.
4. Only then call `publish_linkedin_draft` with `confirmation` set to exactly `PUBLISH_APPROVED_LINKEDIN_POST` and the draft's `approvedVersion`.
5. Check the real result on `https://www.linkedin.com` and via `get_publish_status`.

## Token-expiration behavior

LinkedIn access tokens are long-lived (currently ~60 days per LinkedIn's docs) but do expire. `get_linkedin_connection` reports `expiresAt`. `publish_linkedin_draft` checks the stored expiry immediately before publishing and fails with `TOKEN_EXPIRED` (never attempting the call) if it's past. There is no refresh-token flow implemented - reconnect via `/oauth/linkedin/start` when this happens.

## MCP tools (9)

| Tool | Purpose |
|---|---|
| `get_linkedin_connection` | Connection status + authorizationUrl if not connected |
| `create_linkedin_draft` | Create a draft (never publishes) |
| `get_linkedin_draft` | Fetch one draft |
| `list_linkedin_drafts` | List drafts, optionally by status |
| `update_linkedin_draft` | Edit a draft - bumps version, clears approval, never publishes |
| `approve_linkedin_draft` | Approve, pinning text/media hashes - never publishes |
| `reject_linkedin_draft` | Reject - never publishes |
| `publish_linkedin_draft` | **The sensitive write tool.** Publishes an approved, unchanged draft. Annotated `destructiveHint: true`. |
| `get_publish_status` | Status/postId/URL/error for a draft |

## OAuth routes

```
GET  /oauth/linkedin/start        redirect to LinkedIn's authorization page
GET  /oauth/linkedin/callback     LinkedIn redirects here after consent
GET  /oauth/linkedin/status       {connected, displayName, authorUrn, scopes, expiresAt} or {connected:false}
POST /oauth/linkedin/disconnect   deletes the local connection row
```

## Troubleshooting

- **Server won't start / "Missing required environment variable ..."**: copy `.env.example` to `.env` and fill in every value; see step 2.
- **"LINKEDIN_VERSION must be exactly 6 digits"**: use `YYYYMM` format, e.g. `202509`, not a date string.
- **OAuth callback shows "invalid, expired, or already used"**: the `state` has a 10-minute lifetime and can only be used once. Restart from `/oauth/linkedin/start`.
- **`publish_linkedin_draft` fails with `TOKEN_EXPIRED`**: reconnect via `/oauth/linkedin/start`.
- **`publish_linkedin_draft` fails with `DRAFT_CHANGED_SINCE_APPROVAL`**: the draft's text or media changed after approval (or the draft was edited via `update_linkedin_draft`, which always resets approval). Re-approve the current version.
- **`MEDIA_MISSING_OR_UNSUPPORTED`**: only png/jpeg/webp, max 10MB, and the path must resolve inside the media root (this server's `generated/` directory by default) - see "Known limitations".
- **better-sqlite3 fails to load / native binding error**: reinstall with the same Node version you'll run the server with (`rm -rf node_modules && npm install`).

## Security warnings

- This server stores a real LinkedIn access token (encrypted at rest with AES-256-GCM, key from `TOKEN_ENCRYPTION_KEY`) in a local SQLite file. Protect `data/social-publisher.sqlite` and `.env` like any other credential store - back them up carefully or not at all, and never commit them.
- `POST /oauth/linkedin/disconnect` **only deletes the local connection record.** LinkedIn does not document a generic OAuth token-revocation endpoint for this app type. If you want to fully revoke this app's access on LinkedIn's side, do it from your LinkedIn account's **Settings &rarr; Data privacy &rarr; Permitted services** (or equivalent, LinkedIn's UI changes over time).
- Do not bind `SOCIAL_MCP_HOST` to `0.0.0.0` or expose this port beyond localhost - there is no per-request authentication on the MCP endpoint or the OAuth routes.
- `publish_linkedin_draft` is a genuine, irreversible external side effect (creates a real LinkedIn post). The confirmation-string + version + hash-pinning guards exist specifically so an agent can't publish something the human didn't actually see approved.

## Known limitations

- `create_linkedin_draft`'s `campaignId` parameter is accepted (for forward compatibility with campaign tooling) but **not persisted** - the `social_drafts` table schema (defined exactly as specified for this project) has no `campaign_id` column.
- `reject_linkedin_draft`'s `reason` is accepted and echoed back in that call's own response, but **not persisted** for the same reason - no `reject_reason` column in the schema.
- No refresh-token flow; when the access token expires you must reconnect via OAuth.
- Media validation is extension-based (png/jpeg/webp), not magic-byte content sniffing.
- `publishedUrl` construction: LinkedIn's Posts API docs confirm `https://www.linkedin.com/feed/update/urn:li:ugcPost:<id>/` as the viewer URL pattern for a published UGC post. The modern Posts API returns a `urn:li:share:<id>` for member posts; this project extends the same `/feed/update/<urn>/` pattern to share URNs by analogy (the same viewer path is used site-wide for both URN kinds) - this is a reasonable but not 100%-LinkedIn-confirmed assumption for the share-URN case specifically.
- No Meta/Instagram/TikTok adapters (out of scope). `src/platforms/types.ts` defines a generic `PlatformAdapter` interface so those can be added later without touching `src/platforms/linkedin/`.
- Single-operator, single-connection-per-platform design: connecting a new LinkedIn account replaces the previous connection for that platform.

## Commands

```bash
npm install     # install dependencies
npm run build   # tsc build to dist/
npm run test    # vitest run (all tests, all LinkedIn HTTP calls mocked - no real network)
npm run typecheck  # tsc --noEmit over src/ + tests/
npm run lint       # alias for typecheck (see note below)
npm run dev        # tsx watch src/index.ts
npm start          # node dist/index.js
```

Note on `lint`: this project doesn't add a separate ESLint config/dependency - TypeScript's own strict compiler flags (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`) serve as the lint gate for a project this size, to keep the toolchain minimal. `npm run lint` and `npm run typecheck` currently run the same command.

## Repository structure

```
mcp-server/
  src/
    config.ts              env loading + validation
    server.ts               Express app: MCP endpoint + OAuth routes
    index.ts                 entrypoint
    oauth/linkedin.ts        OAuth start/callback/status/disconnect routes
    platforms/
      types.ts               generic PlatformAdapter interface
      linkedin/               LinkedIn-specific implementation
    storage/                 SQLite migrations, encryption, repositories
    tools/                   the 9 MCP tools + shared error taxonomy
    validation/               text length / media file validation
  tests/                     vitest - one file per module, no real network
  generated/                  default media root for draft image attachments
```
