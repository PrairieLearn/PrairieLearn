import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Install dependencies, but only for this package.
console.log('Installing dependencies...');
await execAsync('npm install --workspaces=false', {
  stdio: 'inherit',
  cwd: import.meta.dirname,
});
console.log('Installed dependencies');
