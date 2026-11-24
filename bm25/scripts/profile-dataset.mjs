import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.resolve(moduleDir, '../data/raw');
const files = (await readdir(rawDir)).filter((name) => name.endsWith('.parquet')).sort();
if (files.length === 0) throw new Error('No Parquet files found. Run npm run download first.');

const categoryCounts = new Map();
const rootCounts = new Map();
let rowCount = 0;
for (const filename of files) {
  const file = await asyncBufferFromFile(path.join(rawDir, filename));
  const rows = await parquetReadObjects({ file, columns: ['title', 'kroshki'], compressors });
  rowCount += rows.length;
  for (const row of rows) {
    const categories = Array.isArray(row.kroshki) ? row.kroshki : [];
    if (categories[0]) rootCounts.set(categories[0], (rootCounts.get(categories[0]) || 0) + 1);
    for (const category of new Set(categories)) {
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }
  }
  console.log('Read ' + filename + ': ' + rows.length + ' rows');
}
const sorter = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru');
console.log(JSON.stringify({
  rows: rowCount,
  root_categories: [...rootCounts.entries()].sort(sorter),
  categories_with_dessert_or_sweet: [...categoryCounts.entries()]
    .filter(([name]) => /десерт|сладк/i.test(name))
    .sort(sorter),
  category_frequency_top_100: [...categoryCounts.entries()].sort(sorter).slice(0, 100),
}, null, 2));
