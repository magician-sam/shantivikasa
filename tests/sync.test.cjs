const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Store}=require('../desktop/store.cjs');
const {SyncEngine}=require('../desktop/sync.cjs');
const fixture=require('../data/initial-snapshot.json');
async function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shanti-sync-'));
 const {createClient}=await import('@libsql/client');const client=createClient({url:'file::memory:'});
 const {sqlAdapter,photoAdapter}=await import('../server/turso.mjs');
 const handler=(await import('../server/register.mjs')).default;
 for(const file of fs.readdirSync(path.join(__dirname,'../drizzle')).filter(n=>n.endsWith('.sql')))await client.executeMultiple(fs.readFileSync(path.join(__dirname,'../drizzle',file),'utf8'));
 const env={authorized:true,DB:sqlAdapter(client),BUCKET:photoAdapter(client)};
 const store=new Store(path.join(dir,'desktop'),structuredClone(fixture));
 const request=async(route,method,body)=>{
  const r=await handler.fetch(new Request('https://shop.test'+route,{method,headers:{'Content-Type':'application/json','oai-authenticated-user-id':'owner','Origin':'https://shop.test','X-Shanti-Sync-Version':'3'},...(body?{body:JSON.stringify(body)}:{})}),env);
  const data=await r.json();if(!r.ok){const e=new Error(data.error);e.status=r.status;throw e;}return data;
 };
 const engine=new SyncEngine(store,request);
 return{dir,client,store,request,engine,env,handler,close:async()=>{store.close();client.close();await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:20,retryDelay:100});}};
}
function edit(store,id,values){const p=store.products().find(p=>p.id===id);const r=store.api('/api/products','PATCH',{...p,...values});assert.equal(r.status,200,r.body.error);}
function sale(store,p,quantity=1){const body={id:randomUUID(),items:[{id:p.id,quantity,expectedPrice:p.price}],discountRate:0,taxRate:0,payment:'cash',tendered:100000000};const r=store.api('/api/sales','POST',body);assert.equal(r.status,200,r.body.error);return r.body.sale;}
test('two-way updates, durable offline queue, photo replication and inventory removal preserve receipts',async()=>{
 const x=await setup();try{
  assert.equal((await x.engine.run()).state,'synced');assert.equal((await x.request('/api/products','GET')).products.length,27);
  const id=x.store.products()[0].id;edit(x.store,id,{stockTracked:1,stock:20});assert.equal(x.store.pendingEvents().length,1);await x.engine.run();
  const photo=x.store.putPhoto({mime:'image/jpeg',data:fs.readFileSync(path.join(__dirname,'../public/products/7799999791203.jpg')).toString('base64')});edit(x.store,id,{image:photo.image});await x.engine.run();
  assert.equal((await x.request('/api/products','GET')).products.find(p=>p.id===id).image,photo.image);
  const r=await x.request(photo.image+'?encoding=base64','GET');assert.equal(r.data,Buffer.from(x.store.photo(photo.image.split('/').pop()).bytes).toString('base64'));
  let online=(await x.request('/api/products','GET')).products.find(p=>p.id===id);await x.request('/api/products','PATCH',{...online,name:'Edited online',image:''});await x.engine.run();assert.equal(x.store.products().find(p=>p.id===id).name,'Edited online');assert.equal(x.store.products().find(p=>p.id===id).image,'');
  const p=x.store.products().find(p=>p.id===id),receipt=sale(x.store,p,2);assert.equal(x.store.pendingEvents().length,1);
  x.engine.request=async()=>{throw new Error('Offline')};assert.equal((await x.engine.run()).state,'offline');assert(x.store.sale(receipt.id));assert.equal(x.store.pendingEvents().length,1);
  x.engine.request=x.request;await x.engine.run();online=(await x.request('/api/products','GET')).products.find(p=>p.id===id);assert.equal(online.stock,18);
  await x.request('/api/products','DELETE',{id,version:online.version});await x.engine.run();assert(!x.store.products().some(p=>p.id===id));assert(x.store.sale(receipt.id));assert.equal(x.store.snapshot().products.find(p=>p.id===id).archived,1);
 }finally{await x.close();}
});
test('lost upload acknowledgement replays once after restart and does not duplicate sales',async()=>{
 const x=await setup();try{
  await x.engine.run();const id=x.store.products()[0].id;edit(x.store,id,{stockTracked:1,stock:10});await x.engine.run();
  const receipt=sale(x.store,x.store.products().find(p=>p.id===id),3);const event=x.store.pendingEvents()[0];
  x.engine.request=async(route,...args)=>{const result=await x.request(route,...args);if(route==='/api/sync/events')throw new Error('Connection lost after server commit');return result;};
  assert.equal((await x.engine.run()).state,'offline');assert.equal(x.store.pendingEvents().length,1);
  const backup=path.join(x.dir,'pending.sqlite');x.store.backup(backup);const {DatabaseSync}=require('node:sqlite');const check=new DatabaseSync(backup);assert.equal(check.prepare('SELECT count(*) n FROM sync_outbox').get().n,1);check.close();
  const restarted=new SyncEngine(x.store,x.request);await restarted.run();assert.equal(x.store.pendingEvents().length,0);assert.equal(x.store.products().find(p=>p.id===id).stock,7);
  const online=await x.request('/api/sync','GET');assert.equal(online.snapshot.sales.filter(s=>s.id===receipt.id).length,1);await x.request('/api/sync/events','POST',event);assert.equal((await x.request('/api/products','GET')).products.find(p=>p.id===id).stock,7);
 }finally{await x.close();}
});
test('same-field conflict is explicit and resolvable; unrelated fields merge',async()=>{
 const x=await setup();try{
  await x.engine.run();const id=x.store.products()[0].id;edit(x.store,id,{name:'Local name'});
  let remote=(await x.request('/api/products','GET')).products.find(p=>p.id===id);await x.request('/api/products','PATCH',{...remote,price:remote.price+50});await x.engine.run();assert.equal(x.store.products().find(p=>p.id===id).price,remote.price+50);
  edit(x.store,id,{name:'Newest local name'});remote=(await x.request('/api/products','GET')).products.find(p=>p.id===id);await x.request('/api/products','PATCH',{...remote,name:'Online name'});
  const status=await x.engine.run();assert.equal(status.state,'conflict');assert.equal(x.store.products().find(p=>p.id===id).name,'Newest local name');assert.equal(x.store.pendingEvents().length,1);
  assert.equal((await x.engine.resolve('local')).state,'synced');assert.equal((await x.request('/api/products','GET')).products.find(p=>p.id===id).name,'Newest local name');
 }finally{await x.close();}
});
test('concurrent web checkouts cannot oversell and failed offline sale remains recoverable',async()=>{
 const x=await setup();try{
  await x.engine.run();const id=x.store.products()[0].id;edit(x.store,id,{stockTracked:1,stock:1});await x.engine.run();const p=x.store.products().find(p=>p.id===id);
  const checkout=()=>x.request('/api/sales','POST',{id:randomUUID(),items:[{id,quantity:1,expectedPrice:p.price}],discountRate:0,taxRate:0,payment:'cash',tendered:p.price});
  const results=await Promise.allSettled([checkout(),checkout()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await x.request('/api/products','GET')).products.find(p=>p.id===id).stock,0);
  const localSale=sale(x.store,p);assert.equal((await x.engine.run()).state,'conflict');assert(x.store.sale(localSale.id));assert.equal(x.store.pendingEvents().length,1);
  const remote=(await x.request('/api/products','GET')).products.find(p=>p.id===id);await x.request('/api/products','PATCH',{...remote,stock:1});await x.engine.run();assert.equal(x.store.pendingEvents().length,0);assert.equal(x.store.products().find(p=>p.id===id).stock,0);
 }finally{await x.close();}
});
test('a local edit during pull is sent before incoming data is applied',async()=>{
 const x=await setup();try{
  await x.engine.run();const id=x.store.products()[0].id;let inject=true;
  x.engine.request=async(route,...args)=>{const result=await x.request(route,...args);if(route==='/api/sync'&&inject){inject=false;edit(x.store,id,{name:'Edited while downloading'});}return result;};
  await x.engine.run();assert.equal(x.store.products().find(p=>p.id===id).name,'Edited while downloading');assert.equal((await x.request('/api/products','GET')).products.find(p=>p.id===id).name,'Edited while downloading');
 }finally{await x.close();}
});
test('first import retry recovers from lost acknowledgement without replacing new local edits',async()=>{
 const x=await setup();try{
  let lose=true;x.engine.request=async(route,...args)=>{const result=await x.request(route,...args);if(route==='/api/sync/bootstrap'&&lose){lose=false;throw new Error('Lost acknowledgement');}return result;};
  assert.equal((await x.engine.run()).state,'offline');const id=x.store.products()[0].id;edit(x.store,id,{name:'Edited after interrupted connection'});assert.equal(x.store.pendingEvents().length,1);
  assert.equal((await x.engine.run()).state,'synced');assert.equal((await x.request('/api/products','GET')).products.find(p=>p.id===id).name,'Edited after interrupted connection');
 }finally{await x.close();}
});
test('photos survive clean-directory restore; old schema 1 upgrades preserve stock and receipts',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shanti-upgrade-'));const oldSource=path.join(__dirname,'fixtures/store-v1.cjs');
 const {Store:Old}=require(oldSource);const original=new Old(path.join(dir,'data'),structuredClone(fixture));const id=original.products()[0].id;const p=original.products()[0];original.saveProduct({...p,name:'Real shop count',stockTracked:1,stock:17},true);original.checkout({id:randomUUID(),items:[{id:p.id,quantity:1,expectedPrice:p.price}],discountRate:0,taxRate:0,payment:'cash',tendered:p.price});original.backup(path.join(dir,'v1.sqlite'));original.close();
 const upgraded=new Store(path.join(dir,'data'),fixture);let fresh;
 try{
  assert.equal(upgraded.products().find(p=>p.id===id).stock,16);assert.equal(upgraded.ledger().stats.count,fixture.sales.length+1);
  const data=fs.readFileSync(path.join(__dirname,'../public/products/7799999791203.jpg')).toString('base64');const image=upgraded.putPhoto({mime:'image/jpeg',data}).image;edit(upgraded,id,{image});upgraded.backup(path.join(dir,'photos.sqlite'));
  fresh=new Store(path.join(dir,'clean'),fixture);fresh.restore(path.join(dir,'photos.sqlite'));assert.equal(fresh.products().find(p=>p.id===id).image,image);assert.equal(Buffer.from(fresh.photo(image.split('/').pop()).bytes).toString('base64'),data);
  edit(fresh,id,{image:''});assert.equal(fresh.products().find(p=>p.id===id).image,'');fresh.restore(path.join(dir,'v1.sqlite'));assert.equal(fresh.products().find(p=>p.id===id).stock,16);assert(!fresh.meta('cloud-linked'));
 }finally{upgraded.close();fresh?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('unauthenticated and cross-origin API requests cannot read or mutate data',async()=>{
 const x=await setup();try{
  assert.equal((await x.handler.fetch(new Request('https://shop.test/api/products'),{...x.env,authorized:false})).status,401);
  assert.equal((await x.handler.fetch(new Request('https://shop.test/api/products',{headers:{'oai-authenticated-user-id':'owner',Origin:'https://evil.test'}}),x.env)).status,403);
  assert.equal(x.store.api('/api/photos','POST',{mime:'image/svg+xml',data:Buffer.from('<svg onload=alert(1)></svg>').toString('base64')}).status,400);
 }finally{await x.close();}
});

test('empty categories persist offline, merge across devices, and stay usable after restart',async()=>{
 const x=await setup();let second;try{
  await x.engine.run();second=new Store(path.join(x.dir,'second'),fixture);const engine2=new SyncEngine(second,x.request);assert.equal((await engine2.run({join:true})).state,'synced');
  assert.equal(x.store.api('/api/categories','POST',{name:'  Candles  '}).status,201);
  second.addCategory('candles');second.addCategory('Jewellery');
  assert.equal(x.store.pendingEvents()[0].kind,'category');
  assert.equal((await x.engine.run()).state,'synced');assert.equal((await engine2.run()).state,'synced');await x.engine.run();
  assert.deepEqual(x.store.categories(),second.categories());assert.equal(x.store.categories().filter(n=>n.toLowerCase()==='candles').length,1);
  await x.request('/api/categories','POST',{name:'Gift boxes'});await x.engine.run();assert(x.store.categories().includes('Gift boxes'));
  const p=x.store.products()[0];edit(x.store,p.id,{category:'Candles'});assert.equal((await x.engine.run()).state,'synced');await engine2.run();assert.equal(second.products().find(q=>q.id===p.id).category,'Candles');
  // Remove its last product: the category must remain available.
  const now=x.store.products().find(q=>q.id===p.id);x.store.archiveProduct(now);await x.engine.run();await engine2.run();assert(second.categories().includes('Candles'));
  const dir=second.directory;second.close();second=new Store(dir,fixture);assert(second.categories().includes('Gift boxes'));assert(second.categories().includes('Jewellery'));
 }finally{second?.close();await x.close();}
});
test('category retry after lost acknowledgement is idempotent and local additions during pull survive',async()=>{
 const x=await setup();try{
  await x.engine.run();x.store.addCategory('Candles');let lose=true;
  x.engine.request=async(route,...args)=>{const result=await x.request(route,...args);if(route==='/api/sync/events'&&lose){lose=false;throw new Error('Lost acknowledgement');}return result;};
  assert.equal((await x.engine.run()).state,'offline');assert.equal(x.store.pendingEvents().length,1);
  assert.equal((await x.engine.run()).state,'synced');assert.equal(x.store.pendingEvents().length,0);
  let inject=true;x.engine.request=async(route,...args)=>{const result=await x.request(route,...args);if(route==='/api/sync'&&inject){inject=false;x.store.addCategory('Added during sync');}return result;};
  await x.engine.run();const names=(await x.request('/api/categories','GET')).categories;assert.equal(names.filter(n=>n==='Candles').length,1);assert(names.includes('Added during sync'));
 }finally{await x.close();}
});
test('blank, reserved and oversized category names fail; Unicode and duplicate names are handled',async()=>{
 const x=await setup();try{
  await x.engine.run();for(const name of ['', '  ', 'All goods','all   goods','a'.repeat(41),'Bad\nName',null]){
   assert.equal(x.store.api('/api/categories','POST',{name}).status,400);
   await assert.rejects(x.request('/api/categories','POST',{name}),e=>e.status===400);
  }
  x.store.addCategory('  Café   gifts  ');x.store.addCategory('CAFE\u0301 GIFTS');assert.equal(x.store.categories().filter(n=>n.toLowerCase()==='café gifts').length,1);
  await Promise.all([x.request('/api/categories','POST',{name:'Candles'}),x.request('/api/categories','POST',{name:'candles'}),x.request('/api/categories','POST',{name:'Gifts'})]);
  await x.engine.run();const names=x.store.categories();assert(names.includes('Café gifts'));assert(names.includes('Gifts'));assert.equal(names.filter(n=>n.toLowerCase()==='candles').length,1);
 }finally{await x.close();}
});
test('categories and product assignments survive backup and restore together with photos and receipts',async()=>{
 const x=await setup();let restored;try{
  await x.engine.run();x.store.addCategory('Candles');x.store.addCategory('Empty category');const p=x.store.products()[0];edit(x.store,p.id,{category:'Candles'});const receipt=sale(x.store,p);
  const image=x.store.putPhoto({mime:'image/jpeg',data:fs.readFileSync(path.join(__dirname,'../public/products/7799999791203.jpg')).toString('base64')}).image;edit(x.store,p.id,{image});
  const backup=path.join(x.dir,'categories.sqlite');x.store.backup(backup);restored=new Store(path.join(x.dir,'restored'),fixture);restored.restore(backup);
  assert.deepEqual(restored.categories(),x.store.categories());assert.equal(restored.products().find(q=>q.id===p.id).category,'Candles');assert.equal(restored.products().find(q=>q.id===p.id).image,image);assert(restored.photo(image.split('/').pop()));assert(restored.sale(receipt.id));assert(!restored.meta('cloud-linked'));assert.equal(restored.pendingEvents().length,0);
 }finally{restored?.close();await x.close();}
});
test('old desktop clients get a clear upgrade response, and new clients preserve data against old servers',async()=>{
 const x=await setup();try{
  await x.engine.run();const legacy=()=>x.handler.fetch(new Request('https://shop.test/api/sync'),x.env);assert.equal((await legacy()).status,200);
  x.store.addCategory('Candles');edit(x.store,x.store.products()[0].id,{category:'Candles'});await x.engine.run();const response=await legacy();assert.equal(response.status,426);assert.match((await response.json()).error,/1.0.3/);
  const before=x.store.snapshot();x.engine.request=async(route,...args)=>{const d=await x.request(route,...args);delete d.syncProtocol;delete d.snapshot?.categories;return d;};
  const status=await x.engine.run();assert.equal(status.state,'offline');assert.match(status.message,/website needs/);assert.deepEqual(x.store.snapshot(),before);
 }finally{await x.close();}
});
test('upgrading the actual 1.0.1 store preserves receipts, photos and pending events and saves a pre-upgrade backup',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shanti-v3-'));const {Store:Old}=require('./fixtures/store-v3.cjs');let old=new Old(dir,fixture),upgraded;
 try{
  old.setMeta('cloud-linked','1');old.setMeta('cloud-url','https://shop.test');const p=old.products()[0];old.saveProduct({...p,name:'Existing shop edit',stockTracked:1,stock:12},true);const receipt=sale(old,old.products().find(q=>q.id===p.id));
  const photo=old.putPhoto({mime:'image/jpeg',data:fs.readFileSync(path.join(__dirname,'../public/products/7799999791203.jpg')).toString('base64')});old.saveProduct({...old.products().find(q=>q.id===p.id),image:photo.image},true);
  const before=old.snapshot(),pending=old.pendingEvents();old.close();old=null;upgraded=new Store(dir,fixture);
  assert.deepEqual(upgraded.snapshot().products,before.products);assert.deepEqual(upgraded.snapshot().sales,before.sales);assert.deepEqual(upgraded.pendingEvents(),pending);assert(upgraded.sale(receipt.id));assert(upgraded.photo(photo.image.split('/').pop()));assert.equal(upgraded.meta('cloud-url'),'https://shop.test');assert.equal(upgraded.db.prepare('PRAGMA user_version').get().user_version,5);
  const backup=fs.readdirSync(path.join(dir,'backups')).find(n=>n.startsWith('before-category-upgrade-'));assert(backup);const {DatabaseSync}=require('node:sqlite');const b=new DatabaseSync(path.join(dir,'backups',backup));assert.equal(b.prepare('PRAGMA user_version').get().user_version,3);b.close();
 }finally{old?.close();upgraded?.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('removing categories moves products to Other without resurrection after stale edits or sales',async()=>{
 const x=await setup();let second;try{
  await x.engine.run();x.store.addCategory('Candles');const id=x.store.products()[0].id;edit(x.store,id,{category:'Candles'});await x.engine.run();
  second=new Store(path.join(x.dir,'offline-pc'),fixture);const engine2=new SyncEngine(second,x.request);await engine2.run({join:true});edit(second,id,{name:'Offline product edit'});
  const receipts=x.store.ledger().stats.count;await x.request('/api/categories','DELETE',{name:'Candles'});await x.engine.run();assert(!x.store.categories().includes('Candles'));assert.equal(x.store.products().find(p=>p.id===id).category,'Other');assert.equal(x.store.ledger().stats.count,receipts);
  assert.equal((await engine2.run()).state,'synced');await x.engine.run();assert.equal(x.store.products().find(p=>p.id===id).category,'Other');assert.equal(x.store.products().find(p=>p.id===id).name,'Offline product edit');assert(!x.store.categories().includes('Candles'));
  x.store.removeCategory('Raw crystals');sale(x.store,x.store.products()[0]);await x.engine.run();assert(!x.store.categories().includes('Raw crystals'));assert(!(await x.request('/api/categories','GET')).categories.includes('Raw crystals'));
  await x.request('/api/categories','POST',{name:'Candles'});await x.engine.run();assert(x.store.categories().includes('Candles'));assert.equal(x.store.api('/api/categories','DELETE',{name:'Other'}).status,400);await assert.rejects(x.request('/api/categories','DELETE',{name:'Other'}),e=>e.status===400);
 }finally{second?.close();await x.close();}
});
test('offline category removal survives restart and backup, including default categories',async()=>{
 const x=await setup();let restored;try{
  await x.engine.run();x.store.removeCategory('Incense holders');const backup=path.join(x.dir,'removed.sqlite');x.store.backup(backup);restored=new Store(path.join(x.dir,'new-pc'),fixture);restored.restore(backup);assert(!restored.categories().includes('Incense holders'));assert(!restored.products().some(p=>p.category==='Incense holders'));
  const event=x.store.pendingEvents()[0];assert.equal(event.kind,'category-delete');await x.engine.run();await x.request('/api/sync/events','POST',event);assert(!(await x.request('/api/categories','GET')).categories.includes('Incense holders'));
 }finally{restored?.close();await x.close();}
});
test('web and desktop reports agree after synchronization',async()=>{
 const x=await setup();try{await x.engine.run();const p=x.store.products()[0];sale(x.store,p,2);await x.engine.run();const args={period:'month',date:new Date().toISOString().slice(0,10),timeZone:'UTC'};const local=x.store.api('/api/reports','GET',args);assert.equal(local.status,200);const online=await x.request('/api/reports?'+new URLSearchParams(args),'GET');assert.deepEqual(online,JSON.parse(JSON.stringify(local.body)));}finally{await x.close();}
});
