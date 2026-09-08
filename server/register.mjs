import {Buffer} from 'node:buffer';
import model from '../shared/sync-model.cjs';
import categories from '../shared/categories.cjs';
const {defaults,normalizeCategory,categoryKey}=categories;
import reports from '../shared/reports.cjs';
import photos from '../shared/photos.cjs';
import {Repository} from './repository.mjs';
const {fail,int,validateProduct,amounts,applyEvent}=model;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function bodyOf(request,limit=3000000){
 if(!request.headers.get('content-type')?.startsWith('application/json'))fail('Send a JSON request.',415);
 if(Number(request.headers.get('content-length'))>limit)fail('Request too large.',413);
 const reader=request.body?.getReader();if(!reader)fail('Missing request body.');let size=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail('Request too large.',413);}chunks.push(value);}
 try{const body=JSON.parse(Buffer.concat(chunks).toString());if(!body||typeof body!=='object'||Array.isArray(body))fail('Invalid request.');return body;}catch{fail('Invalid JSON request.');}
}
export default {async fetch(request,env){
 const url=new URL(request.url);
 try{
  if(!env.authorized)return json({error:'Sign in to open your private shop register.'},401);
  if(url.pathname==='/desktop-connect')return new Response('<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Shanti Vikasa — Connected</title></head><body style="background:#f4efdf;color:#622a2b;font:18px Georgia;padding:48px;max-width:650px;margin:auto"><h1>Your register is connected.</h1><p>You can close this window and return to the Windows app. Your inventory and receipts will synchronize with your private online register.</p></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(!env.DB)fail('The online database is temporarily unavailable.',503);
  if(!['GET','POST','PATCH','DELETE','PUT'].includes(request.method))fail('Method not allowed.',405);
  const origin=request.headers.get('origin');if(origin&&origin!==url.origin)fail('Request not allowed.',403);
  const repo=new Repository(env.DB);
  if(url.pathname==='/api/sync'&&request.method==='GET'){const data=await repo.read();if((Number(request.headers.get('X-Shanti-Sync-Version'))<2&&data.snapshot.products.some(p=>!defaults.includes(p.category)))||(Number(request.headers.get('X-Shanti-Sync-Version'))<3&&data.snapshot.removedCategories.length))fail('Install Shanti Vikasa 1.0.3 or newer to sync custom categories. Your local data is kept.',426);return json(data);}
  if(url.pathname==='/api/reports'&&request.method==='GET')return json(reports.reportFor((await repo.read()).snapshot,Object.fromEntries(url.searchParams)));
  if(url.pathname==='/api/categories'){
   if(request.method==='GET')return json({categories:(await repo.read()).snapshot.categories});
   if(request.method==='DELETE'){const b=await bodyOf(request),name=normalizeCategory(b.name),id=crypto.randomUUID();await repo.mutate(id,state=>applyEvent(state,{id,kind:'category-delete',name}));return json({ok:true,categories:(await repo.read()).snapshot.categories});}
   if(request.method==='POST'){const b=await bodyOf(request),name=normalizeCategory(b.name);const id=crypto.randomUUID();await repo.mutate(id,state=>applyEvent(state,{id,kind:'category',name}));const names=(await repo.read()).snapshot.categories;return json({ok:true,name:names.find(n=>categoryKey(n)===categoryKey(name)),categories:names},201);}
  }
  if(url.pathname==='/api/sync/bootstrap'&&request.method==='POST'){
   const b=await bodyOf(request,16000000);for(const p of b.snapshot?.products||[])if(p.image?.startsWith('/api/photos/')&&!await env.BUCKET.head(p.image.slice(12)))fail('Upload all product photos before importing.');return json(await repo.bootstrap(b));
  }
  if(url.pathname==='/api/sync/events'&&request.method==='POST'){
   const event=await bodyOf(request);if(event.kind==='product'&&event.after?.image?.startsWith('/api/photos/')&&!await env.BUCKET.head(event.after.image.slice(12)))fail('Upload the product photo first.');return json(await repo.mutate(event.id,state=>applyEvent(state,event)));
  }
  if(url.pathname==='/api/photos'&&request.method==='POST'||/^\/api\/photos\/[a-f0-9]{64}$/.test(url.pathname)&&request.method==='PUT'){
   if(!env.BUCKET)fail('Photo storage is unavailable.',503);const photo=photos.validatePhoto(await bodyOf(request));
   if(request.method==='PUT'&&url.pathname.split('/').pop()!==photo.hash)fail('Photo checksum mismatch.');
   await env.BUCKET.put(photo.hash,photo.bytes,{httpMetadata:{contentType:photo.mime}});return json({image:'/api/photos/'+photo.hash},201);
  }
  if(/^\/api\/photos\/[a-f0-9]{64}$/.test(url.pathname)&&request.method==='GET'){
   const photo=await env.BUCKET.get(url.pathname.split('/').pop());if(!photo)return json({error:'Photo not found.'},404);
   if(url.searchParams.get('encoding')==='base64')return json({mime:photo.httpMetadata.contentType,data:Buffer.from(await photo.arrayBuffer()).toString('base64')});
   return new Response(photo.body,{headers:{'Content-Type':photo.httpMetadata.contentType,'Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
  }
  if(url.pathname==='/api/products'){
   if(request.method==='GET'){const d=await repo.read();return json({products:d.snapshot.products.filter(p=>!p.archived),categories:d.snapshot.categories,needsImport:!d.initialized});}
   if(['POST','PATCH','DELETE'].includes(request.method)){
    const b=await bodyOf(request);if(b.image?.startsWith('/api/photos/')&&!await env.BUCKET.head(b.image.slice(12)))fail('Upload the product photo first.');
    const id=crypto.randomUUID();return json(await repo.mutate(id,state=>{
     const before=request.method==='POST'?null:state.products.find(p=>p.id===b.id);
     if(request.method!=='POST'&&(!before||before.archived||before.version!==b.version))fail('This product changed. Refresh Inventory and try again.',409);
     let after;
     if(request.method==='DELETE')after={...before,archived:1,available:0,version:before.version+1};
     else after={...(before||{id:crypto.randomUUID(),version:1,image:'',sourceUrl:'',sourceProductId:'',sourceVariantId:'',archived:0}),...Object.fromEntries(['name','code','category','unit','icon','price','stock','stockTracked','available'].map(k=>[k,b[k]])),...(b.image!==undefined?{image:b.image}:{})};
     after.category=normalizeCategory(after.category);if(request.method!=='DELETE'&&(state.removedCategories||[]).some(n=>categoryKey(n)===categoryKey(after.category)))fail('This category was removed. Choose another category.',409);validateProduct(after);return applyEvent(state,{id,kind:'product',before,after});
    }));
   }
  }
  if(url.pathname==='/api/sales'){
   if(request.method==='GET'){const {snapshot}=await repo.read();return json({sales:snapshot.sales.slice(-100).reverse(),stats:{count:snapshot.sales.length,revenue:snapshot.sales.reduce((n,s)=>n+s.total,0)}});}
   if(request.method==='POST'){
    const b=await bodyOf(request);if(typeof b.id!=='string'||!/^[a-f0-9-]{36}$/i.test(b.id))fail('Invalid checkout ID.');
    await repo.mutate(b.id,state=>{
     const prior=state.sales.find(s=>s.id===b.id);if(prior)return{products:[],sale:null};
     if(!Array.isArray(b.items)||!b.items.length||b.items.length>100||new Set(b.items.map(i=>i.id)).size!==b.items.length)fail('Invalid basket.');
     int(b.discountRate,0,10000,'Discount');int(b.taxRate,0,10000,'Tax');int(b.tendered,0,1000000000000,'Amount received');
     if(!['cash','card'].includes(b.payment))fail('Choose cash or card.');const deltas={};
     const items=b.items.map(i=>{int(i.quantity,1,999,'Quantity');const p=state.products.find(p=>p.id===i.id);if(!p||p.archived||!p.available||p.price!==i.expectedPrice||(p.stockTracked&&p.stock<i.quantity))fail('Stock or prices changed. Review the basket.',409);deltas[p.id]=p.stockTracked?i.quantity:0;return{productId:p.id,name:p.name,code:p.code,quantity:i.quantity,price:p.price};});
     const total=amounts(items,b.discountRate,b.taxRate);if(b.payment==='cash'&&b.tendered<total.total)fail('Cash received is less than the total.');
     return applyEvent(state,{id:b.id,kind:'sale',stockDeltas:deltas,sale:{id:b.id,reference:'R-'+b.id,number:1,createdAt:new Date().toISOString(),shopName:'Shanti Vikāsa',items,...total,discountRate:b.discountRate,taxRate:b.taxRate,payment:b.payment,tendered:b.payment==='cash'?b.tendered:total.total}});
    });
    const d=await repo.read();return json({sale:d.snapshot.sales.find(s=>s.id===b.id)});
   }
  }
  return json({error:'Not found.'},404);
 }catch(e){if(!e.status)console.error('Register request failed',e.message);return json({error:e.status?e.message:'The online register is temporarily unavailable. Your unsaved input is still here; please retry.'},e.status||503);}
}};
