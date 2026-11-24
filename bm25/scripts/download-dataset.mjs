import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.resolve(moduleDir, '../data/raw');
const dataset = 'd0rj/povarenok_recipes_detail';
const endpoint = 'https://datasets-server.huggingface.co/parquet?dataset=' + encodeURIComponent(dataset);

mkdirSync(rawDir, { recursive: true });
const metadataResponse = await fetch(endpoint);
if (!metadataResponse.ok) {
  throw new Error('Dataset Viewer returned ' + metadataResponse.status + ': ' + await metadataResponse.text());
}
const metadata = await metadataResponse.json();
if (metadata.failed?.length || metadata.pending?.length) {
  throw new Error('Dataset parquet files are not ready: ' + JSON.stringify({ failed: metadata.failed, pending: metadata.pending }));
}

for (const item of metadata.parquet_files) {
  const target = path.join(rawDir, item.filename);
  if (existsSync(target) && statSync(target).size === item.size) {
    console.log('Already downloaded ' + item.filename);
    continue;
  }

  console.log('Downloading ' + item.filename + ' (' + item.size + ' bytes)');
  const response = await fetch(item.url);
  if (!response.ok || !response.body) {
    throw new Error('Download failed for ' + item.filename + ': HTTP ' + response.status);
  }

  const temporary = target + '.part';
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  const actualSize = statSync(temporary).size;
  if (actualSize !== item.size) {
    throw new Error('Size mismatch for ' + item.filename + ': expected ' + item.size + ', got ' + actualSize);
  }
  await import('node:fs/promises').then(({ rename }) => rename(temporary, target));
  console.log('Saved ' + item.filename);
}
