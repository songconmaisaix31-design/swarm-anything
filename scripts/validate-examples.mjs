import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const spec = parse(await readFile(new URL('../contracts/openapi.yaml', import.meta.url), 'utf8'));
const normalized = JSON.parse(JSON.stringify(spec.components.schemas).replaceAll('#/components/schemas/', '#/$defs/'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const schema = { $id: 'https://astrocyte.local/http-v1', $defs: normalized };
const swaSchema = JSON.parse(await readFile(new URL('../contracts/swa-cli.schema.json', import.meta.url), 'utf8'));
ajv.addSchema(swaSchema, new URL('./swa-cli.schema.json', schema.$id).href);
ajv.addSchema(schema);
let count = 0;
for (const [name, definition] of Object.entries(normalized)) {
  const validate = ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` });
  for (const example of definition.examples ?? []) {
    if (!validate(example)) throw new Error(`${name} example invalid: ${ajv.errorsText(validate.errors)}`);
    count++;
  }
}
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    for (const message of [operation.requestBody, ...Object.values(operation.responses)]) {
      for (const media of Object.values(message?.content ?? {})) {
        if (media.example === undefined) continue;
        const definition = JSON.parse(JSON.stringify(media.schema).replaceAll('#/components/schemas/', '#/$defs/'));
        const validate = ajv.compile({ ...definition, $id: new URL(`./http-example-${count}`, schema.$id).href, $defs: normalized });
        if (!validate(media.example)) throw new Error(`${method} ${path} example invalid: ${ajv.errorsText(validate.errors)}`);
        count++;
      }
    }
    if (!operation['x-s0-supported'] && !operation['x-s1-supported']) {
      if (operation.responses['501']?.content?.['application/json']?.example?.error?.code !== 'unsupported_capability') {
        throw new Error(`Future operation ${method} ${path} must document unsupported_capability`);
      }
    }
  }
}
console.log(`Validated ${count} OpenAPI examples and supported capability boundaries`);
