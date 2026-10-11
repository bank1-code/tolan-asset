import {startVitest} from "vitest/node";
import path from "node:path";
process.env.RUN_QA_UI="1";
const context=await startVitest("test",["scripts/qa-ui-fixture.test.ts"],{config:false,run:true,minWorkers:1,maxWorkers:1},{resolve:{alias:{"@shared":path.resolve("shared"),"@":path.resolve("client/src")}}});
if(context)await context.close();else process.exitCode=1;
