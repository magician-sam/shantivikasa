'use strict';
const fail=message=>{const e=new Error(message);e.status=400;throw e;};
const iso=date=>date.toISOString().slice(0,10);
function reportFor(snapshot,{period='day',date,timeZone='Asia/Beirut'}={}){
 if(!['day','week','month'].includes(period))fail('Choose a daily, weekly, or monthly report.');
 let formatter;try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});}catch{fail('Choose a valid time zone.');}
 const localDate=value=>{const parts=Object.fromEntries(formatter.formatToParts(new Date(value)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
 date=date||localDate(Date.now());
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'1900-01-01')fail('Choose a valid report date.');
 const anchor=new Date(date+'T00:00:00Z');if(!Number.isFinite(anchor.getTime())||iso(anchor)!==date)fail('Choose a valid report date.');
 const start=new Date(anchor);if(period==='week')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);if(period==='month')start.setUTCDate(1);
 const end=new Date(start);if(period==='month')end.setUTCMonth(end.getUTCMonth()+1);else end.setUTCDate(end.getUTCDate()+(period==='week'?7:1));
 const first=iso(start),after=iso(end),last=iso(new Date(end.getTime()-86400000));
 const sales=snapshot.sales.filter(s=>{const d=localDate(s.createdAt);return d>=first&&d<after;}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const summary={receipts:sales.length,unitsSold:0,grossSales:0,discounts:0,netSales:0,tax:0,totalCollected:0,cash:0,card:0,averageSale:0};
 const items=new Map(snapshot.products.map(p=>[p.id,{id:p.id,name:p.name,code:p.code,category:p.category,unitsSold:0,itemSales:0,stock:p.stockTracked?p.stock:null,archived:!!p.archived,available:!!p.available,price:p.price}]));
 const daily=new Map();for(const d=new Date(start);d<end;d.setUTCDate(d.getUTCDate()+1))daily.set(iso(d),{date:iso(d),receipts:0,unitsSold:0,netSales:0,tax:0,totalCollected:0});
 for(const s of sales){summary.grossSales+=s.subtotal;summary.discounts+=s.discount;summary.tax+=s.tax;summary.totalCollected+=s.total;summary[s.payment]+=s.total;
  const day=daily.get(localDate(s.createdAt));day.receipts++;day.netSales+=s.subtotal-s.discount;day.tax+=s.tax;day.totalCollected+=s.total;
  for(const line of s.items){summary.unitsSold+=line.quantity;day.unitsSold+=line.quantity;let row=items.get(line.productId);if(!row){row={id:line.productId,name:line.name,code:line.code,category:'Removed product',unitsSold:0,itemSales:0,stock:null,archived:true,available:false,price:line.price};items.set(line.productId,row);}row.unitsSold+=line.quantity;row.itemSales+=line.price*line.quantity;}
 }
 summary.netSales=summary.grossSales-summary.discounts;summary.averageSale=summary.receipts?Math.round(summary.totalCollected/summary.receipts):0;
 const active=snapshot.products.filter(p=>!p.archived),tracked=active.filter(p=>p.stockTracked);
 const inventory={products:active.length,countedUnits:tracked.reduce((n,p)=>n+p.stock,0),retailValue:tracked.reduce((n,p)=>n+p.stock*p.price,0),uncountedProducts:active.filter(p=>!p.stockTracked).length,lowStock:tracked.filter(p=>p.stock<=8).length,outOfStock:tracked.filter(p=>p.stock===0).length};
 return{period,date,timeZone,start:first,end:last,summary,inventory,daily:[...daily.values()],items:[...items.values()].filter(p=>!p.archived||p.unitsSold).sort((a,b)=>b.unitsSold-a.unitsSold||a.name.localeCompare(b.name)),sales};
}
module.exports={reportFor};
