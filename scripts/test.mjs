import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const all=process.argv.includes('--all');
const assetTests=new Set(['game-economy-resume.test.mjs','native-challenge-long.test.mjs']);
const files=fs.readdirSync(new URL('../tests/',import.meta.url)).filter(n=>n.endsWith('.test.mjs')&&(all||!assetTests.has(n))).sort();
console.log(all?'Full suite including binary assets':'Asset-free regression suite (2 asset-dependent test files run via test:all)');
const r=spawnSync(process.execPath,['--test',...files.map(n=>'tests/'+n)],{stdio:'inherit'});
process.exitCode=r.status??1;
