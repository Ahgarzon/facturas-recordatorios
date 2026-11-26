import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const app = process.env.APP_URL ?? 'http://127.0.0.1:18080';
const mail = process.env.MAILPIT_URL ?? 'http://127.0.0.1:18025';

async function json(base, path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200, path);
  return response.json();
}

async function waitForApi() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      return await json(app, '/api/invoices');
    } catch (error) {
      if (attempt === 29) throw error;
      await wait(1_000);
    }
  }
}

function executeWorkflow() {
  execFileSync('docker', ['compose', 'run', '--rm', '--no-deps', '-T', 'n8n', 'execute', '--id', 'facturasAvisos'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: 90_000,
  });
}

function status(invoiceList, number) {
  return invoiceList.find(invoice => invoice.number === number)?.status;
}

const before = await waitForApi();
assert.equal(new Set(before.map(invoice => invoice.customer)).size, 3);
assert.deepEqual(await json(app, '/api/demo-correos'), []);
assert.equal(status(before, 'FAC-0101'), 'primerrecordatorio');
assert.equal(status(before, 'FAC-0102'), 'segundorecordatorio');
assert.equal(status(before, 'FAC-0103'), 'primerrecordatorio');

const dashboard = await fetch(app);
assert.equal(dashboard.status, 200);
assert.match(await dashboard.text(), /<div id="root"/);
const example = before.find(invoice => invoice.number === 'FAC-0101');
const unauthenticated = await fetch(app + '/api/internal/reminders/' + encodeURIComponent(example.id), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ revision: 0 }),
});
assert.ok([401, 403].includes(unauthenticated.status), 'La ruta de ejecución requiere credenciales.');

const inboxBefore = await json(mail, '/api/v1/messages');
executeWorkflow();
const after = await json(app, '/api/invoices');
assert.equal(status(after, 'FAC-0101'), 'segundorecordatorio');
assert.equal(status(after, 'FAC-0102'), 'desactivado');
assert.equal(status(after, 'FAC-0103'), 'segundorecordatorio');
for (const number of ['FAC-0104', 'FAC-0105', 'FAC-0106']) {
  assert.equal(status(after, number), status(before, number), number);
}

const received = await json(app, '/api/demo-correos');
assert.equal(received.length, 3);
assert.ok(received.every(message => message.read === false));
const captured = received.find(message => message.invoiceNumber === 'FAC-0101');
assert.equal(captured.messageId, after.find(invoice => invoice.number === 'FAC-0101').history[0].messageId);
const opened = await json(app, '/api/demo-correos/' + encodeURIComponent(captured.id));
assert.equal(opened.messageId, captured.messageId);
assert.match(opened.text, /FAC-0101/);
assert.equal(opened.read, true);
const refreshedInbox = await json(app, '/api/demo-correos');
assert.equal(refreshedInbox.find(message => message.id === captured.id).read, true);

const inbox = await json(mail, '/api/v1/messages');
assert.equal(inbox.total, inboxBefore.total + 3);
const messages = await Promise.all(inbox.messages.map(message => json(mail, '/api/v1/message/' + message.ID)));
for (const number of ['FAC-0101', 'FAC-0102', 'FAC-0103']) {
  const invoice = after.find(item => item.number === number);
  assert.equal(invoice.history.length, 1, number);
  const { messageId, fromStatus, toStatus } = invoice.history[0];
  assert.equal(fromStatus, status(before, number));
  assert.equal(toStatus, invoice.status);
  assert.ok(messages.some(message => message.MessageID === messageId &&
    JSON.stringify([message.Subject, message.Text]).includes(number)), number);
}

executeWorkflow();
const rerun = await json(app, '/api/invoices');
for (const invoice of after) {
  const current = rerun.find(item => item.id === invoice.id);
  assert.equal(current.status, invoice.status, invoice.number);
  assert.deepEqual(current.history, invoice.history, invoice.number);
}
assert.equal((await json(mail, '/api/v1/messages')).total, inbox.total);
console.log('Verificado: 3 clientes, 3 recepciones ligadas al historial, lectura visible y 0 duplicados al repetir.');
