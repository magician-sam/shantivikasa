import handler from '../server/register.mjs';
import {getClient,sqlAdapter,photoAdapter} from '../server/turso.mjs';
import {ready,passwordMatches,newSession,isAuthenticated,sessionCookie,allowLogin} from '../server/auth.mjs';
export async function handle(request){
 const url=new URL(request.url),path=url.searchParams.get('route')||url.pathname;
 if(path==='/api/session')return Response.json({configured:ready(),authenticated:ready()&&isAuthenticated(request)},{headers:{'Cache-Control':'no-store'}});
 if(!ready())return Response.json({error:'The online register is awaiting its database and sign-in configuration.'},{status:503});
 const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return Response.json({error:'Request not allowed.'},{status:403});
 try{
  if(path==='/api/login'&&request.method==='POST'){
   if(!request.headers.get('content-type')?.startsWith('application/json'))return new Response('Invalid request',{status:415});
   const raw=await request.text();if(raw.length>2048)return new Response('Request too large',{status:413});
   const ip=request.headers.get('x-vercel-forwarded-for')?.split(',')[0]||'unknown';
   if(!await allowLogin(getClient(),ip))return Response.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429});
   if(!passwordMatches(JSON.parse(raw).password))return Response.json({error:'That password is not correct.'},{status:401});
   return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie(newSession()),'Cache-Control':'no-store'}});
  }
  if(!isAuthenticated(request))return Response.json({error:'Please sign in to your shop register.'},{status:401});
  if(path==='/api/logout'&&request.method==='POST')return Response.json({ok:true},{headers:{'Set-Cookie':'shanti_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'}});
  url.pathname=path;url.searchParams.delete('route');
  const headers=new Headers(request.headers);headers.delete('oai-authenticated-user-id');
  const trusted=new Request(url,{method:request.method,headers,...(!['GET','HEAD'].includes(request.method)?{body:request.body,duplex:'half'}:{})});
  const client=getClient();return handler.fetch(trusted,{authorized:true,DB:sqlAdapter(client),BUCKET:photoAdapter(client),ASSETS:{fetch:()=>new Response('Not found',{status:404})}});
 }catch(e){console.error('Register API',e.message);return Response.json({error:'The online register could not complete this request. Please retry.'},{status:503});}
}
export default {fetch:handle};
