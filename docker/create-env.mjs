import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const template = new URL('../.env.example', import.meta.url);
const destination = new URL('../.env', import.meta.url);
const secrets = [
  'MONGO_ROOT_PASSWORD',
  'MONGO_API_PASSWORD',
  'MONGO_N8N_PASSWORD',
  'WORKFLOW_KEY',
  'N8N_ENCRYPTION_KEY',
];

let config = readFileSync(template, 'utf8');
for (const name of secrets) {
  config = config.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${randomBytes(32).toString('hex')}`);
}

try {
  writeFileSync(destination, config, { flag: 'wx', mode: 0o600 });
  console.log('Creado .env con claves aleatorias.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.error('.env ya existe. Se conservaron sus credenciales.');
  process.exitCode = 1;
}
