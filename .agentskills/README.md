# Agent Skills

This directory contains agent skills and capabilities sourced from external repositories.

## Overview

Skills are tracked as regular files in this repository, making them immediately available to all developers. The setup script can optionally initialize git tracking for each skill, allowing you to pull updates from upstream sources.

This approach is different from git submodules because:

- **Files are versioned**: Skill files are committed to the PrairieLearn repository
- **No initialization required**: New developers get the skills automatically when cloning
- **Optional updates**: Use the setup script only when you want to update from upstream
- **Subdirectory support**: We can include specific subdirectories from source repositories

## Current Skills

### playwright-skill

- **Source Repository**: https://github.com/lackeyjb/playwright-skill
- **Source Path**: `skills/playwright-skill` (subdirectory in the source repo)
- **Local Path**: `.agentskills/playwright-skill`
- **Purpose**: Provides Playwright browser automation capabilities for AI agents

## Updating Skills (Optional)

To enable pulling updates from upstream sources, run the setup script:

```bash
cd .agentskills
./setup.sh
```

This initializes git tracking in each skill directory, allowing you to pull updates. Once initialized, you can update a skill with:

```bash
cd .agentskills/playwright-skill
git pull origin main
```

**Note**: The setup script is optional. You only need it if you want to pull updates from upstream repositories.

## Manual Update Setup

If you prefer to set up update tracking manually for a specific skill:

### playwright-skill

```bash
cd /path/to/PrairieLearn/.agentskills/playwright-skill

# Initialize a git repo with sparse checkout
git init
git remote add origin https://github.com/lackeyjb/playwright-skill.git
git config core.sparseCheckout true
echo "skills/playwright-skill/*" >> .git/info/sparse-checkout
git pull origin main

# Move the subdirectory contents to the root
if [ -d skills/playwright-skill ]; then
  mv skills/playwright-skill/* .
  rm -rf skills
fi
```

## Updating a Skill

After running the setup script, you can update a skill to the latest version:

```bash
cd .agentskills/playwright-skill
git pull origin main

# If the structure changed, reorganize:
if [ -d skills/playwright-skill ]; then
  mv skills/playwright-skill/* .
  rm -rf skills
fi
```

Then commit the updated files to the PrairieLearn repository:

```bash
cd /path/to/PrairieLearn
git add .agentskills/playwright-skill
git commit -m "Update playwright-skill to latest version"
```

## Adding a New Skill

To add a new skill from a repository subdirectory:

```bash
cd .agentskills
mkdir -p <skill-name>
cd <skill-name>

# Initialize with sparse checkout
git init
git remote add origin <repository-url>
git config core.sparseCheckout true
echo "<path/to/subdirectory>/*" >> .git/info/sparse-checkout
git pull origin <branch-name>

# Move contents if needed
if [ -d <path/to/subdirectory> ]; then
  mv <path/to/subdirectory>/* .
  rm -rf <path>
fi

# Remove .git directory so files can be tracked in parent repo
rm -rf .git
```

Then commit the skill files and update this README:

```bash
cd /path/to/PrairieLearn
git add .agentskills/<skill-name>
git commit -m "Add <skill-name> agent skill"
```

Finally, add the skill to the setup script so others can enable update tracking if needed.

## Why This Approach?

### vs. Traditional Submodules

- **Submodules** require initialization (`git submodule update --init`) and don't work with subdirectories
- **This approach** includes files directly, so skills work immediately after cloning

### vs. Git Subtree

- **Subtree** merges external history into the parent repo, bloating history
- **This approach** tracks only the current files, keeping history clean

### vs. Package Managers

- **Package managers** require network access and build steps
- **This approach** makes skills immediately available offline

Our approach provides:

- ✓ Immediate availability (no initialization required)
- ✓ Subdirectory support (include just what we need)
- ✓ Clean history (no external commits)
- ✓ Optional updates (setup script enables git tracking)
- ✓ Offline development (files are committed)

## Troubleshooting

### Skills are already present, why run setup?

The setup script is optional. It only initializes git tracking for pulling updates from upstream. If you don't need to update skills, you don't need to run it.

### Sparse checkout isn't working

Make sure sparse checkout is enabled:

```bash
cd .agentskills/<skill-name>
git config core.sparseCheckout true
cat .git/info/sparse-checkout  # Should show your path pattern
```

### Can't pull updates

If you've made local changes:

```bash
cd .agentskills/<skill-name>
git stash  # Save your changes
git pull origin main
git stash pop  # Reapply your changes
```

### Want to see the full repository

To temporarily disable sparse checkout and see everything:

```bash
cd .agentskills/<skill-name>
git config core.sparseCheckout false
git read-tree -mu HEAD
```

To re-enable sparse checkout:

```bash
git config core.sparseCheckout true
git read-tree -mu HEAD
```
