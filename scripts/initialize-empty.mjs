import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
const username=process.env.INIT_OWNER_USERNAME,password=process.env.INIT_OWNER_PASSWORD;
if(!process.env.DATABASE_URL||!username||username.length<3||!password||password.length<12)throw new Error('Configure DATABASE_URL, INIT_OWNER_USERNAME and INIT_OWNER_PASSWORD (12+ characters)');
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 await db.beginTransaction();
 const [users]=await db.query('SELECT id FROM users LIMIT 1 FOR UPDATE');
 if(users.length)throw new Error('Initialization refuses a database with existing users');
 await db.query("INSERT INTO users(id,openId,username,passwordHash,name,role,loginMethod) VALUES(1,?,?,?,?, 'owner','local')",[randomUUID(),username,await bcrypt.hash(password,12),'مالك المؤسسة']);
 await db.query('INSERT INTO depreciation_control(id,revision) VALUES(1,0)');
 await db.commit();console.log('Empty database initialized; configure organizational and financial settings through the app.');
}catch(error){await db.rollback();throw error;}finally{await db.end();}
