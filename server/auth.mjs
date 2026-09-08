import {createHmac,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
export const ready=()=>!!(process.env.TURSO_DATABASE_URL&&process.env.TURSO_AUTH_TOKEN&&process.env.REGISTER_PASSWORD_HASH&&process.env.REGISTER_SESSION_SECRET?.length>=32);
const signature=value=>createHmac('sha256',process.env.REGISTER_SESSION_SECRET).update(value+'|'+process.env.REGISTER_PASSWORD_HASH).digest('base64url');
export function passwordMatches(password,encoded=process.env.REGISTER_PASSWORD_HASH){
 try{const [algorithm,salt,hash]=encoded.split(':');if(algorithm!=='scrypt'||salt.length!==32||hash.length!==128||typeof password!=='string'||password.length>256)return false;return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,'hex'));}catch{return false;}
}
export function newSession(now=Date.now()){const payload=Buffer.from(JSON.stringify({exp:now+30*24*3600000})).toString('base64url');return payload+'.'+signature(payload);}
export function isAuthenticated(request,now=Date.now()){
 try{const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('shanti_session='))?.slice(15);if(!token)return false;const [payload,sig]=token.split('.');if(typeof sig!=='string')return false;const expected=signature(payload);return sig.length===expected.length&&timingSafeEqual(Buffer.from(sig),Buffer.from(expected))&&JSON.parse(Buffer.from(payload,'base64url').toString()).exp>now;}catch{return false;}
}
export function sessionCookie(token){return `shanti_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${30*24*3600}`;}
export async function allowLogin(client,ip,now=Date.now()){
 const key=createHash('sha256').update(ip).digest('hex'),window=Math.floor(now/900000);
 const result=await client.execute({sql:'INSERT INTO login_attempts(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count',args:[key,window]});return Number(result.rows[0].count)<=10;
}
