// Explicit protocol fixture, never a model implementation.
import { createInterface } from 'node:readline';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
const input = createInterface({ input: process.stdin });
const lines = input[Symbol.asyncIterator]();
const envelope = JSON.parse((await lines.next()).value);
const { request, workspace } = envelope;
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
let sequence = 0;
async function tool(name, arguments_, id = `call-${++sequence}`) {
  emit({ type: 'tool', id, name, arguments: arguments_ });
  const value = JSON.parse((await lines.next()).value);
  if (value.type !== 'tool_result' || value.id !== id) throw new Error('Invalid host correlation');
  return value.data;
}
let result;
if (request.operation === 'inspect' && request.projectId === 'inspect-tool') {
  await tool('workspace_info', {});
} else if (request.operation === 'inspect') {
  emit({ type: 'result', data: { configured: true, model: 'node-protocol-fixture', tools: ['workspace_info'] } });
} else if (request.payload.prompt === 'wait') {
  emit({ type: 'progress', message: 'Node fixture waiting for cancellation' });
  for await (const line of lines) {
    if (JSON.parse(line).type === 'cancel') {
      emit({ type: 'error', code: 'cancelled', message: 'Fixture cancelled' });
      break;
    }
  }
} else if (request.payload.prompt === 'duplicate') {
  await tool('workspace_info', {}, 'duplicate-id');
  await tool('workspace_info', {}, 'duplicate-id');
} else if (request.payload.prompt === 'inject-artifact') {
  emit({ type: 'result', data: { text: 'Rejected fixture', artifacts: [{ id: 'fake.txt', name: 'fake.txt', mimeType: 'text/plain' }] } });
} else if (request.payload.prompt === 'symlink-artifacts') {
  const outside = join(workspace, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(workspace, 'artifacts'), 'dir');
  await tool('write_file', { name: 'test.txt', content: 'must not be written' });
  emit({ type: 'result', data: { text: 'Rejected fixture', artifacts: [] } });
} else {
  result = { identity: await tool('workspace_info', {}), history: envelope.context || [] };
  const actions = JSON.parse(request.payload.prompt);
  result.actions = [];
  for (const action of actions) result.actions.push(await tool(action.name, action.arguments));
  emit({ type: 'result', data: { text: JSON.stringify(result), artifacts: [] } });
}
input.close();
process.stdin.destroy();
