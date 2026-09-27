// Personal data never belongs in public/, src/, or a Vite environment variable.
// Usage: node scripts/prepare-workspace.mjs .private/workspace-import.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { upgradeWorkspace } from '../src/lib/workspace.js';
const input=process.argv[2];
if(!input)throw new Error('Pass the path to your private workspace JSON.');
const document=upgradeWorkspace(JSON.parse(await readFile(input,'utf8')));
await mkdir('.private',{recursive:true});
let code;
try{code=(await readFile('.private/setup-code.txt','utf8')).trim();}catch{code=randomBytes(32).toString('hex');await writeFile('.private/setup-code.txt',code);}
const hash=createHash('sha256').update(code).digest('hex');
const sql=`-- PRIVATE: personal workspace bootstrap. Never commit this file.\nbegin;\ndo $$ begin\n if exists(select 1 from public.vk_workspace) or exists(select 1 from auth.users) then raise exception 'Refusing to replace an owned workspace or claim an existing Auth project.'; end if;\nend $$;\ninsert into vk_private.bootstrap (id,setup_hash,document) values (true,'${hash}','${JSON.stringify(document).replaceAll("'","''")}'::jsonb) on conflict (id) do update set setup_hash=excluded.setup_hash,document=excluded.document;\ncommit;\n`;
await writeFile('.private/bootstrap.sql',sql);
await writeFile('.private/setup-link.txt',`http://localhost:5173/#setup=${code}\nReplace only the origin with your deployed VK URL if needed. Keep this link private; it creates the one owner account.\n`);
console.log(`Prepared private bootstrap: ${document.projects.length} projects, ${document.background.length} background records, ${document.directions.length} business directions, ${document.debtors.length} debtors. Setup link saved privately, not printed.`);
