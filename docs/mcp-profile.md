# Claude's connection: the "Red Panda Insights" profile

Claude reads your Lytics, Personalize, Contentstack and Brand Kit data through **Contentstack MCP Profile Hub**. A profile is a hosted MCP server that exposes only the tools you pick for it. Calls run with your own roles, signed in through `/mcp`. No keys go into Claude.

## Create the profile

1. Install the **Profile Hub** app from Contentstack Marketplace.
2. Choose **+ New Profile** and name it `Red Panda Insights`.
3. **Browse catalog** and select exactly the tools listed below.
4. **Configure**: pick your Stack, your Lytics connection, your Personalize connection and your Brand Kit.
5. **Install**, then the **Claude Code** tab. It shows a command of this shape:

   ```
   claude mcp add --transport http red-panda-insights "https://mcp-profile-hub.contentstack.com/api/mcp?profile_id=<id>&org_uid=<org>&apikey=<stack api key>"
   ```

   Use the command from the tab. The IDs are not secret.
6. Run it in Terminal, start Claude Code in this repo, run `/mcp`, choose `red-panda-insights` and sign in.

Limits: up to 200 tools per profile, one stack per connector URL, one profile per connection. **Tool definitions are cached for 5 minutes**, so after you edit a profile, reconnect (`/mcp`) or wait before expecting the change.

## Tools to select (30)

**Lytics** (all reads, 8)
`lytics_get_all_audiences`, `lytics_get_a_single_audience`, `get_field_information`, `get_a_user_profile`, `get_fields`, `get_tables`, `get_content_topics`, `get_accounts`

**Personalize** (6)
`get_all_audiences`, `get_all_experiences`, `get_single_experience`, `get_experience_versions`, `get_all_events`, `get_analytics_summary`

**CMA** (10)
`get_all_content_types`, `get_a_single_content_type`, `get_all_entries`, `get_single_entry`, `get_all_variants_of_an_entry`, `get_single_entry_variant`, `get_all_variants_of_a_content_type`, `create_an_entry_variant`, `publish_variants_of_an_entry`, `get_all_environments`

**CDA** (2)
`get_all_entries_cdn`, `get_a_single_entry_cdn`

**BrandKit** (4)
`get_all_contents_in_knowledge_vault`, `get_a_single_content_in_knowledge_vault`, `get_data_chunks_from_knowledge_vault`, `generative_ai`

## What is left out, and why

- **Every delete tool.** Claude's tool calls are visible on screen during a demo. A profile with no deletes can't remove anything by accident.
- **`classify_content` and `enrich_content`.** They write to Lytics.
- **The BrandKit voice-profile tools.** They use the v1 API path, which returns 410 on v2 Brand Kits. The kit's two voice profiles are created by `npm run kit:brandkit`, which uses the v2 API.
- **The Lytics catalog is read-only.** It can't create an audience or return a live audience count. Field-statistics counts come from a cache that can be hours old. For creating audiences and live counts, Claude uses the helper `node .claude/skills/red-panda-customer-insights/scripts/rp.mjs`.

## Fallbacks

- **System profiles.** If you can't create a custom profile, connect the `lytics` and `personalize` system profiles with the same URL shape and `profile_id=lytics` or `profile_id=personalize`. Know that these include delete and publish tools.
- **Local MCP.** If your organization doesn't have Profile Hub, use the local `@contentstack/mcp` server instead. If it won't start, check that a group ID isn't missing, and run its `--auth` step in a real terminal.
