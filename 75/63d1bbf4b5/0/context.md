# Session Context

## User Prompts

### Prompt 1

review the comments on the pr by nathan

### Prompt 2

yes, address comments

### Prompt 3

Base directory for this skill: /Users/peter/.claude/skills/pr-comment-resolver

# PR Comment Resolver

This skill handles unresolved **inline review comments** (comments on specific lines in the diff) on a GitHub PR. It does NOT handle general PR comments or top-level review summaries.

## Workflow

**CRITICAL: Before posting ANY "Fixed in" or "Added in" response, you MUST:**
1. **Verify the change** - Read the file again after committing to confirm your change is present
2. **Push the commit** ...

