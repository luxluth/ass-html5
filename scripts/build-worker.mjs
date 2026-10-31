import { build } from 'rolldown';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const result = await build({
    input: 'src/worker.ts',
    platform: 'browser',
    output: {
      format: 'iife',
      minify: true
    }
  });

  const code = result.output[0].code;
  const base64 = Buffer.from(code, 'utf8').toString('base64');
  const output = 'src/worker-bundle.ts';
  const targetPath = path.resolve(process.cwd(), output);
  const content = `// Auto-generated file. Do not edit directly.
export const WORKER_BASE64 = ${JSON.stringify(base64)};

export function getWorkerCode(): string {
  if (typeof atob === 'function') {
    return atob(WORKER_BASE64);
  }
  return typeof Buffer !== 'undefined'
    ? Buffer.from(WORKER_BASE64, 'base64').toString('utf8')
    : '';
}
`;

  fs.writeFileSync(targetPath, content, 'utf8');
  console.log(
    `[embed] (worker) written ${code.length} chars .. ${base64.length} base64 chars -> ${output}`
  );
}

main().catch((err) => {
  console.error('Failed to bundle worker:', err);
  process.exit(1);
});
