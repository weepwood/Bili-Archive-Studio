'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const fs=require('node:fs');
const path=require('node:path');
const {ArchiveDB}=require('../archive-db');
const {LocalTasks}=require('../local-tasks');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-db-'));const db=new ArchiveDB(dir);return {dir,db,close(){this.db.close();fs.rmSync(dir,{recursive:true,force:true})}};}
const examples=[
  {id:'111',uid:'123',type:'image',published:1730000000000,author:'甲用户',title:'花园',text:'美丽的蓝色鸢尾花',images:['https://i0.hdslb.com/a.jpg']},
  {id:'222',uid:'321',type:'video',published:1730000001000,author:'UP乙',title:'科技演示',text:'新的图形工作流程',videoUrl:'https://www.bilibili.com/video/BVtest'},
];
test('SQLite 初始化、重复索引去重、全文搜索与重启保留',t=>{
  const f=fixture();t.after(()=>f.close());
  assert.equal(f.db.sync(examples,[{uid:'123',name:'甲用户',count:1,avatar:''}]).changed,2);
  assert.equal(f.db.sync(examples,[]).changed,0);
  assert.equal(f.db.search({}).total,2);
  assert.equal(f.db.search({q:'鸢尾花'}).items[0].id,'111');
  assert.equal(f.db.search({q:'蓝色'}).items[0].id,'111');
  assert.equal(f.db.search({uid:'321',type:'video'}).total,1);
  assert.equal(f.db.search({sort:'oldest'}).items[0].id,'111');
  f.db.close();f.db=new ArchiveDB(f.dir);
  assert.equal(f.db.search({q:'科技演示'}).total,1);
  assert.equal(f.db.sync([{...examples[0],text:'内容已更新'}],[]).changed,1);
  assert.equal(f.db.search({q:'鸢尾花'}).total,0);
  assert.equal(f.db.search({q:'内容已更新'}).total,1);
  assert.equal(f.db.search({}).total,1); // stale index entry is removed when canonical JSON disappears
});
test('本地任务状态、失败重试、取消及重启恢复',async t=>{
  const f=fixture();t.after(()=>f.close());
  const manager=new LocalTasks(f.db,{reindex:async()=>{await sleep(10);},listMedia:async()=>['a','b','c'],cacheOne:async()=>sleep(20)});
  const first=manager.start('reindex');assert.equal(first.state,'queued');await manager.waitForIdle();
  assert.equal(f.db.getTask(first.id).state,'completed');
  const second=manager.start('cache');await sleep(5);manager.cancel(second.id);await manager.waitForIdle();
  assert.equal(f.db.getTask(second.id).state,'cancelled');
  assert.ok(manager.retry(second.id).id!==second.id);
  await manager.waitForIdle();
  const interrupted=f.db.createTask('reindex');f.db.updateTask(interrupted.id,{state:'running'});
  new LocalTasks(f.db,{reindex:async()=>{},listMedia:async()=>[],cacheOne:async()=>{}});
  assert.equal(f.db.getTask(interrupted.id).state,'interrupted');
  assert.throws(()=>manager.start('unsafe'),/不支持/);
});
