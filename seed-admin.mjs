import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
const username=process.env.INIT_ADMIN_USERNAME||'admin';
const password=process.env.INIT_ADMIN_PASSWORD;
if(!process.env.DATABASE_URL||!password||password.length<12)throw new Error('Configure DATABASE_URL and a unique INIT_ADMIN_PASSWORD of at least 12 characters');
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 await db.beginTransaction();
 const[existing]=await db.query('SELECT id FROM users WHERE username=? LIMIT 1 FOR UPDATE',[username]);
 if(existing.length)throw new Error('Existing account preserved; use authorized account management for changes');
 await db.query("INSERT INTO users(openId,username,passwordHash,name,role,loginMethod) VALUES(?,?,?,?,'admin','local')",[randomUUID(),username,await bcrypt.hash(password,12),'مدير النظام']);
 await db.commit();console.log('Administrator created; no credential printed.');
}catch(error){await db.rollback();throw error;}finally{await db.end();}
