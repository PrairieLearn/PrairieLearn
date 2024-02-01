import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Install dependencies, but only for this package.
await execAsync('npm install --workspaces=false', {
  stdio: 'inherit',
  cwd: import.meta.dirname,
});
