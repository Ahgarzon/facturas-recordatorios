import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const workflowPath = new URL('./recordatorios.json', import.meta.url);
const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
const marker = join(homedir(), '.n8n', 'facturas-workflow-imported');

if (existsSync(marker)) {
  console.log('El flujo ya está instalado. Se conservaron las ediciones hechas desde n8n.');
  process.exit(0);
}

const mongo = workflow.nodes.find(node => node.credentials?.mongoDb).credentials.mongoDb;
const header = workflow.nodes.find(node => node.credentials?.httpHeaderAuth).credentials.httpHeaderAuth;
const password = encodeURIComponent(required('MONGO_N8N_PASSWORD'));
const credentials = [
  {
    ...mongo,
    type: 'mongoDb',
    data: {
      configurationType: 'connectionString',
      database: 'facturas',
      connectionString: 'mongodb://facturas_consulta:' + password + '@mongo:27017/facturas?authSource=facturas',
    },
  },
  {
    ...header,
    type: 'httpHeaderAuth',
    data: { name: 'X-Workflow-Key', value: required('WORKFLOW_KEY') },
  },
];

const temp = mkdtempSync(join(tmpdir(), 'facturas-n8n-'));
try {
  const credentialsPath = join(temp, 'credentials.json');
  writeFileSync(credentialsPath, JSON.stringify(credentials), { mode: 0o600 });
  n8n('import:credentials', '--input=' + credentialsPath);
  for (const credential of credentials) {
    verifyExport('credentials', credential.id);
  }
  n8n('import:workflow', '--input=' + workflowPath.pathname);
  verifyExport('workflow', workflow.id);
  writeFileSync(marker, workflow.id + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Flujo instalado como borrador. Ejecuta manualmente o pulsa Publicar para habilitar el horario.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error('Falta ' + name);
  return value;
}

function n8n(...args) {
  execFileSync('n8n', args, { stdio: 'inherit' });
}

function verifyExport(kind, id) {
  const output = join(temp, kind + '-' + id + '.json');
  n8n('export:' + kind, '--id=' + id, '--output=' + output);
  const exported = JSON.parse(readFileSync(output, 'utf8'));
  if (!Array.isArray(exported) || !exported.some(item => item.id === id)) {
    throw new Error('n8n no confirmó la importación de ' + id);
  }
}
