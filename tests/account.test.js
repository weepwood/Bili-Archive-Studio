'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {AccountBridge}=require('../account-bridge');
function fixture(){return fs.mkdtempSync(path.join(os.tmpdir(),'bili-account-test-'))}
test('连接码有效期、错误尝试、仅保存公开资料及解除关联',async t=>{
 const dir=fixture();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let now=Date.now();const bridge=new AccountBridge(dir,{now:()=>now,codeGenerator:()=> '12345678'});
 const code=bridge.start();assert.equal(code.code,'12345678');
 await assert.rejects(()=>bridge.connect('87654321',{uid:'100',name:'Test'}),/无效/);
 const linked=await bridge.connect(code.code,{uid:'123456',name:'测试账号',avatar:'https://i0.hdslb.com/bfs/face/a.jpg'});
 assert.equal(linked.linkedAccount.uid,'123456');
 assert.equal(new AccountBridge(dir).linked.name,'测试账号');
 assert.equal(fs.readFileSync(path.join(dir,'linked-account.json'),'utf8').includes('SESSDATA'),false);
 await bridge.disconnect();assert.equal(new AccountBridge(dir).linked,null);
 bridge.start();now+=301000;
 await assert.rejects(()=>bridge.connect('12345678',{uid:'1234',name:'Test'}),/过期/);
});
test('登录入口、阅读器导航不存在重复按钮和重复脚本',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 for(const id of ['openStudio','accountLink','leaveReader'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.equal((html.match(/src="\/studio\.js"/g)||[]).length,1);
 const studio=fs.readFileSync(path.join(__dirname,'../public/studio.js'),'utf8');
 assert.match(studio,/#leaveReader/);
 assert.match(studio,/closeStudio/);
});
async function freePort(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;server.close();return port;}
test('HTTP 关联码不能被普通网页调用，客户端可显示关联状态',async t=>{
 const dir=fixture();const port=await freePort();
 const child=spawn(process.execPath,[path.join(__dirname,'../server.js'),'--data',dir,'--port',String(port)],{stdio:'ignore'});
 t.after(async()=>{const exited=new Promise(r=>child.once('exit',r));if(child.exitCode===null){child.kill();await exited;}fs.rmSync(dir,{recursive:true,force:true,maxRetries:15,retryDelay:200});});
 const base='http://127.0.0.1:'+port;
 let ready=false;
 for(let n=0;n<80;n++){
   if(child.exitCode!==null)throw Error('local server exited');
   try{const r=await fetch(base+'/api/status');if(r.ok){ready=true;break}}catch{}
   await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(ready,'server ready');
 const local={'X-Bili-Archive':'1','Origin':base};
 const r=await fetch(base+'/api/account/pair/start',{method:'POST',headers:local});
 assert.equal(r.status,200);
 const {code}=await r.json();assert.match(code,/^\d{8}$/);
 const data={uid:'888888',name:'测试UP账号',avatar:'https://i0.hdslb.com/a.png'};
 const normal=await fetch(base+'/api/account/link',{method:'POST',headers:{'Content-Type':'application/json','X-Bili-Archive-Pair':code,'Origin':'https://www.bilibili.com'},body:JSON.stringify(data)});
 assert.equal(normal.status,403);
 const extension=await fetch(base+'/api/account/link',{method:'POST',headers:{'Content-Type':'application/json','X-Bili-Archive-Pair':code,'Origin':'chrome-extension://abcdef'},body:JSON.stringify(data)});
 assert.equal(extension.status,200);
 assert.equal((await extension.json()).linkedAccount.uid,'888888');
 const status=await(await fetch(base+'/api/status')).json();
 assert.equal(status.linkedAccount.name,'测试UP账号');
 assert.equal(status.account.uid,'888888');
 await fetch(base+'/api/account/disconnect',{method:'POST',headers:local});
 assert.equal((await(await fetch(base+'/api/status')).json()).linkedAccount,null);
});
