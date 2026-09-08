'use strict';
const {Buffer}=require('node:buffer');
const {createHash}=require('node:crypto');
function validatePhoto(body){
 const bad=()=>{const e=new Error('Choose a JPG, PNG, or WebP photo up to 2 MB.');e.status=400;throw e;};
 if(!body||typeof body.data!=='string'||body.data.length>2800000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data))bad();
 const bytes=Buffer.from(body.data,'base64');if(bytes.length<12||bytes.length>2*1024*1024)bad();
 const mime=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
 if(!mime||mime!==body.mime)bad();return{bytes,mime,hash:createHash('sha256').update(bytes).digest('hex')};
}
module.exports={validatePhoto};
