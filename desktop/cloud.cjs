'use strict';
const {BrowserWindow,session,ipcMain,dialog}=require('electron');
const {SyncEngine}=require('./sync.cjs');
function setupCloud(store,getWindow,trustedSender,hasDraft){
 const ses=session.fromPartition('persist:shanti-cloud');let connectionWindow;
 const engine=new SyncEngine(store,async(route,method,body)=>{
  const base=store.meta('cloud-url');if(!base){const e=new Error('Connect your website to enable syncing.');e.status=401;throw e;}
  const response=await ses.fetch(base+route,{method,headers:{'Content-Type':'application/json','Origin':base,'X-Shanti-Sync-Version':'3'},credentials:'include',redirect:'error',signal:AbortSignal.timeout(30000),...(body?{body:JSON.stringify(body)}:{})});
  if(!response.headers.get('content-type')?.includes('application/json')){const e=new Error('Sign in again to reconnect the website.');e.status=401;throw e;}
  const data=await response.json();if(!response.ok){const e=new Error(data.error||'The website is unavailable.');e.status=response.status;throw e;}return data;
 },{onChange:()=>{const win=getWindow();if(win&&!win.isDestroyed())win.webContents.send('desktop:data-changed');}});
 ipcMain.handle('desktop:sync-status',event=>{trustedSender(event);return{...engine.info(),url:store.meta('cloud-url')||''};});
 ipcMain.handle('desktop:sync',async(event,join)=>{
  trustedSender(event);if(join&&hasDraft())throw new Error('Complete or clear your basket first.');
  if(join){const answer=await dialog.showMessageBox(getWindow(),{type:'warning',message:'Download the online register to this computer?',detail:'Local inventory and receipts will be replaced. A safety backup is created first.',buttons:['Cancel','Download online data'],defaultId:0,cancelId:0});if(answer.response!==1)return engine.info();}
  return engine.run({join:join===true});
 });
 ipcMain.handle('desktop:resolve',async(event,choice)=>{trustedSender(event);if(!['online','local'].includes(choice))throw new Error('Invalid choice.');return engine.resolve(choice);});
 ipcMain.handle('desktop:disconnect',async event=>{trustedSender(event);if(engine.running||store.pendingEvents().length)throw new Error('Sync all pending changes before disconnecting.');store.db.exec("DELETE FROM metadata WHERE key LIKE 'cloud-%'");engine.status={state:'disconnected',message:'Saved on this computer'};await ses.clearStorageData();});
 ipcMain.handle('desktop:connect',async(event,value)=>{
  trustedSender(event);try{
   const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(u.hostname)||u.hostname.endsWith('.local'))throw new Error('Enter the HTTPS address of your online register.');
   const old=store.meta('cloud-url');if(old&&old!==u.origin&&store.meta('cloud-linked'))throw new Error('Disconnect the current website before connecting a different one.');
   if(engine.running)throw new Error('Wait for syncing to finish, then reconnect.');
   store.setMeta('cloud-url',u.origin);if(connectionWindow&&!connectionWindow.isDestroyed()){connectionWindow.focus();return{ok:true};}
   connectionWindow=new BrowserWindow({width:1020,height:760,parent:getWindow(),title:'Sign in to your Shanti Vikasa register',webPreferences:{partition:'persist:shanti-cloud',nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
   connectionWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   connectionWindow.webContents.on('will-navigate',(e,target)=>{if(new URL(target).origin!==u.origin)e.preventDefault();});
   let checking=false;const timer=setInterval(async()=>{if(checking)return;checking=true;try{const r=await ses.fetch(u.origin+'/api/session',{credentials:'include',redirect:'error',signal:AbortSignal.timeout(5000)});const d=await r.json();if(d.authenticated){clearInterval(timer);connectionWindow?.close();engine.run();}}catch{}finally{checking=false;}},2000);
   connectionWindow.on('closed',()=>{clearInterval(timer);connectionWindow=null;});connectionWindow.loadURL(u.origin+'/?desktop=1').catch(()=>{});return{ok:true};
  }catch(e){return{error:e.message};}
 });
 const timer=setInterval(()=>{if(store.meta('cloud-url'))engine.run()},15000);timer.unref();
 return{engine,stop:()=>clearInterval(timer),start:()=>{if(store.meta('cloud-url'))engine.run()},changed:()=>{if(store.meta('cloud-url'))setTimeout(()=>engine.run(),250)}};
}
module.exports={setupCloud};
