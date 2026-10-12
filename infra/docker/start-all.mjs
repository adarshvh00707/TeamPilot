// Runs the API and worker side by side; if either exits, stop the other so the host restarts the container.
import { spawn } from 'node:child_process';

const children = ['api', 'worker'].map((name) =>
  spawn(process.execPath, ['--enable-source-maps', `${name}/dist/index.js`], { stdio: 'inherit' }).on('exit', (code, signal) => {
    console.error(`[start-all] ${name} exited (${signal ?? code})`);
    shutdown(code ?? 1);
  }),
);

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 30_000).unref();
  Promise.all(children.map((c) => (c.exitCode === null ? new Promise((r) => c.on('exit', r)) : null))).then(() => process.exit(code));
}

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => shutdown(0));
