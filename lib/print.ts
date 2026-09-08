// Print a standalone copy outside the modal and its hidden/scrolling ancestors.
export async function printElement(source:HTMLElement){
 const previous=document.getElementById('shanti-print-root');if(previous)previous.remove();
 const root=document.createElement('div');root.id='shanti-print-root';root.append(source.cloneNode(true));document.body.append(root);
 const cleanup=()=>root.remove();window.addEventListener('afterprint',cleanup,{once:true});
 try{await document.fonts.ready;await Promise.all(Array.from(root.querySelectorAll('img')).map(img=>img.decode().catch(()=>{})));await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));window.print();}
 catch(error){window.removeEventListener('afterprint',cleanup);cleanup();throw error;}
}
