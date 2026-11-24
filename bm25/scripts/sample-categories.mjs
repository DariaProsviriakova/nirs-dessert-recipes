import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.resolve(moduleDir, '../data/raw');
const files = (await readdir(rawDir)).filter((name) => name.endsWith('.parquet')).sort();
const targets = new Map([['Кексы', []], ['Пироги', []], ['Открытый пирог, тарт', []], ['Печенье', []]]);
for (const filename of files) {
  const rows = await parquetReadObjects({
    file: await asyncBufferFromFile(path.join(rawDir, filename)),
    columns: ['title', 'kroshki'],
    compressors,
  });
  for (const row of rows) {
    for (const category of targets.keys()) {
      const sample = targets.get(category);
      if (sample.length < 12 && (row.kroshki || []).includes(category)) {
        sample.push({ title: row.title, categories: row.kroshki });
      }
    }
  }
}
console.log(JSON.stringify(Object.fromEntries(targets), null, 2));
