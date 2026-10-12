import { mkdir, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('dist/private/guides');
await mkdir(directory, {recursive:true});
for (const filename of ['tolan-operating-guide.pdf','tolan-quick-guide.pdf']) {
  const source = path.resolve('server/resources/guides',filename);
  const bytes = await readFile(source);
  if (bytes.subarray(0,5).toString() !== '%PDF-') throw new Error(`Invalid operating guide: ${filename}`);
  await copyFile(source,path.join(directory,filename));
}
console.log('Bundled 2 protected operating guides');
