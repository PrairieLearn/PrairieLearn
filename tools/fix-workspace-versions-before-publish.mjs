// @ts-check

// Changesets doesn't currently support workspace versions:
// https://github.com/changesets/changesets/issues/432
// https://github.com/changesets/action/issues/246
// To work around that, we'll manually resolve any `workspace:` version ranges
// with this tool prior to publishing. If/when changesets adds native support for
// publishing with Yarn 3, we can remove this script.
//
// We'll only support the `workspace:^` range, which is the only one we
// generally want to use.

import cp from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import util from 'node:util';

const DEPENDENCY_TYPES = ['dependencies', 'devDependencies', 'peerDependencies'];

const exec = util.promisify(cp.exec);

const rawWorkspaces = await exec('yarn workspaces list --json', { encoding: 'utf8' });
const workspaces = rawWorkspaces.stdout
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))
  .filter((workspace) => workspace.location !== '.');

// Get the version of each workspace package.
const workspaceVersions = new Map();
for (const workspace of workspaces) {
  const packageJsonPath = path.join(workspace.location, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  workspaceVersions.set(workspace.name, packageJson.version);
}

// Replace any `workspace:^` version ranges with the actual version.
for (const workspace of workspaces) {
  const packageJsonPath = path.join(workspace.location, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

  for (const dependencyType of DEPENDENCY_TYPES) {
    const dependencies = Object.keys(packageJson[dependencyType] ?? {});
    for (const dependency of dependencies) {
      const dependencyVersion = packageJson[dependencyType][dependency];
      if (dependencyVersion.startsWith('workspace:')) {
        if (!dependencyVersion.startsWith('workspace:^')) {
          throw new Error(`Unsupported workspace version range: ${dependencyVersion}`);
        }

        const realVersion = workspaceVersions.get(dependency);
        if (!realVersion) {
          throw new Error(`Could not find version for workspace ${dependency}`);
        }

        packageJson[dependencyType][dependency] = `^${realVersion}`;
      }
    }
  }

  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}
