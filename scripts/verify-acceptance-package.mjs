import {writeFileSync,readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync('qa-results/pilot-package.json','utf8'));
for(const file of manifest.files){const {createHash}=await import('node:crypto');if(createHash('sha256').update(readFileSync(manifest.directory+'/'+file.name)).digest('hex')!==file.sha256)throw Error('Package digest mismatch '+file.name);}
if(readFileSync(manifest.directory+'/schema-empty.sql','utf8').match(/INSERT\s+INTO/i))throw Error('Unexpected data in schema');
const {readdirSync}=await import('node:fs');if(readdirSync(manifest.directory).includes('.env'))throw Error('Local environment shipped');
writeFileSync('qa-results/acceptance-package-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),filesHashMatch:true,noLocalEnvironmentFile:true,noSchemaInsertStatements:true,definitions:manifest.definitions,foreignKeys:manifest.foreignKeys,directory:manifest.directory},null,2));
