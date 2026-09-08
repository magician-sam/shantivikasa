'use strict';
const {normalizeCategory,categoryKey,categoryList}=require('./categories.cjs');
const fields=['id','name','code','category','unit','icon','price','stock','version','image','sourceUrl','sourceProductId','sourceVariantId','stockTracked','available','archived'];
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
const int=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail(`${label} is invalid.`);return v;};
function validateProduct(p){
 for(const [f,max] of [['id',80],['name',80],['code',80],['category',40],['unit',40],['icon',30]])if(typeof p[f]!=='string'||!p[f].trim()||p[f].length>max)fail(`Invalid product ${f}.`);
 if(!/^[A-Za-z0-9._-]+$/.test(p.code))fail('Invalid product code.');
 if(normalizeCategory(p.category)!==p.category)fail('Use a trimmed category name with single spaces.');
 int(p.price,1,10000000,'Price');int(p.stock,0,1000000,'Stock');int(p.version,1,Number.MAX_SAFE_INTEGER,'Version');
 for(const f of ['stockTracked','available','archived'])int(p[f],0,1,f);
 if(typeof p.image!=='string'||(p.image&&!/^\/(products\/[A-Za-z0-9._-]+\.(jpg|png|webp)|api\/photos\/[a-f0-9]{64})$/.test(p.image)))fail('Invalid product photo.');
 for(const f of ['sourceUrl','sourceProductId','sourceVariantId'])if(typeof p[f]!=='string'||p[f].length>2048)fail(`Invalid ${f}.`);
 if(p.sourceUrl&&!/^https:\/\/(www\.)?shantivikasa\.com\//.test(p.sourceUrl))fail('Invalid original shop link.');
 return Object.fromEntries(fields.map(f=>[f,p[f]]));
}
function amounts(items,discountRate,taxRate){const subtotal=items.reduce((n,i)=>n+i.price*i.quantity,0),discount=Math.round(subtotal*discountRate/10000),tax=Math.round((subtotal-discount)*taxRate/10000);return{subtotal,discount,tax,total:subtotal-discount+tax};}
function validateSale(s){
 if(typeof s.id!=='string'||!/^[a-f0-9-]{36}$/i.test(s.id))fail('Invalid sale ID.');
 if(typeof s.createdAt!=='string'||!Number.isFinite(Date.parse(s.createdAt)))fail('Invalid sale date.');
 if(!Array.isArray(s.items)||!s.items.length||s.items.length>100)fail('Invalid sale items.');
 if(new Set(s.items.map(i=>i.productId)).size!==s.items.length)fail('Duplicate sale lines.');
 for(const i of s.items){for(const f of ['productId','name','code'])if(typeof i[f]!=='string'||!i[f]||i[f].length>80)fail('Invalid sale item.');int(i.quantity,1,999,'Quantity');int(i.price,1,10000000,'Price');}
 int(s.discountRate,0,10000,'Discount');int(s.taxRate,0,10000,'Tax');
 const computed=amounts(s.items,s.discountRate,s.taxRate);for(const k of Object.keys(computed))if(s[k]!==computed[k])fail('Receipt amounts do not match.');
 if(!['cash','card'].includes(s.payment))fail('Invalid payment type.');int(s.tendered,s.total,1000000000000,'Amount received');
 if(typeof s.shopName!=='string'||s.shopName.length>100)fail('Invalid shop name.');
 return s;
}
function applyEvent(state,event){
 if(typeof event.id!=='string'||!/^[a-f0-9-]{36}$/i.test(event.id))fail('Invalid operation ID.');
 const next=structuredClone(state);let touched=[];
 if(event.kind==='category'){
  const name=normalizeCategory(event.name);next.removedCategories=(next.removedCategories||[]).filter(n=>categoryKey(n)!==categoryKey(name));
  next.categories=categoryList([...(next.categories||[]),name],next.products,next.removedCategories);
  return {state:next,products:[],sale:null};
 }
 if(event.kind==='category-delete'){
  const name=normalizeCategory(event.name);if(categoryKey(name)==='other')fail('Other is kept for products without a category.');
  next.removedCategories=[...new Set([...(next.removedCategories||[]).map(categoryKey),categoryKey(name)])];
  for(const p of next.products)if(categoryKey(p.category)===categoryKey(name)){p.category='Other';p.version++;touched.push(p);}
  next.categories=categoryList(next.categories||[],next.products,next.removedCategories);
  return {state:next,products:touched,sale:null};
 }
 if(event.kind==='product'){
  const after=validateProduct(event.after),before=event.before;
  if((next.removedCategories||[]).some(n=>categoryKey(n)===categoryKey(after.category)))after.category='Other';
  const remote=next.products.find(p=>p.id===after.id);
  if(before){
   validateProduct(before);if(before.id!==after.id||!remote)fail('This product no longer exists online.',409);
   const changed=fields.filter(f=>!['id','version'].includes(f)&&after[f]!==before[f]);
   if(remote.archived&&!before.archived&&changed.some(f=>f!=='archived'))fail(`${after.name} was removed online. Resolve this edit before syncing.`,409);
   const conflict=changed.filter(f=>remote[f]!==before[f]&&remote[f]!==after[f]);
   if(changed.includes('archived')&&fields.some(f=>f!=='version'&&remote[f]!==before[f]&&f!=='archived'))conflict.push('removal');
   if(conflict.length)fail(`${after.name}: ${[...new Set(conflict)].join(', ')} changed online. Choose which edit to keep.`,409);
   const updated={...remote,...Object.fromEntries(changed.map(f=>[f,after[f]])),version:remote.version+1};validateProduct(updated);
   next.products[next.products.findIndex(p=>p.id===after.id)]=updated;touched=[updated];
  }else{if(remote)fail('This product already exists online.',409);next.products.push(after);touched=[after];}
  if(next.products.some(p=>p.id!==after.id&&p.code===after.code))fail('That product code is already in use online (including removed products).',409);
 }else if(event.kind==='sale'){
  const sale=validateSale(event.sale);
  if(next.sales.some(s=>s.id===sale.id))return {state:next,products:[],sale:null};
  if(!event.stockDeltas||typeof event.stockDeltas!=='object')fail('Missing stock changes.');
  if(Object.keys(event.stockDeltas).some(id=>!sale.items.some(i=>i.productId===id)))fail('Invalid stock changes.');
  for(const item of sale.items){
   const p=next.products.find(p=>p.id===item.productId);if(!p)fail(`${item.name} is missing online.`,409);
   const delta=event.stockDeltas[item.productId]??0;int(delta,0,item.quantity,'Stock change');
   if(delta!==0&&delta!==item.quantity)fail('Invalid stock change.');
   if(delta&&p.stock<delta)fail(`${item.name}: this offline sale needs ${delta} units, but online stock is ${p.stock}. Correct its online stock, then retry. The local receipt is safe.`,409);
   if(!!delta!==!!p.stockTracked)fail(`${item.name}: stock tracking changed online. Restore its previous tracking setting, then retry this offline sale.`,409);
   p.stock-=delta;p.version++;touched.push(p);
  }
  sale.number=Math.max(0,...next.sales.map(s=>s.number))+1;next.sales.push(sale);
  return {state:next,products:touched,sale};
 }else fail('Unknown sync operation.');
 next.categories=categoryList(next.categories||[],next.products,next.removedCategories||[]);
 return {state:next,products:touched,sale:null};
}
module.exports={fields,fail,int,validateProduct,validateSale,amounts,applyEvent};
