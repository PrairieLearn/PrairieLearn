#!/bin/bash

# Setup script for agent skills
# This script initializes git tracking with sparse checkout for each skill,
# allowing you to pull updates from upstream repositories.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Agent Skills Update Setup"
echo "========================="
echo ""
echo "This script enables git tracking for skills, allowing you to pull"
echo "updates from upstream repositories. This is OPTIONAL - skills are"
echo "already present and functional without running this script."
echo ""

# Setup playwright-skill
setup_playwright_skill() {
    echo "Setting up playwright-skill..."
    
    if [ ! -d "playwright-skill/.git" ]; then
        cd playwright-skill
        git init
        git remote add origin https://github.com/lackeyjb/playwright-skill.git
        git config core.sparseCheckout true
        echo "skills/playwright-skill/*" >> .git/info/sparse-checkout
        
        # Fetch without checking out to avoid overwriting files
        git fetch origin main
        git reset --soft origin/main
        
        cd ..
        echo "✓ playwright-skill git tracking initialized"
    else
        echo "✓ playwright-skill already has git tracking"
    fi
}

# Run setup for all skills
setup_playwright_skill

echo ""
echo "Setup complete!"
echo ""
echo "To update a skill to the latest version:"
echo "  cd .agentskills/playwright-skill"
echo "  git pull origin main"
echo ""
echo "After updating, commit the changes to PrairieLearn:"
echo "  git add .agentskills/playwright-skill"
echo "  git commit -m \"Update playwright-skill\""
