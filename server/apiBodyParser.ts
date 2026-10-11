import express, {type Express, type RequestHandler} from 'express';
import {parse as parseCookie} from 'cookie';
import {COOKIE_NAME} from '../shared/const';
import {sdk} from './_core/sdk';

/** Large import/image/restore bodies require a verified operator before parsing. */
export function registerApiBodyParsers(app: Express) {
  const smallJson=express.json({limit:'64kb'});
  const smallForm=express.urlencoded({limit:'64kb',extended:false,parameterLimit:100});
  const bulkJson=express.json({limit:'50mb'});
  const bounded:RequestHandler=async(req,res,next)=>{
    const length=Number(req.headers['content-length']);
    if (!req.is('application/json') || (Number.isFinite(length) && length<=65536)) return smallJson(req,res,next);
    try {
      const token=parseCookie(req.headers.cookie||'')[COOKIE_NAME];
      const user=token?await sdk.authenticateRequest(req):null;
      if (!user || !['owner','admin','accounting_manager','accountant'].includes(user.role)) return smallJson(req,res,next);
      return bulkJson(req,res,next);
    } catch { return smallJson(req,res,next); }
  };
  app.use(bounded);
  app.use(smallForm);
}
