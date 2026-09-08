import {createClient} from '@libsql/client/web';
import {readdir,readFile} from 'node:fs/promises';
if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN)throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before migrating.');
const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
await client.execute('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort()){
 if((await client.execute({sql:'SELECT name FROM schema_migrations WHERE name=?',args:[name]})).rows.length)continue;
 const statements=(await readFile('drizzle/'+name,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
 await client.batch([...statements.map(sql=>({sql,args:[]})),{sql:'INSERT INTO schema_migrations(name,applied_at) VALUES(?,?)',args:[name,new Date().toISOString()]}],'write');console.log('Applied '+name);
}
client.close();
