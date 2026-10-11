import { transactionDatabase } from './transactionDatabase';
import { MySqlDialect } from 'drizzle-orm/mysql-core';

/** Isolated fixtures: legacy API tests never connect to application data. */
export function legacyFixture() {
 const db=transactionDatabase({users:[],assets:[],custody_items:[],audit_log:[],archive_documents:[],inventory_approval_numbers:[],
 locations:[{id:1,name:'موقع اختبار',assetPrefix:'AST',custodyPrefix:'CUS',assetSequence:0,custodySequence:0}],
 branches:[{id:1,name:'فرع اختبار',locationId:1}],departments:[{id:1,name:'قسم اختبار',branchId:1}],employees:[{id:1,fullName:'مستلم اختبار',departmentId:1}]});
 const dialect=new MySqlDialect();
 db.execute=async(query:any)=>{
  const {sql}=dialect.sqlToQuery(query);
  if(sql.includes('information_schema.TABLES'))return [[{TABLE_NAME:'audit_log'}],[]];
  if(sql.includes('information_schema.COLUMNS'))return [[{TABLE_NAME:'audit_log',COLUMN_NAME:'id',DATA_TYPE:'int',COLUMN_TYPE:'int',IS_NULLABLE:'NO',COLUMN_DEFAULT:null,EXTRA:'auto_increment',ORDINAL_POSITION:1}],[]];
  if(sql.includes('information_schema.KEY_COLUMN_USAGE'))return [[],[]];
  if(sql.includes('SELECT *'))return [[{id:1}],[]];
  return [[],[]];
 };
 return db;
}
