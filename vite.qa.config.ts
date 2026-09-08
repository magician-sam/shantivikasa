import {defineConfig,mergeConfig} from 'vite';
import base from './vite.config';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
// Development-only, isolated SQL data for exercising the actual product UI.
// This config is never imported by a production build or a server function.
export default mergeConfig(base,defineConfig({server:{host:'0.0.0.0',port:4173,allowedHosts:['terminal.local']},plugins:[{name:'isolated-register-qa',configureServer(server){
 const {Store}=require('./desktop/store.cjs');const store=new Store(mkdtempSync(join(tmpdir(),'shanti-browser-')),JSON.parse(readFileSync('data/initial-snapshot.json','utf8')));
 server.httpServer?.once('close',()=>store.close());server.middlewares.use(async(req,res,next)=>{
  const route=(req.url||'').split('?')[0];if(!route.startsWith('/api/'))return next();res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  if(route==='/api/session'){res.end(JSON.stringify({configured:true,authenticated:true}));return;}
  if(route.startsWith('/api/photos/')&&req.method==='GET'){const photo=store.photo(route.split('/').pop());if(!photo){res.statusCode=404;res.end('{}');return;}res.setHeader('Content-Type',photo.mime);res.end(photo.bytes);return;}
  try{const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks).toString();const r=store.api(route,req.method,raw?JSON.parse(raw):Object.fromEntries(new URL(req.url||'/', 'http://local').searchParams));res.statusCode=r.status;res.end(JSON.stringify(r.body));}catch{res.statusCode=500;res.end(JSON.stringify({error:'QA request failed.'}));}
 });
}}]}));
