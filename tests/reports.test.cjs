const {test}=require('node:test');const assert=require('node:assert/strict');const {reportFor}=require('../shared/reports.cjs');
const product={id:'p',name:'Candle',code:'C1',category:'Other',price:1500,stock:6,stockTracked:1,available:1,archived:0};
const sale=(id,createdAt,extra={})=>({id,createdAt,number:1,items:[{productId:'p',name:'Candle at time of sale',code:'C1',quantity:2,price:1250}],subtotal:2500,discount:250,tax:113,total:2363,payment:'cash',...extra});
test('daily totals use local dates, recorded prices and discounted cash/card amounts',()=>{
 const data={products:[product,{...product,id:'u',stockTracked:0,stock:99}],sales:[sale('a','2026-09-06T22:30:00Z'),sale('b','2026-09-07T21:30:00Z',{payment:'card'}),sale('c','2026-09-07T10:00:00Z',{payment:'card'})]};
 const r=reportFor(data,{period:'day',date:'2026-09-07',timeZone:'Asia/Beirut'});assert.equal(r.summary.receipts,2);assert.equal(r.summary.unitsSold,4);assert.equal(r.summary.grossSales,5000);assert.equal(r.summary.discounts,500);assert.equal(r.summary.netSales,4500);assert.equal(r.summary.tax,226);assert.equal(r.summary.totalCollected,4726);assert.equal(r.summary.cash,2363);assert.equal(r.summary.card,2363);assert.equal(r.inventory.countedUnits,6);assert.equal(r.inventory.retailValue,9000);assert.equal(r.inventory.uncountedProducts,1);assert.equal(r.items.find(p=>p.id==='p').itemSales,5000);
});
test('weeks, month boundaries and leap days are exact and invalid dates are rejected',()=>{
 const data={products:[],sales:[sale('a','2026-09-06T12:00:00Z'),sale('b','2026-09-07T12:00:00Z'),sale('c','2026-09-13T23:59:59Z'),sale('d','2026-09-14T00:00:00Z')]};
 const r=reportFor(data,{period:'week',date:'2026-09-09',timeZone:'UTC'});assert.equal(r.start,'2026-09-07');assert.equal(r.end,'2026-09-13');assert.equal(r.summary.receipts,2);assert.equal(r.daily.length,7);
 const leap=reportFor({products:[],sales:[]},{period:'month',date:'2024-02-29',timeZone:'UTC'});assert.equal(leap.end,'2024-02-29');assert.equal(leap.daily.length,29);assert.equal(leap.summary.averageSale,0);
 assert.throws(()=>reportFor(data,{date:'2026-02-31'}),/valid report date/);assert.throws(()=>reportFor(data,{timeZone:'Fake/Zone'}),/time zone/);assert.throws(()=>reportFor(data,{period:'year'}),/monthly/);
});
test('reports include over 100 sales and historical items from removed products',()=>{
 const sales=Array.from({length:125},(_,i)=>sale(String(i),'2026-09-07T12:00:00Z'));const r=reportFor({products:[],sales},{period:'month',date:'2026-09-07',timeZone:'UTC'});assert.equal(r.sales.length,125);assert.equal(r.summary.receipts,125);assert.equal(r.items[0].unitsSold,250);assert.equal(r.items[0].archived,true);assert.equal(r.inventory.products,0);assert.equal(r.daily.reduce((n,d)=>n+d.totalCollected,0),r.summary.totalCollected);
});
