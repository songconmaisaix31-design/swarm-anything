import { readFile, readdir } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseDocument } from 'yaml';

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validators = {};
for (const kind of ['role', 'handoff']) {
  const schema = JSON.parse(await readFile(new URL(`../contracts/${kind}-card.schema.json`, import.meta.url), 'utf8'));
  validators[kind] = ajv.compile(schema);
}
const ids = new Set();
let count = 0;
for (const directory of ['builtin', 'examples', 'community']) {
  const root = new URL(`../roles/${directory}/`, import.meta.url);
  for (const name of await readdir(root)) {
    if (!/\.(ya?ml|json)$/.test(name)) continue;
    const document = parseDocument(await readFile(new URL(name, root), 'utf8'), { uniqueKeys: true });
    if (document.errors.length) throw new Error(`${directory}/${name}: ${document.errors.map(error => error.message).join('; ')}`);
    const value = document.toJS();
    if (!validators.role(value)) throw new Error(`${directory}/${name}: ${ajv.errorsText(validators.role.errors)}`);
    if (ids.has(value.id)) throw new Error(`Duplicate role ID: ${value.id}`);
    ids.add(value.id);
    count++;
  }
}
const handoff = parseDocument(await readFile(new URL('../contracts/examples/handoff-card.yaml', import.meta.url), 'utf8'), { uniqueKeys: true });
if (handoff.errors.length) throw new Error(handoff.errors.map(error => error.message).join('; '));
if (!validators.handoff(handoff.toJS())) throw new Error(`handoff-card.yaml: ${ajv.errorsText(validators.handoff.errors)}`);
count++;
console.log(`Validated ${count} role and handoff assets`);
