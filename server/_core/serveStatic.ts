import express, {type Express} from 'express';
import fs from 'node:fs';
import path from 'node:path';
export function serveStatic(app: Express) {
  const directory=path.resolve(import.meta.dirname,'public');
  if (!fs.existsSync(directory)) throw new Error('Build the client before starting production');
  app.use(express.static(directory));
  app.get('*',(_req,res)=>res.sendFile(path.join(directory,'index.html')));
}
