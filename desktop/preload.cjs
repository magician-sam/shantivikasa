'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
 syncStatus:()=>ipcRenderer.invoke('desktop:sync-status'),
 connect:url=>ipcRenderer.invoke('desktop:connect',url),
 sync:join=>ipcRenderer.invoke('desktop:sync',join===true),
 resolve:choice=>ipcRenderer.invoke('desktop:resolve',choice),
 disconnect:()=>ipcRenderer.invoke('desktop:disconnect'),
 onDataChanged:callback=>{const handler=()=>callback();ipcRenderer.on('desktop:data-changed',handler);return()=>ipcRenderer.removeListener('desktop:data-changed',handler);},
 info:()=>ipcRenderer.invoke('desktop:info'),
 setDraft:value=>ipcRenderer.invoke('desktop:draft',value===true),
 backup:()=>ipcRenderer.invoke('desktop:backup'),
 restore:()=>ipcRenderer.invoke('desktop:restore'),
 openDataFolder:()=>ipcRenderer.invoke('desktop:open-data')
});
