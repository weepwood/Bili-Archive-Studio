'use strict';
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalize, cleanUrl } = require('./normalize');
const { ArchiveDB } = require('./archive-db');
const { LocalTasks } = require('./local-tasks');
const DEFAULT_PORT = 8765;
const opts = process.argv.slice(2);
function flag(name, fallback) { const i = opts.indexOf(`--${name}`); return i > -1 ? opts[i+1] || fallback : fallback; }
const DATA = path.resolve(flag('data', path.join(__dirname, 'archive-data')));
const PORT = Number(flag('port', DEFAULT_PORT));
const WWW = path.join(__dirname, 'public');
const MEDIA = path.join(DATA, 'media');
const MEDIA_INDEX = path.join(DATA, 'media-index.json');
let posts = [], users = [], account = {}, health = {}, sourceCount = 0;
let mediaIndex = {}, activeDownloads = 0, lastMediaError = '', mediaErrors = 0;
let indexWrites = Promise.resolve();
let queue = [], queued = new Set(), waiting = new Map(), caching = false, completed = 0;
let scanInProgress = null;
let archiveDb=null, localTasks=null, lastSync=null;
function json(res, value, code=200){const body=JSON.stringify(value);res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);}
async function loadJson(p){ try{return JSON.parse(await fsp.readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;} }
async function filesIn(p) {try{return (await fsp.readdir(p)).filter(v=>v.endsWith('.json'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
function flatten(item, map, depth=0) {
  if(!item || !item.id_str || depth>10)return;
  const id=String(item.id_str);
  if (!map.has(id)) map.set(id,item);
  else {
    const old=map.get(id);
    const oldScore=JSON.stringify(old).length;
    if (JSON.stringify(item).length>oldScore) map.set(id,item);
  }
  // 被转发的原文只作为嵌套内容展示，不能误算成当前账号关注流中的独立投稿。
}
async function scan(){
  if(scanInProgress)return scanInProgress;
  scanInProgress=(async()=>{
    const owner=await loadJson(path.join(DATA,'owner.json'));
    const follows=await loadJson(path.join(DATA,'followings.json'));
    const report=await loadJson(path.join(DATA,'report.json'));
    const feed=await loadJson(path.join(DATA,'feed.json'));
    const following=(follows?.followings||[]);
    const all=new Map();
    for(const item of feed?.items||[])flatten(item,all);
    const upfiles=await filesIn(path.join(DATA,'up'));
    const upStatus=[];
    for(const name of upfiles){
      const one=await loadJson(path.join(DATA,'up',name));
      if(!one)continue;
      upStatus.push({uid:String(one.uid),complete:!!one.complete,reason:one.stopReason||'',count:one.items?.length||0});
      for(const item of one.items||[])flatten(item,all);
    }
    const detailCache = new Map();
    const normalized=[];
    const relevant=await filesIn(path.join(DATA,'detail'));
    const detailNames=new Set(relevant);
    for(const [id, item] of all){
      let detail=null;
      if(detailNames.has(`${id}.json`)){
        if(!detailCache.has(id)) detailCache.set(id,await loadJson(path.join(DATA,'detail',`${id}.json`)));
        detail=detailCache.get(id);
      }
      const n=normalize(item,detail);
      if(n) normalized.push(n);
    }
    normalized.sort((a,b)=>b.published-a.published || b.id.localeCompare(a.id));
    posts=normalized;account=owner||feed?.account||{};
    const counts=new Map();
    for(const p of posts) if(p.uid) counts.set(p.uid,(counts.get(p.uid)||0)+1);
    const uMap = new Map();
    for(const u of following) uMap.set(String(u.uid),{uid:String(u.uid),name:u.name,avatar:u.face||'',count:counts.get(String(u.uid))||0});
    for(const p of posts)if(p.uid&&!uMap.has(p.uid))uMap.set(p.uid,{uid:p.uid,name:p.author,avatar:p.avatar,count:counts.get(p.uid)||0});
    users=[...uMap.values()].sort((a,b)=>b.count-a.count);
    sourceCount=all.size;
    if(archiveDb)lastSync=archiveDb.sync(normalized,users);
    health={followingsExpected:follows?.expected??null,followingsCollected:following.length,followingsComplete:!!follows?.complete,feedComplete:!!feed?.complete,
      spaces:upStatus.length,incomplete:upStatus.filter(x=>!x.complete),failed:report?.failed||[],missingDetail:posts.filter(p=>p.hasOpus&&!p.detailReady).length};
    return {count:posts.length,users:users.length};
  })();
  try{return await scanInProgress;}finally{scanInProgress=null;}
}
function allowedMedia(url){
  try {const u=new URL(cleanUrl(url));return u.protocol==='https:' && (/^(i\d+|s\d+|archive)\.hdslb\.com$/i.test(u.hostname) || /^[\w-]+\.biliimg\.com$/i.test(u.hostname));}catch{return false;}
}
const hash=u=>crypto.createHash('sha256').update(u).digest('hex');
function persistIndex(){indexWrites=indexWrites.catch(()=>{}).then(async()=>{await fsp.writeFile(MEDIA_INDEX+'.tmp',JSON.stringify(mediaIndex));await fsp.rename(MEDIA_INDEX+'.tmp',MEDIA_INDEX);});return indexWrites;}
async function downloadMedia(url, redirects=0){
  if(!allowedMedia(url))throw Error('不允许的图片地址');
  if(redirects>3)throw Error('图片重定向次数过多');
  const file=hash(url);if(mediaIndex[file] && fs.existsSync(path.join(MEDIA,mediaIndex[file])))return mediaIndex[file];
  const tmp=path.join(MEDIA,file+'.part');
  const response=await new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{Referer:'https://www.bilibili.com/','User-Agent':'Mozilla/5.0 (compatible; BiliArchiveStudio/1.0)','Accept':'image/avif,image/webp,image/*,*/*;q=0.8'},timeout:20000},resolve);
    req.on('timeout',()=>req.destroy(new Error('下载超时')));req.on('error',reject);
  });
  if ([301,302,303,307,308].includes(response.statusCode)){
    const redirect=new URL(response.headers.location||'',url).href;response.resume();return downloadMedia(redirect,redirects+1).then(async p=>{
      const ext=path.extname(p);await fsp.copyFile(path.join(MEDIA,p),path.join(MEDIA,file+ext));mediaIndex[file]=file+ext;await persistIndex();return file+ext;
    });
  }
  if(response.statusCode!==200){response.resume();throw Error('图片 HTTP '+response.statusCode);}
  const mime=String(response.headers['content-type']||'').split(';')[0].toLowerCase();
  const ext=({'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/webp':'.webp','image/avif':'.avif','image/bmp':'.bmp'})[mime];
  if(!ext){response.resume();throw Error('非图片文件：'+mime);}
  if(Number(response.headers['content-length']||0)>40*1024*1024){response.resume();throw Error('图片超过40MB');}
  let size=0;
  try{
    await new Promise((resolve,reject)=>{
      const out=fs.createWriteStream(tmp);
      response.on('data', chunk=>{size+=chunk.length;if(size>40*1024*1024)response.destroy(new Error('图片超过40MB'));});
      response.on('error',reject);out.on('error',reject);out.on('finish',resolve);response.pipe(out);
    });
    const name=file+ext;await fsp.rename(tmp,path.join(MEDIA,name));mediaIndex[file]=name;
    await persistIndex();completed++;return name;
  }catch(e){await fsp.rm(tmp,{force:true}).catch(()=>{});throw e;}
}
function queueMedia(url){
  url=cleanUrl(url);
  if(!allowedMedia(url))return Promise.reject(Error('不允许的图片地址'));
  const k=hash(url);
  if(mediaIndex[k]&&fs.existsSync(path.join(MEDIA,mediaIndex[k])))return Promise.resolve(mediaIndex[k]);
  if(waiting.has(k))return waiting.get(k);
  let finish,fail;
  const promise=new Promise((res,rej)=>{finish=res;fail=rej;});
  waiting.set(k,promise);queued.add(k);queue.push({url,k,finish,fail});pump();return promise;
}
function pump(){
  while(activeDownloads<2&&queue.length){
    const job=queue.shift();activeDownloads++;
    downloadMedia(job.url).then(job.finish,e=>{mediaErrors++;lastMediaError=String(e.message||e);job.fail(e);}).finally(()=>{activeDownloads--;queued.delete(job.k);waiting.delete(job.k);setTimeout(pump,450);});
  }
}
function typeCounter(){const ret={all:posts.length,text:0,image:0,video:0,forward:0,article:0,live:0};for(const p of posts)ret[p.type]=(ret[p.type]||0)+1;return ret;}
function status(){return {account,posts:posts.length,authors:users.length,types:typeCounter(),health,media:{cached:Object.keys(mediaIndex).length,queued:queue.length,active:activeDownloads,failed:mediaErrors,lastError:lastMediaError,caching,completed}, database:{enabled:!!archiveDb, sync:lastSync, filename:"archive.sqlite"},taskActive:localTasks?.active?.id||null, data:DATA};}
const mimeType={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.ico':'image/x-icon','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif'};
function serveFile(res,file, cache=false){let stream=fs.createReadStream(file);stream.on('error',()=>{if(!res.headersSent)json(res,{error:'not found'},404);else res.destroy();});const type=mimeType[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':cache?'public,max-age=86400':'no-cache'});stream.pipe(res);}
async function handler(req,res){
  const host=req.headers.host;
  if(host!==`127.0.0.1:${PORT}` && host!==`localhost:${PORT}`)return json(res,{error:'invalid host'},403);
  const uri = new URL(req.url,`http://localhost:${PORT}`);
  if(req.method==='POST') {
    const origin=req.headers.origin;
    if(req.headers['x-bili-archive']!=='1' || (origin && origin!==`http://127.0.0.1:${PORT}`&&origin!==`http://localhost:${PORT}`))return json(res,{error:'forbidden'},403);
    if(uri.pathname==='/api/reindex'){const done=await scan();return json(res,done);}
    if(uri.pathname==='/api/tasks/start'){try{return json(res,localTasks.start(uri.searchParams.get('kind')||''),202)}catch(e){return json(res,{error:e.message},e.statusCode||500)}}
    if(uri.pathname==='/api/tasks/cancel'){try{return json(res,localTasks.cancel(uri.searchParams.get('id')||''))}catch(e){return json(res,{error:e.message},e.statusCode||500)}}
    if(uri.pathname==='/api/tasks/retry'){try{return json(res,localTasks.retry(uri.searchParams.get('id')||''),202)}catch(e){return json(res,{error:e.message},e.statusCode||500)}}
    if(uri.pathname==='/api/cache'){
      let size=0;const all=new Set();for(const p of posts)for(const u of p.mediaUrls)if(allowedMedia(u))all.add(u);
      for(const u of users)if(allowedMedia(u.avatar))all.add(cleanUrl(u.avatar));
      const remaining=[...all].filter(u=>!mediaIndex[hash(u)]);
      caching=true;
      (async()=>{
        for(const u of remaining){
          if(!caching)break;
          if(queue.length>60)await new Promise(r=>setTimeout(r,2000));
          // Keep failures tracked and continue downloading safe public images.
          queueMedia(u).catch(()=>{});size++;
        }
        caching=false;
      })();
      return json(res,{total:all.size,uncached:remaining.length,status:'queued'});
    }
    if(uri.pathname==='/api/stop-cache'){caching=false;return json(res,{stopping:true});}
    return json(res,{error:'not found'},404);
  }
  if(req.method!=='GET')return json(res,{error:'method not allowed'},405);
  if(uri.pathname==='/api/status')return json(res,status());
  if(uri.pathname==='/api/tasks')return json(res,{items:archiveDb.tasks()});
  if(uri.pathname==='/api/users')return json(res,{items:users});
  if(uri.pathname==='/api/posts'){
    const q=(uri.searchParams.get('q')||'').toLocaleLowerCase();const uid=uri.searchParams.get('uid')||'';const type=uri.searchParams.get('type')||'all';
    const page=Math.max(1,Math.min(1e6,Number(uri.searchParams.get('page')||1)||1));const size=Math.max(1,Math.min(40,Number(uri.searchParams.get('size')||12)||12));
    if(archiveDb)return json(res,archiveDb.search({q,uid,type,sort:uri.searchParams.get('sort')||'newest',page,size}));
    let filtered=posts.filter(p=>(!uid||p.uid===uid)&& (type==='all'||p.type===type) &&(!q||(`${p.author} ${p.title} ${p.text} ${p.forward?.text||''}`).toLocaleLowerCase().includes(q)));
    if(uri.searchParams.get('sort')==='oldest')filtered=filtered.slice().reverse();
    return json(res,{total:filtered.length,page,size,items:filtered.slice((page-1)*size,page*size)});
  }
  if(uri.pathname==='/api/media'){
    const imageUrl=uri.searchParams.get('url')||'';
    if(!allowedMedia(imageUrl))return json(res,{error:'invalid image url'},400);
    try{const name=await queueMedia(imageUrl);return serveFile(res,path.join(MEDIA,name),true);}catch(e){return json(res,{error:'图片下载失败: '+String(e.message||e)},502);}
  }
  if(uri.pathname==='/api/health')return json(res,{...health,sourceCount});
  const name=uri.pathname==='/'?'index.html':decodeURIComponent(uri.pathname.slice(1));
  if(!['index.html','app.css','app.js','studio.js','studio.css'].includes(name))return json(res,{error:'not found'},404);
  return serveFile(res,path.join(WWW,name));
}
async function main(){
  if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw Error('非法端口');
  await fsp.mkdir(MEDIA,{recursive:true});mediaIndex=(await loadJson(MEDIA_INDEX))||{};
  archiveDb=new ArchiveDB(DATA);
  const summary=await scan();
  localTasks=new LocalTasks(archiveDb,{
    reindex:scan,
    listMedia:async()=>{
      const list=new Set();for(const p of posts)for(const u of p.mediaUrls||[])if(allowedMedia(u))list.add(cleanUrl(u));
      for(const u of users)if(allowedMedia(u.avatar))list.add(cleanUrl(u.avatar));
      return [...list].filter(u=>!(mediaIndex[hash(u)]&&fs.existsSync(path.join(MEDIA,mediaIndex[hash(u)]))));
    },
    cacheOne:queueMedia
  });
  const server=http.createServer((req,res)=>handler(req,res).catch(e=>{console.error(e);if(!res.headersSent)json(res,{error:e.message||'internal error'},500);else res.destroy();}));
  server.listen(PORT,'127.0.0.1',()=>{console.log('Bili Archive Studio · http://127.0.0.1:'+PORT);console.log('归档目录：'+DATA);console.log('已索引动态：'+summary.count+' 条，UP 主：'+summary.users+' 人');});
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={scan,allowedMedia,hash};
