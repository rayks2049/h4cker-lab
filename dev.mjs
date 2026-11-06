import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const api = spawn(process.execPath, [resolve('server.mjs'), '--api-only', '--host', '127.0.0.1', '--port', '4174'], { stdio: 'inherit' });
const vite = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '0.0.0.0', ...process.argv.slice(2)], { stdio: 'inherit' });

function stop() {
  api.kill();
  vite.kill();
}

api.on('error', (error) => { console.error(error); stop(); process.exitCode = 1; });
vite.on('error', (error) => { console.error(error); stop(); process.exitCode = 1; });
vite.on('exit', (code) => { api.kill(); process.exitCode = code ?? 0; });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
