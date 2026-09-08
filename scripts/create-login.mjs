import {randomBytes,scryptSync} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
// The owner runs this locally. Never include its output in Git or an installer.
const readline=createInterface({input:process.stdin,output:process.stdout});
const password=await readline.question('Choose a unique shop password (at least 12 characters): ');readline.close();
if(password.length<12||password.length>256)throw new Error('Use 12–256 characters.');
const salt=randomBytes(16).toString('hex');
console.log('REGISTER_PASSWORD_HASH=scrypt:'+salt+':'+scryptSync(password,salt,64).toString('hex'));
console.log('REGISTER_SESSION_SECRET='+randomBytes(48).toString('base64url'));
