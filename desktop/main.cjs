'use strict';
const {app,BrowserWindow,protocol,ipcMain,dialog,Menu,shell,session}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {Store}=require('./store.cjs');
const {setupCloud}=require('./cloud.cjs');
app.setName('Shanti Vikasa');
app.setAppUserModelId('com.shantivikasa.register');
protocol.registerSchemesAsPrivileged([{scheme:'shanti',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
const ROOT=path.resolve(__dirname,'..');
let store,win,hasDraft=false,backupTimer,cloud;
const ownURL=value=>{try{const u=new URL(value);return u.protocol==='shanti:'&&u.hostname==='app';}catch{return false;}};
const trustedSender=event=>{if(!win||event.sender!==win.webContents||!event.senderFrame||!ownURL(event.senderFrame.url))throw new Error('Request not allowed.');};
async function backupDialog(){const result=await dialog.showSaveDialog(win,{title:'Back up Shanti Vikāsa data',defaultPath:path.join(app.getPath('documents'),`Shanti-Vikasa-Backup-${new Date().toISOString().slice(0,10)}.sqlite`),filters:[{name:'Shanti Vikāsa database',extensions:['sqlite']}]});if(result.canceled)return{canceled:true};store.backup(result.filePath);return{ok:true,path:result.filePath};}
async function restoreDialog(){if(cloud?.engine.running)throw new Error('Wait for syncing to finish before restoring.');if(hasDraft)throw new Error('Complete or clear your current sale before restoring a backup.');const chosen=await dialog.showOpenDialog(win,{title:'Choose a Shanti Vikāsa backup',properties:['openFile'],filters:[{name:'Shanti Vikāsa database',extensions:['sqlite']}]});if(chosen.canceled)return{canceled:true};const selected=chosen.filePaths[0];if(path.resolve(selected)===path.resolve(store.file))throw new Error('Choose an exported backup, not the database currently in use.');const info=store.inspectBackup(selected);const confirmation=await dialog.showMessageBox(win,{type:'warning',title:'Restore this backup?',message:`Replace the current data with ${info.products} products and ${info.sales} saved sales?`,detail:'Sales and edits made after this backup will be replaced. A safety copy will be kept. Restoring disconnects this computer from the website; online data will be kept.',buttons:['Cancel','Restore backup'],defaultId:0,cancelId:0});if(confirmation.response!==1)return{canceled:true};store.restore(selected);win.webContents.reload();return{ok:true};}
function errorMessage(error){return error instanceof Error?error.message:'The operation could not be completed.';}
async function showAction(action){try{const r=await action();if(r?.ok&&r.path)await dialog.showMessageBox(win,{type:'info',message:'Backup saved.',detail:r.path||'',buttons:['OK']});}catch(e){dialog.showErrorBox('Shanti Vikāsa',errorMessage(e));}}
const locked=app.requestSingleInstanceLock();
if(!locked)app.quit();else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
 app.whenReady().then(async()=>{
  const dataPath=path.join(app.getPath('appData'),'ShantiVikasa');
  fs.mkdirSync(dataPath,{recursive:true});
  app.setPath('userData',dataPath);
  const directory=app.getPath('userData');
  store=new Store(directory,JSON.parse(fs.readFileSync(path.join(ROOT,'data/initial-snapshot.json'),'utf8')));
  cloud=setupCloud(store,()=>win,trustedSender,()=>hasDraft);
  let backupWarning='';try{store.automaticBackup();}catch(e){backupWarning='Automatic backup could not be created: '+errorMessage(e);}
  protocol.handle('shanti',async request=>{
   try{
    const url=new URL(request.url);if(url.hostname!=='app')return new Response('Not found',{status:404});
    if(/^\/api\/photos\/[a-f0-9]{64}$/.test(url.pathname)&&request.method==='GET'){const p=store.photo(url.pathname.split('/').pop());return p?new Response(p.bytes,{headers:{'Content-Type':p.mime,'Cache-Control':'no-store'}}):new Response('Photo not found',{status:404});}
    if(url.pathname.startsWith('/api/')){
     const origin=request.headers.get('origin');if(origin&&origin!=='shanti://app')return Response.json({error:'Request not allowed.'},{status:403});
     let body=Object.fromEntries(url.searchParams);if(request.method!=='GET'){const raw=await request.text();if(raw.length>3000000)return Response.json({error:'Request too large.'},{status:413});try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid body');}catch{return Response.json({error:'Invalid request.'},{status:400});}}
     const result=store.api(url.pathname,request.method,body);if(request.method!=='GET'&&result.status<300)cloud.changed();return Response.json(result.body,{status:result.status,headers:{'Cache-Control':'no-store'}});
    }
    if(request.method!=='GET')return new Response('Method not allowed',{status:405});
    const pathname=decodeURIComponent(url.pathname);if(pathname.includes('\\')||pathname.includes('\0'))return new Response('Not found',{status:404});
    const folder=path.join(ROOT,'dist'),file=path.resolve(folder,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(folder+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return new Response('Not found',{status:404});
    const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
    return new Response(fs.readFileSync(file),{headers:{'Content-Type':contentTypes[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'",'X-Content-Type-Options':'nosniff'}});
   }catch(e){console.error(e);return Response.json({error:'The register could not complete this request.'},{status:500});}
  });
  win=new BrowserWindow({width:1390,height:910,minWidth:740,minHeight:600,show:false,title:'Shanti Vikāsa · Shop Register',backgroundColor:'#f4efdf',icon:path.join(ROOT,'public/shanti-logo.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false}});
  const ses=win.webContents.session;
  ses.setPermissionRequestHandler((contents,permission,callback,details)=>{const local=contents===win?.webContents&&ownURL(details.requestingUrl||contents.getURL());callback(local&&permission==='media'&&!(details.mediaTypes||[]).includes('audio'));});
  ses.setPermissionCheckHandler((contents,permission,origin,details)=>contents===win?.webContents&&ownURL(origin)&&permission==='media'&&details.mediaType!=='audio');
  win.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(u.protocol==='https:'&&(u.hostname==='shantivikasa.com'||u.hostname==='www.shantivikasa.com'))shell.openExternal(u.href);}catch{}return{action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(!ownURL(url))event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.on('will-prevent-unload',event=>{const choice=dialog.showMessageBoxSync(win,{type:'question',message:'Leave the current unfinished sale?',detail:'Completed sales are already saved. Items in the unfinished basket will be cleared.',buttons:['Keep working','Leave'],defaultId:0,cancelId:0});if(choice===1)event.preventDefault();});
  ipcMain.handle('desktop:info',event=>{trustedSender(event);return{version:app.getVersion(),dataDirectory:directory,backupWarning};});
  ipcMain.handle('desktop:draft',(event,value)=>{trustedSender(event);hasDraft=value===true;});
  ipcMain.handle('desktop:backup',async event=>{trustedSender(event);try{return await backupDialog();}catch(e){return{error:errorMessage(e)}}});
  ipcMain.handle('desktop:restore',async event=>{trustedSender(event);try{return await restoreDialog();}catch(e){return{error:errorMessage(e)}}});
  ipcMain.handle('desktop:open-data',async event=>{trustedSender(event);return shell.openPath(directory);});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
   {label:'File',submenu:[{label:'Back up data…',accelerator:'CmdOrCtrl+Shift+B',click:()=>showAction(backupDialog)},{label:'Restore backup…',click:()=>showAction(restoreDialog)},{label:'Open data folder',click:()=>shell.openPath(directory)},{type:'separator'},{role:'quit'}]},
   {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
   {label:'View',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},
   {label:'Help',submenu:[{label:'About this register',click:()=>dialog.showMessageBox(win,{title:'Shanti Vikāsa',type:'info',message:'Shanti Vikāsa · Shop Register 1.0.3',detail:'Your inventory and receipts are saved on this computer. This app works offline. Connect your website to sync inventory, photos, and receipts. Shopify is separate.\n\nUse File → Back up data to save a copy to a USB drive.\n\nF2: Scan · F3: Search · F9: Checkout',buttons:['OK']})}]}
  ]));
  win.once('ready-to-show',()=>win.show());
  win.webContents.on('did-fail-load',(_event,code,description)=>{if(code!==-3){dialog.showErrorBox('Could not open the register',description);app.quit();}});
  await win.loadURL('shanti://app/');
  cloud.start();
  backupTimer=setInterval(()=>{try{store.automaticBackup();}catch(e){console.error('Automatic backup failed',e)}},15*60*1000);backupTimer.unref();
 }).catch(e=>{dialog.showErrorBox('Shanti Vikāsa could not start',errorMessage(e));app.quit();});
 app.on('window-all-closed',()=>app.quit());
 app.on('will-quit',()=>{clearInterval(backupTimer);cloud?.stop();try{store?.close();}catch(e){console.error(e);}});
}
