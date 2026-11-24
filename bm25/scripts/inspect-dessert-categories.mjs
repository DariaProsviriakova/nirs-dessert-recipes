import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.resolve(moduleDir, '../data/raw');
const files = (await readdir(rawDir)).filter((name) => name.endsWith('.parquet')).sort();
const counts = new Map();
for (const filename of files) {
  const rows = await parquetReadObjects({
    file: await asyncBufferFromFile(path.join(rawDir, filename)),
    columns: ['title', 'kroshki'],
    compressors,
  });
  for (const row of rows) {
    const pathParts = Array.isArray(row.kroshki) ? row.kroshki : [];
    const root = pathParts[0] || '(без категории)';
    for (const category of new Set(pathParts)) {
      if (/(десерт|сладк|торт|печень|кекс|маффин|пирожн|морожен|конфет|бисквит|пирог|суфле|мусс|пудинг|желе|варень|чизкейк)/i.test(category)) {
        const key = root + ' / ' + category;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
}
const result = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
console.log(JSON.stringify(result, null, 2));
