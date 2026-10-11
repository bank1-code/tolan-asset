import 'dotenv/config';
import { startVitest } from 'vitest/node';
import path from 'node:path';
if(!process.env.TEST_DATABASE_URL) throw new Error('Configure TEST_DATABASE_URL for an isolated, migrated test database.');
process.env.RUN_HISTORY_DB_TESTS='1';
const ctx=await startVitest('test',['server/history.integration.test.ts'],{config:false,run:true,maxWorkers:1,minWorkers:1},{resolve:{alias:{'@shared':path.resolve('shared')}}});
if(!ctx)process.exitCode=1;else{const files=ctx.state.getFiles();process.exitCode=files.length!==1||files.some(file=>file.result?.state==='fail')?1:0;await ctx.close();}
