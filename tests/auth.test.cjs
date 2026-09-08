const {test}=require('node:test');const assert=require('node:assert/strict');const {scryptSync,randomBytes}=require('node:crypto');
test('password checking, signed sessions, tampering, expiry and password rotation',async()=>{
 const {passwordMatches,newSession,isAuthenticated,sessionCookie}=await import('../server/auth.mjs');const salt=randomBytes(16).toString('hex');
 process.env.REGISTER_PASSWORD_HASH='scrypt:'+salt+':'+scryptSync('test-only-strong-password',salt,64).toString('hex');process.env.REGISTER_SESSION_SECRET=randomBytes(48).toString('base64url');
 assert(passwordMatches('test-only-strong-password'));assert(!passwordMatches('wrong'));const token=newSession(1000),cookie=sessionCookie(token);const r=new Request('https://shop.test',{headers:{cookie}});
 assert(isAuthenticated(r,2000));assert(!isAuthenticated(r,1000+31*86400000));assert(!isAuthenticated(new Request('https://shop.test',{headers:{cookie:cookie.replace(token,token+'x')}}),2000));process.env.REGISTER_PASSWORD_HASH+='changed';assert(!isAuthenticated(r,2000));delete process.env.REGISTER_PASSWORD_HASH;delete process.env.REGISTER_SESSION_SECRET;
});
