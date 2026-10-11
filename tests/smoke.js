'use strict';
// Runs without a logged-in Bilibili account. Uses only checked-in fictional demo data.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const root=path.join(__dirname,'..');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bili-smoke-'));
  const port=24000+Math.floor(Math.random()*16000);
  fs.cpSync(path.join(root,'demo-data'),tmp,{recursive:true});
  const child=spawn(process.execPath,['server.js','--port',String(port),'--data',tmp],{cwd:root,stdio:'pipe'});
  let out='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>out+=c);
  try{
    let ready=false;
    for(let i=0;i<60;i++) {if(out.includes('Bili Archive Studio ·')){ready=true;break;}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}
    assert.ok(ready,'本地服务未启动：'+out);
    const url='http://127.0.0.1:'+port;
    const status=await (await fetch(url+'/api/status')).json();assert.equal(status.database.enabled,true);assert.ok(status.posts>=1);
    const posts=await (await fetch(url+'/api/posts?q=%E7%A4%BA%E4%BE%8B')).json();assert.ok(posts.total>0);
    const launch=await fetch(url+'/api/tasks/start?kind=reindex',{method:'POST',headers:{'X-Bili-Archive':'1'}});
    assert.equal(launch.status,202);
    const task=await launch.json();assert.ok(task.id);
    let final=null;
    for(let i=0;i<50;i++){final=await(await fetch(url+'/api/tasks')).json();const x=final.items.find(x=>x.id===task.id);if(x?.state==='completed')break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(final.items.find(x=>x.id===task.id).state,'completed');
    const hostile=await fetch(url+'/api/tasks/start?kind=cache',{method:'POST'});assert.equal(hostile.status,403);
    console.log('演示数据 SQLite 索引、检索、任务接口和写入保护检查通过');
  }finally{child.kill();await new Promise(r=>child.once('exit',r)).catch(()=>{});fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(err=>{console.error(err);process.exitCode=1});
