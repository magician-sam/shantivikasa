import {createClient} from '@libsql/client/web';
import {Buffer} from 'node:buffer';
export function sqlAdapter(client){
 class Statement{
  constructor(sql,args=[]){this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.sql,args);}
  async first(){const result=await client.execute({sql:this.sql,args:this.args});return result.rows[0]||null;}
 }
 return {prepare:sql=>new Statement(sql),batch:async statements=>(await client.batch(statements.map(s=>({sql:s.sql,args:s.args})),'write')).map(r=>({results:r.rows}))};
}
export function photoAdapter(client){return{
 async head(hash){return(await client.execute({sql:'SELECT hash FROM cloud_photos WHERE hash=?',args:[hash]})).rows[0]||null;},
 async put(hash,bytes,options){await client.execute({sql:'INSERT INTO cloud_photos(hash,mime,bytes) VALUES(?,?,?) ON CONFLICT(hash) DO NOTHING',args:[hash,options.httpMetadata.contentType,bytes]});},
 async get(hash){const r=(await client.execute({sql:'SELECT mime,bytes FROM cloud_photos WHERE hash=?',args:[hash]})).rows[0];if(!r)return null;const data=Buffer.from(r.bytes);return{body:data,httpMetadata:{contentType:r.mime},arrayBuffer:async()=>data};}
};}
let client;
export function getClient(){if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN)throw new Error('Online database has not been connected.');return client??=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});}
