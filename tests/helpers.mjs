import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import {PROJECT_ROOT} from '../app/server/config.mjs';
export async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
