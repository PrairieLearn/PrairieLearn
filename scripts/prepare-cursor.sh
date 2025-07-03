#!/bin/bash

# Cursor expects hard links to files to function properly.
rm -f .cursorignore
ln .agentignore .cursorignore

# Create required directories
mkdir -p .cursor/rules
mkdir -p .cursor/prompts

# Link all rule files
for rule in .agents/rules/*.mdc; do
    ln "$rule" .cursor/rules/
done

# Link all prompt files
for prompt in .agents/prompts/*.md; do
    ln "$prompt" .cursor/prompts/
done
