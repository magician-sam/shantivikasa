'use strict';
const {randomUUID}=require('node:crypto');
class SyncEngine{
 constructor(store,request,{onChange=()=>{}}={}){this.store=store;this.request=request;this.onChange=onChange;this.running=false;this.status={state:'disconnected',message:'Saved on this computer',lastSync:null};}
 info(){return {...this.status,pending:this.store.pendingEvents().length,linked:!!this.store.meta('cloud-linked')};}
 async readOnline(){const online=await this.request('/api/sync','GET');if(online.syncProtocol!==3){const e=new Error('The website needs the 1.0.3 category update before syncing. Your local data is kept.');e.status=426;throw e;}return online;}
 async run({join=false}={}){
  if(this.running)return this.info();this.running=true;this.status={...this.status,state:'syncing',message:'Syncing…'};
  try{
   if(!this.store.meta('cloud-linked')){
    this.store.syncLocked=true;
    const online=await this.readOnline();
    if(online.initialized&&online.bootstrapId!==this.store.meta('cloud-bootstrap-id')){
     if(!join){const e=new Error('The online register already has data. Use “Download online data” to connect this computer after making a safety backup.');e.status=412;throw e;}
     this.store.automaticBackup('before-connect');await this.downloadPhotos(online.snapshot);this.store.replaceFromCloud(online.snapshot);this.store.db.exec('DELETE FROM sync_outbox');
    }else if(!online.initialized){
     const importId=this.store.meta('cloud-bootstrap-id')||randomUUID();this.store.setMeta('cloud-bootstrap-id',importId);
     const initial=this.store.snapshot();await this.uploadPhotos(initial.products);await this.request('/api/sync/bootstrap','POST',{id:importId,snapshot:initial});this.store.db.exec('DELETE FROM sync_outbox');
    }
    this.store.setMeta('cloud-linked','1');this.store.syncLocked=false;
   }
   // Every event is written in the same SQLite transaction as the local sale/edit.
   // An acknowledged response can be lost: operation IDs make retries harmless.
   let processed=0;
   while(true){
    const event=this.store.pendingEvents()[0];
    if(event){
     if(++processed>500)throw new Error('More changes are waiting. Sync will continue shortly.');
     if(event.kind==='product')await this.uploadPhotos([event.after]);
     try{await this.request('/api/sync/events','POST',event);}catch(e){if(e.status===409)this.status.conflict={kind:event.kind,id:event.id,message:e.message};throw e;}
     this.store.ackEvent(event.id);continue;
    }
    const online=await this.readOnline();await this.downloadPhotos(online.snapshot);
    // A cashier may have made a sale during the network request. Flush that
    // durable event first; never replace a newer local sale with an older pull.
    if(this.store.pendingEvents().length)continue;
    this.store.replaceFromCloud(online.snapshot);break;
   }
   this.status={state:'synced',message:'Up to date',lastSync:new Date().toISOString()};this.onChange();
  }catch(e){this.status={...this.status,state:e.status===401?'sign-in':e.status===409?'conflict':e.status===412?'join-required':'offline',message:e.message||'Connection unavailable. Changes are saved on this computer.'};}
  finally{this.store.syncLocked=false;this.running=false;}
  return this.info();
 }
 async uploadPhotos(products){for(const image of new Set(products.map(p=>p.image).filter(i=>i.startsWith('/api/photos/')))){const photo=this.store.photo(image.split('/').pop());if(!photo)throw new Error('A saved photo is missing. Restore its backup before syncing.');await this.request(image,'PUT',{mime:photo.mime,data:Buffer.from(photo.bytes).toString('base64')});}}
 async downloadPhotos(snapshot){for(const image of new Set(snapshot.products.map(p=>p.image).filter(i=>i.startsWith('/api/photos/')))){if(this.store.photo(image.split('/').pop()))continue;const data=await this.request(image+'?encoding=base64','GET');this.store.putPhoto(data);}}
 async resolve(choice){
  if(this.running)throw new Error('Wait for syncing to finish.');
  this.running=true;try{
   const event=this.store.pendingEvents()[0];if(!event||event.kind!=='product')throw new Error('Correct the online stock and retry. A completed sale cannot be discarded.');
   const online=await this.readOnline();const remote=online.snapshot.products.find(p=>p.id===event.after.id);
   this.store.automaticBackup('before-conflict');
   if(choice==='online')this.store.ackEvent(event.id);
   else if(choice==='local'&&remote){
    const original=event.before;
    if(!original)throw new Error('Change the duplicate product code in Inventory, then retry.');
    const after={...remote};for(const f of Object.keys(event.after))if(!['id','version'].includes(f)&&event.after[f]!==original[f])after[f]=event.after[f];
    event.before=remote;event.after={...after,version:remote.version+1};this.store.updateEvent(event);
   }else throw new Error('Choose a valid resolution.');
  }finally{this.running=false;}
  return this.run();
 }
}
module.exports={SyncEngine};
