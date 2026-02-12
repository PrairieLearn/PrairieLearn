# Session Context

## User Prompts

### Prompt 1

# Reduce CI log noise in JavaScript check job

## Context

The `check-js` CI job produces ~1,300 lines of log output, but only ~350 are useful. The two biggest noise sources are git tag fetching (~550 lines, 42%) and native build output from `--inline-builds` (~200 lines, 15%). This change eliminates both.

## Changes

### 1. Add `fetch-tags: false` to checkouts that don't need tags

Eliminates ~550 `[new tag]` lines per job. These jobs only need commit history, not tags.

**`.github/workflows/c...

