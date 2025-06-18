#!/bin/bash

# Cursor expects hard links to files to function properly.
ln .agentignore .cursorignore
mkdir -p .cursor/rules
mkdir -p .cursor/prompts
# Rules
ln .agents/rules/page-structure.mdc .cursor/rules/
ln .agents/rules/preact.mdc .cursor/rules/
ln .agents/rules/typescript-conventions.mdc .cursor/rules/
ln .agents/rules/sql-conventions.mdc .cursor/rules/
ln .agents/rules/testing.mdc .cursor/rules/
ln .agents/rules/prairielearn-overview.mdc .cursor/rules/
ln .agents/rules/security.mdc .cursor/rules/
# Prompts
ln .agents/prompts/create-pr.md .cursor/prompts/
