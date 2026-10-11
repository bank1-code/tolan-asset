// Prepares a local file for the application's normal restore screen.
// Does not call the database, API or browser; actual reset requires UI execution.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const summary=JSON.parse(readFileSync('qa-results/ui-full-cycle/backup-summary.json','utf8'));
const verification=JSON.parse(readFileSync('qa-results/ui-full-cycle/backup-restore-verification.json','utf8'));
if(verification.status!=='PASS'||!verification.temporarySchemaRemoved||!verification.userIdentitiesAndHashesPreserved)
  throw Error('Verified recoverable snapshot is required before reset preparation');
const bytes=readFileSync(summary.filename);
if(createHash('sha256').update(bytes).digest('hex')!==summary.sha256)throw Error('Original snapshot changed');
const original=JSON.parse(Buffer.from(bytes.toString(),'base64').toString('utf8'));
const reset=structuredClone(original);
for(const table of reset.schema.tableNames)reset.tables[table]=[];
reset.tables.users=original.tables.users.map(user=>({...user,employeeId:null}));
// These are schema/runtime metadata, not business records. The normal restore
// already preserves migrations; finance needs its migration-created lock row.
if(original.tables.__drizzle_migrations)reset.tables.__drizzle_migrations=original.tables.__drizzle_migrations;
if(!original.tables.depreciation_control?.some(row=>row.id===1))throw Error('Required finance control row missing');
reset.tables.depreciation_control=[{...original.tables.depreciation_control.find(row=>row.id===1),revision:0}];
reset.createdAt=new Date().toISOString();reset.createdBy='Authorized user-requested test reset, preserving users';
reset.stats=Object.fromEntries(reset.schema.tableNames.map(table=>[table,reset.tables[table].length]));
reset.metadata={...reset.metadata,preparedForAuthorizedTestReset:true,usersPreserved:true,deletedEmployeeLinksDetached:true};
const file='qa-results/ui-full-cycle/backups/reset-preserving-users.tln';
writeFileSync(file,Buffer.from(JSON.stringify(reset)).toString('base64'),{mode:0o600});
const result={status:'PREPARED_NOT_APPLIED',file,userCount:reset.tables.users.length,businessRecords:0,technicalFinanceControlRows:1,migrationRows:reset.tables.__drizzle_migrations?.length??0,originalSnapshot:summary.filename,originalSnapshotSha256:summary.sha256};
writeFileSync('qa-results/ui-full-cycle/reset-preparation.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
