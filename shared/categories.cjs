'use strict';
const defaults=['Raw crystals','Incense holders','Incense sticks','Other'];
function normalizeCategory(value){
 const error=message=>{const e=new Error(message);e.status=400;throw e;};
 if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))error('Enter a category name using 1 to 40 characters.');
 const name=value.normalize('NFC').trim().replace(/\s+/gu,' ');
 if(!name||name.length>40)error('Enter a category name using 1 to 40 characters.');
 if(name.toLowerCase()==='all goods')error('“All goods” is reserved. Choose another category name.');
 return name;
}
const categoryKey=value=>normalizeCategory(value).toLowerCase();
function categoryList(names=[],products=[],removed=[]){
 if(!Array.isArray(names)||names.length>10000||!Array.isArray(removed)||removed.length>10000){const e=new Error('Invalid category list.');e.status=400;throw e;}
 const deleted=new Set(removed.map(categoryKey));deleted.delete(categoryKey("Other"));
 const found=new Map();
 for(const raw of [...defaults,...names,...products.map(p=>p.category)]){const name=normalizeCategory(raw),key=categoryKey(name);if(!deleted.has(key)&&!found.has(key))found.set(key,name);}
 return [...defaults.filter(n=>found.has(categoryKey(n))),...[...found.values()].filter(n=>!defaults.includes(n)).sort((a,b)=>a.localeCompare(b))];
}
module.exports={defaults,normalizeCategory,categoryKey,categoryList};
