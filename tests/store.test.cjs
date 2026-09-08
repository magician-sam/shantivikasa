const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Store,calculate}=require('../desktop/store.cjs');
const snapshot=require('../data/initial-snapshot.json');
const folder=()=>fs.mkdtempSync(path.join(os.tmpdir(),'shanti-check-'));
const bodyFor=(p,extra={})=>({id:randomUUID(),items:[{id:p.id,quantity:1,expectedPrice:p.price}],discountRate:0,taxRate:0,payment:'cash',tendered:p.price,...extra});

test('inventory and receipt snapshot persists without overwriting edits on restart',()=>{
 const dir=folder();let store;try{store=new Store(dir,snapshot);assert.equal(store.products().length,27);assert.equal(store.ledger().stats.count,snapshot.sales.length);const p=store.products()[0];store.saveProduct({...p,stock:8,stockTracked:1},true);store.close();store=new Store(dir,snapshot);assert.equal(store.products().find(x=>x.id===p.id).stock,8);assert.equal(store.products().find(x=>x.id===p.id).stockTracked,1);for(const sale of snapshot.sales)assert.equal(store.sale(sale.id).total,sale.total);}finally{store?.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('checkout is atomic, idempotent, stock-aware, and durable after reopening',()=>{
 const dir=folder();let store;try{store=new Store(dir,snapshot);const p=store.products()[0];store.saveProduct({...p,stock:2,stockTracked:1},true);const body=bodyFor(p);const result=store.checkout(body);assert.equal(result.sale.total,p.price);store.checkout(body);assert.equal(store.products().find(x=>x.id===p.id).stock,1);assert.equal(store.ledger().stats.count,snapshot.sales.length+1);
 const q=store.products()[1];const bad=bodyFor(q,{items:[{id:q.id,quantity:1,expectedPrice:q.price},{id:p.id,quantity:2,expectedPrice:p.price}],tendered:100000});assert.equal(store.api('/api/sales','POST',bad).status,409);assert.equal(store.sale(bad.id),null);assert.equal(store.products().find(x=>x.id===p.id).stock,1);
 assert.equal(store.api('/api/sales','POST',bodyFor(p,{tendered:0})).status,400);assert.equal(store.api('/api/sales','POST',bodyFor(p,{items:[{id:p.id,quantity:1,expectedPrice:1}]})).status,409);
 store.checkout(bodyFor(p));assert.equal(store.api('/api/sales','POST',bodyFor(p)).status,409);store.close();store=new Store(dir,snapshot);assert.equal(store.products().find(x=>x.id===p.id).stock,0);assert.equal(store.ledger().stats.count,snapshot.sales.length+2);
 }finally{store?.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('untracked products sell without invented stock and can be made unavailable',()=>{
 const dir=folder();const store=new Store(dir,snapshot);try{const p=store.products().find(p=>!p.stockTracked);store.checkout(bodyFor(p));assert.equal(store.products().find(x=>x.id===p.id).stock,0);const now=store.products().find(x=>x.id===p.id);store.saveProduct({...now,available:0},true);assert.equal(store.api('/api/sales','POST',bodyFor(p)).status,409);}finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('backups restore inventory and receipt history transactionally',()=>{
 const dir=folder();const store=new Store(dir,snapshot);try{const backup=path.join(dir,'saved.sqlite');const p=store.products()[0];assert.throws(()=>store.backup(store.file),/different file/);store.backup(backup);assert.equal(store.inspectBackup(backup).products,27);store.checkout(bodyFor(p));assert.equal(store.ledger().stats.count,snapshot.sales.length+1);store.restore(backup);assert.equal(store.ledger().stats.count,snapshot.sales.length);assert.equal(store.products().length,27);assert.ok(fs.readdirSync(path.join(dir,'backups')).some(n=>n.startsWith('before-restore')));const damaged=path.join(dir,'bad.sqlite');fs.writeFileSync(damaged,'not a sqlite database');assert.throws(()=>store.restore(damaged));assert.equal(store.ledger().stats.count,snapshot.sales.length);store.backup(backup);assert.equal(store.inspectBackup(backup).sales,snapshot.sales.length);}finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('money, stock limits and duplicate codes are validated',()=>{
 assert.deepEqual(calculate([{price:325,quantity:2},{price:250,quantity:1}],1000,1100),{subtotal:900,discount:90,tax:89,total:899});const dir=folder();const store=new Store(dir,snapshot);try{const p=store.products()[0];assert.equal(store.api('/api/products','POST',{...p,id:undefined}).status,409);assert.equal(store.api('/api/products','PATCH',{...p,stock:-1}).status,400);assert.equal(store.api('/api/products','PATCH',{...p,version:p.version+1}).status,409);}finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
