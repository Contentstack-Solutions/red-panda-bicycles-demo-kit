# Setup: connecting Lytics, Personalize and the stack

Read this when someone asks for help connecting Lytics, installing this skill, or checking their setup. Walk them through it one step at a time. Never ask anyone to paste a key into the chat.

This skill runs in Claude Code, in a session started in the Red Panda Bicycles repository folder, and uses two things:

| Part | What it does | Where the credential lives |
|---|---|---|
| **`Red Panda Insights`** (a Contentstack MCP Profile Hub profile) | Reads: audiences, field stats, profiles, content topics, Personalize experiences and results, entries and variants, the Brand Kit | The person's own sign-in, through `/mcp` |
| **Helper script** `scripts/rp.mjs` (inside this skill) | Writes and live counts: Lytics audiences and audience sizes, Personalize experiences and events, CMS entries and variants | The repository's `.env.local`, plus the macOS keychain (or `~/.red-panda/credentials.env`) for the Contentstack login |

## 1. Get or update this skill

The skill ships inside the repository, in `.claude/skills/red-panda-customer-insights/`. A Claude Code session started in the repository folder loads it automatically. To update it, pull the latest version of the repository (`git pull`). The helper comes with it. It needs Node 20.6 or later (`node -v`). Run the commands below from the repository folder.

## 2. Connect `Red Panda Insights`

The full steps and the exact tool list are in `docs/mcp-profile.md`. In short:

1. In Contentstack, install the **Profile Hub** app, create a profile named `Red Panda Insights`, select the tools that file lists, and configure it with the stack, the Lytics connection, the Personalize connection and the Brand Kit.
2. On the profile's **Claude Code** tab, copy the `claude mcp add --transport http red-panda-insights "…"` command and run it in Terminal.
3. Start Claude Code in the repository folder, run `/mcp`, choose `red-panda-insights` and sign in.

Test it in a new session: "List our Lytics audiences." You should see `roam_preorder` among them. After the profile is edited, its tool list is cached for 5 minutes: reconnect with `/mcp` or wait.

## 3. Keys for the helper

The helper reads these from the repository's `.env.local` (it loads the file for any key not already set) and never prints them:

| Key | What it is |
|---|---|
| `LYTICS_ACCESS_TOKEN` | Lytics admin API token |
| `CONTENTSTACK_API_KEY` | The stack's API key |
| `CONTENTSTACK_MANAGEMENT_TOKEN` | Stack management token (CMS writes) |
| `CONTENTSTACK_PERSONALIZE_PROJECT_UID` | The Personalize project |

The Contentstack login session (`CONTENTSTACK_AUTHTOKEN`) is different: Personalize needs it, because a management token can't reach the Personalize API. It never goes in `.env.local`. The person runs this in Terminal from the repository folder (not inside Claude Code, because it asks for a password and a current 2FA code):

```
node .claude/skills/red-panda-customer-insights/scripts/rp.mjs login
```

It stores the session token in the macOS keychain (or `~/.red-panda/credentials.env`). Sessions expire after a few hours: run `login` again when the helper reports a 401 from Personalize.

## 4. Tool permissions

The repository's `.claude/settings.json` already allows the helper and the `red-panda-insights` tools, so they run without approval prompts. Claude Code only applies it once the folder is trusted: start `claude` in the repository folder once and accept the trust prompt.

## 5. Check it

```
node .claude/skills/red-panda-customer-insights/scripts/rp.mjs doctor
```

It shows where each key was found (never the values) and tests each API. You want `"lytics": "ok"`, `"personalize": "ok"` and `"cms": "ok"`. For anything not ok, pass on what `checks` says.

## 6. Before a session

1. Start a fresh Claude Code session in the repository folder, with `red-panda-insights` signed in (`/mcp`).
2. Ask: "Run the setup check."
3. If an old **Roam Commuter Campaign** audience or experience exists and you want to create it fresh, remove it first: undo the experience as in `references/personalize.md` (→ Undoing), then `lytics-delete-audience roam_commuter_campaign`.
4. Start another fresh session (`/clear`), so earlier questions don't carry over into "of those".
