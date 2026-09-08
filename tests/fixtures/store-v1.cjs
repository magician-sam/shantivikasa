'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const APP_ID=0x5348564b;
const productFields=['id','name','code','category','unit','icon','price','stock','version','image','sourceUrl','sourceProductId','sourceVariantId','stockTracked','available','archived'];
const saleFields=['number','id','createdAt','subtotal','discount','tax','total','taxRate','discountRate','payment','tendered','shopName'];
const itemFields=['saleId','productId','name','code','quantity','price'];
const fail=(message,status=400)=>{const error=new Error(message);error.status=status;throw error;};
function integer(v,min,max,label){if(!Number.isSafeInteger(v)||v<min||v>max)fail(`${label} must be a whole number from ${min} to ${max}.`);return v;}
function string(v,max,label){if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(`${label} is required (maximum ${max} characters).`);return v.trim();}
function calculate(items,discountRate,taxRate){const subtotal=items.reduce((n,l)=>n+l.price*l.quantity,0),discount=Math.round(subtotal*discountRate/10000),tax=Math.round((subtotal-discount)*taxRate/10000);return{subtotal,discount,tax,total:subtotal-discount+tax};}
class Store {
 constructor(directory,snapshot){
  fs.mkdirSync(directory,{recursive:true});this.directory=directory;this.file=path.join(directory,'register.sqlite');this.db=new DatabaseSync(this.file);this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  const version=this.db.prepare('PRAGMA user_version').get().user_version;
  if(version>1)throw new Error('This database was created by a newer app. Please use the newer version.');
  this.db.exec(`CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,code TEXT NOT NULL UNIQUE,category TEXT NOT NULL,unit TEXT NOT NULL,icon TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),stock INTEGER NOT NULL CHECK(stock>=0),version INTEGER NOT NULL DEFAULT 1,image TEXT NOT NULL DEFAULT '',sourceUrl TEXT NOT NULL DEFAULT '',sourceProductId TEXT NOT NULL DEFAULT '',sourceVariantId TEXT NOT NULL DEFAULT '',stockTracked INTEGER NOT NULL DEFAULT 1,available INTEGER NOT NULL DEFAULT 1,archived INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS sales(number INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,createdAt TEXT NOT NULL,subtotal INTEGER NOT NULL,discount INTEGER NOT NULL,tax INTEGER NOT NULL,total INTEGER NOT NULL,taxRate INTEGER NOT NULL,discountRate INTEGER NOT NULL,payment TEXT NOT NULL,tendered INTEGER NOT NULL,shopName TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sale_items(id INTEGER PRIMARY KEY AUTOINCREMENT,saleId TEXT NOT NULL REFERENCES sales(id),productId TEXT NOT NULL,name TEXT NOT NULL,code TEXT NOT NULL,quantity INTEGER NOT NULL,price INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(saleId);
   CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   PRAGMA application_id=${APP_ID}; PRAGMA user_version=1;`);
  if(!this.db.prepare("SELECT value FROM metadata WHERE key='initialized'").get())this.transaction(()=>{
   for(const p of snapshot.products)this.db.prepare(`INSERT INTO products(${productFields}) VALUES(${productFields.map(()=>'?')})`).run(...productFields.map(f=>p[f]??({version:1,available:1,stockTracked:0,archived:0}[f]??'')));
   for(const sale of snapshot.sales||[]){this.db.prepare(`INSERT INTO sales(${saleFields}) VALUES(${saleFields.map(()=>'?')})`).run(...saleFields.map(f=>sale[f]));for(const item of sale.items)this.db.prepare(`INSERT INTO sale_items(${itemFields}) VALUES(${itemFields.map(()=>'?')})`).run(sale.id,item.productId,item.name,item.code,item.quantity,item.price);}
   this.db.prepare("INSERT INTO metadata(key,value) VALUES('initialized',?)").run(snapshot.exportedAt||new Date().toISOString());
  });
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 products(){return this.db.prepare("SELECT * FROM products WHERE archived=0 ORDER BY CASE category WHEN 'Raw crystals' THEN 0 WHEN 'Incense holders' THEN 1 WHEN 'Incense sticks' THEN 2 ELSE 3 END,name,id").all();}
 sale(id){const s=this.db.prepare('SELECT * FROM sales WHERE id=?').get(id);if(!s)return null;s.items=this.db.prepare('SELECT productId,name,code,quantity,price FROM sale_items WHERE saleId=? ORDER BY id').all(id);return s;}
 ledger(){const sales=this.db.prepare('SELECT id FROM sales ORDER BY number DESC LIMIT 100').all().map(s=>this.sale(s.id));const stats=this.db.prepare('SELECT COUNT(*) as count,COALESCE(SUM(total),0) as revenue FROM sales').get();return{sales,stats};}
 saveProduct(body,edit=false){
  const name=string(body.name,80,'Product name'),code=string(body.code,80,'Code'),category=string(body.category,40,'Category'),unit=string(body.unit,40,'Unit'),icon=string(body.icon,30,'Icon');
  if(!/^[A-Za-z0-9._-]+$/.test(code))fail('Use letters, numbers, dots, dashes, or underscores in the code.');
  if(!['Raw crystals','Incense holders','Incense sticks','Other'].includes(category))fail('Choose a valid category.');
  const price=integer(body.price,1,10000000,'Price'),stock=integer(body.stock,0,1000000,'Stock'),tracked=integer(body.stockTracked??1,0,1,'Stock tracking'),available=integer(body.available??1,0,1,'Availability');
  return this.transaction(()=>{
   if(edit){const id=string(body.id,80,'Product ID'),version=integer(body.version,1,Number.MAX_SAFE_INTEGER,'Version');const r=this.db.prepare('UPDATE products SET name=?,code=?,category=?,unit=?,icon=?,price=?,stock=?,stockTracked=?,available=?,version=version+1 WHERE id=? AND version=? AND archived=0').run(name,code,category,unit,icon,price,stock,tracked,available,id,version);if(!r.changes)fail('This product changed while you were editing. Close the form, refresh Inventory, and try again.',409);}
   else this.db.prepare('INSERT INTO products(id,name,code,category,unit,icon,price,stock,stockTracked,available) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),name,code,category,unit,icon,price,stock,tracked,available);
   return{ok:true};
  });
 }
 checkout(body){
  if(typeof body.id!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(body.id))fail('Invalid checkout identifier.');
  const prior=this.sale(body.id);if(prior)return{sale:prior};
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>100)fail('Add between 1 and 100 different products.');
  if(new Set(body.items.map(i=>i.id)).size!==body.items.length)fail('Duplicate product lines are not allowed.');
  const discountRate=integer(body.discountRate,0,10000,'Discount'),taxRate=integer(body.taxRate,0,10000,'Tax');
  if(!['cash','card'].includes(body.payment))fail('Choose cash or card.');integer(body.tendered,0,1000000000000,'Amount received');
  return this.transaction(()=>{
   const lines=body.items.map(i=>{string(i.id,80,'Product ID');integer(i.quantity,1,999,'Quantity');integer(i.expectedPrice,1,10000000,'Expected price');const p=this.db.prepare('SELECT * FROM products WHERE id=?').get(i.id);if(!p||p.archived||!p.available||(p.stockTracked&&p.stock<i.quantity)||p.price!==i.expectedPrice)fail('Stock or prices changed. Close checkout and review the basket.',409);return{...p,quantity:i.quantity};});
   const amounts=calculate(lines,discountRate,taxRate);if(body.payment==='cash'&&body.tendered<amounts.total)fail('Cash received is less than the total.');const tendered=body.payment==='cash'?body.tendered:amounts.total;
   this.db.prepare('INSERT INTO sales(id,createdAt,subtotal,discount,tax,total,taxRate,discountRate,payment,tendered,shopName) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(body.id,new Date().toISOString(),amounts.subtotal,amounts.discount,amounts.tax,amounts.total,taxRate,discountRate,body.payment,tendered,'Shanti Vikāsa');
   for(const p of lines){this.db.prepare('INSERT INTO sale_items(saleId,productId,name,code,quantity,price) VALUES(?,?,?,?,?,?)').run(body.id,p.id,p.name,p.code,p.quantity,p.price);this.db.prepare('UPDATE products SET stock=CASE WHEN stockTracked=1 THEN stock-? ELSE stock END,version=version+1 WHERE id=?').run(p.quantity,p.id);}
   return{sale:this.sale(body.id)};
  });
 }
 api(route,method,body={}){try{if(route==='/api/products'){if(method==='GET')return{status:200,body:{products:this.products()}};if(method==='POST'||method==='PATCH')return{status:method==='POST'?201:200,body:this.saveProduct(body,method==='PATCH')};}if(route==='/api/sales'){if(method==='GET')return{status:200,body:this.ledger()};if(method==='POST')return{status:200,body:this.checkout(body)};}return{status:404,body:{error:'Not found.'}};}catch(e){let message=e.message;if(/UNIQUE constraint failed: products.code/.test(message))return{status:409,body:{error:'That product code is already in use.'}};if(!e.status){console.error(e);message='The data could not be saved. Check disk space, then retry. Your sale will only be recorded once.';}return{status:e.status||503,body:{error:message}};}}
 backup(destination){if([this.file,this.file+'-wal',this.file+'-shm'].some(file=>path.resolve(file).toLowerCase()===path.resolve(destination).toLowerCase()))fail('Save the backup to a different file from the live database.');const temp=destination+'.'+randomUUID()+'.tmp';try{fs.mkdirSync(path.dirname(destination),{recursive:true});this.db.prepare('VACUUM INTO ?').run(temp);const file=fs.openSync(temp,'r+');fs.fsyncSync(file);fs.closeSync(file);fs.renameSync(temp,destination);return destination;}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
 automaticBackup(label='daily'){const folder=path.join(this.directory,'backups');fs.mkdirSync(folder,{recursive:true});const stamp=new Date().toISOString().slice(0,10);const file=path.join(folder,`${label}-${stamp}${label==='before-restore'?'-'+Date.now():''}.sqlite`);this.backup(file);const files=fs.readdirSync(folder).filter(f=>/^daily-.*\.sqlite$/.test(f)).sort().reverse();for(const f of files.slice(14))fs.unlinkSync(path.join(folder,f));return file;}
 inspectBackup(file){if(fs.statSync(file).size>512*1024*1024)fail('Choose a backup smaller than 512 MB.');const db=new DatabaseSync(file,{readOnly:true});try{if(db.prepare('PRAGMA application_id').get().application_id!==APP_ID||db.prepare('PRAGMA user_version').get().user_version!==1)fail('This is not a compatible Shanti Vikāsa backup.');if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')fail('This backup is damaged.');for(const [table,fields] of [['products',productFields],['sales',saleFields],['sale_items',['id',...itemFields]],['metadata',['key','value']]]){const row=db.prepare("SELECT type FROM sqlite_master WHERE name=?").get(table);if(row?.type!=='table')fail('The backup has an invalid structure.');const columns=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);if(fields.some(f=>!columns.includes(f)))fail('The backup has an incompatible structure.');}return{products:db.prepare('SELECT COUNT(*) as n FROM products WHERE archived=0').get().n,sales:db.prepare('SELECT COUNT(*) as n FROM sales').get().n};}finally{db.close();}}
 restore(file){this.inspectBackup(file);const safety=this.automaticBackup('before-restore');this.db.prepare('ATTACH DATABASE ? AS recovery').run(file);try{this.transaction(()=>{this.db.exec('DELETE FROM sale_items; DELETE FROM sales; DELETE FROM products; DELETE FROM metadata;');for(const [table,fields] of [['products',productFields],['sales',saleFields],['sale_items',['id',...itemFields]],['metadata',['key','value']]])this.db.exec(`INSERT INTO main.${table}(${fields}) SELECT ${fields} FROM recovery.${table}`);if(this.db.prepare('PRAGMA foreign_key_check').all().length)fail('The backup contains inconsistent receipts.');});}finally{this.db.exec('DETACH DATABASE recovery');}return safety;}
 close(){this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');this.db.close();}
}
module.exports={Store,calculate,APP_ID};
