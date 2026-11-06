# Maintaining the kit

This page is for whoever maintains and publishes the kit. You don't need it to set up a copy; for that, start at the [README](../README.md).

## Refresh the content snapshot

Put the source stack's keys in `.env.source` (git-ignored), then run:

```bash
node scripts/kit/export-contentstack.mjs --env-file .env.source
```

This rewrites `seed/contentstack`. Run the leak check afterwards.

## Leak check

`npm run kit:sweep` fails if anything from the original demo or its accounts has crept into the repo. `npm run kit:sweep -- --history` checks every commit's files and message too.

## Tests

`npm test` runs the vitest suite. `npm run build` with a dummy `.env.local` confirms the site still builds.

## First live run

[live-run-checklist.md](live-run-checklist.md) lists what the offline tests couldn't confirm. [architecture.md](architecture.md) explains how the pieces fit.

## Publishing

The working repo's history contains identifiers from the original demo, so publish a single fresh commit of the current tree, never that history. From a clean working tree:

```bash
git checkout --orphan publish
git commit -m "Red Panda demo kit"
npm run kit:sweep -- --history --ref publish
```

`git checkout --orphan` keeps every tracked file staged, so the commit holds the current tree with no parents. The history sweep must report `0 leak(s) found`. (Without `--ref publish` it also checks the old branch, which is still in this repo and still reports the old leaks.) Publish only the `publish` branch, for example `git push <remote> publish:main`.

Then mark the GitHub repo as a template, so the README's `gh repo create --template` step works for the people you share it with:

```bash
gh repo edit <owner>/<repo> --template
```
