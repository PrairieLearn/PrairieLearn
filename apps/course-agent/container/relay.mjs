import { spawn } from 'node:child_process';

// Stdio is carried by the private Container exec channel, never a listening port.
// Codex and every tool run as node; the relay and checkpoint helper remain root-owned.
const child = spawn('codex', ['app-server'], {
  uid: 1000,
  gid: 1000,
  cwd: '/workspace/session/course',
  env: {
    PATH: process.env.PATH,
    HOME: '/workspace/session/home',
    CODEX_HOME: '/workspace/session/home/.codex',
  },
  stdio: ['pipe', 'pipe', 'inherit'],
});
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.stdin.destroy();
  process.exitCode = code ?? 1;
});
process.stdin.on('end', () => child.kill('SIGKILL'));
