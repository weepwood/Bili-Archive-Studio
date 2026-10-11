/*
 * Bilibili Followed Dynamics Collector (browser console edition)
 * Run ONLY on https://www.bilibili.com/ or https://t.bilibili.com/
 * This script does not read, display, export, or transmit your cookies.
 * API traffic goes only to api.bilibili.com; archives are saved locally.
 */
(async () => {
  'use strict';
  if (!['www.bilibili.com', 't.bilibili.com'].includes(location.hostname) || location.protocol !== 'https:') {
    alert('请先打开 https://www.bilibili.com/ 并登录，再运行采集脚本。');
    return;
  }
  if (document.getElementById('weepwood-bili-collector')) {
    console.info('采集面板已打开');
    return;
  }
  if (!window.showDirectoryPicker) {
    alert('当前浏览器不支持本地文件夹保存。请使用新版 Chrome 或 Edge。');
    return;
  }

  const root = document.createElement('section');
  root.id = 'weepwood-bili-collector';
  root.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;width:420px;max-width:calc(100vw - 32px);max-height:80vh;overflow:auto;background:#18191c;color:#eee;border:1px solid #555;border-radius:12px;padding:16px;font:13px/1.6 system-ui,-apple-system,"Microsoft Yahei",sans-serif;box-shadow:0 5px 35px #0008;';
  const heading = document.createElement('div');
  heading.textContent = 'Bilibili 关注动态采集器 · 本地归档';
  heading.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:6px;';
  root.append(heading);
  const note = document.createElement('p');
  note.textContent = '先选择本地保存目录。快速模式抓关注流；深度模式逐个读取关注 UP 主的空间动态。Cookie 不会写入文件。';
  note.style.margin = '0 0 12px';
  root.append(note);
  const pickBtn = makeButton('1. 选择保存目录');
  const feedBtn = makeButton('2. 抓取关注流');
  const deepBtn = makeButton('3. 逐人深度归档');
  const pauseBtn = makeButton('暂停采集');
  const csvBtn = makeButton('汇总导出 CSV');
  const updateBtn = makeButton('更新全部UP的近期动态');
  const detailBtn = makeButton('补全图文长正文');
  const closeBtn = makeButton('关闭面板');
  const row1 = document.createElement('div'); row1.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;';
  row1.append(pickBtn, feedBtn, deepBtn);
  const row2 = document.createElement('div'); row2.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;';
  row2.append(updateBtn,detailBtn,pauseBtn, csvBtn, closeBtn);
  root.append(row1,row2);
  const options = document.createElement('div');
  options.style.cssText='display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:10px 0;';
  const delayControl = makeNumber('每次请求间隔(ms)', 1500, 700, 60000);
  const pageControl = makeNumber('每位 UP 最多页数 (0=一直翻页)', 0, 0, 5000);
  const feedControl = makeNumber('关注流最多页数 (0=一直翻页)', 0, 0, 5000);
  const detailControl = makeNumber('每次补全图文详情条数', 40, 1, 2000);
  options.append(delayControl.wrap,pageControl.wrap,feedControl.wrap,detailControl.wrap);
  root.append(options);
  const status = document.createElement('div');status.style.cssText='font-weight:bold;color:#62cbff;margin:8px 0;white-space:pre-wrap;';status.textContent='尚未开始';root.append(status);
  const logArea = document.createElement('pre');logArea.style.cssText='max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-all;background:#08090a;color:#bcc9ce;padding:9px;border-radius:6px;';root.append(logArea);
  document.body.append(root);

  let directory = null;
  let active = false;
  let cancelled = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const timestamp = () => new Date().toISOString();
  const log = (msg) => { const line = `[${new Date().toLocaleTimeString()}] ${msg}`; logArea.textContent += `${line}\n`; logArea.scrollTop=logArea.scrollHeight; console.log('[BiliCollector]',msg); };
  function makeButton(label) {
    const el=document.createElement('button');el.textContent=label;el.type='button';
    el.style.cssText='padding:5px 9px;border-radius:6px;color:#fff;background:#3264a8;border:1px solid #5989c5;cursor:pointer;font:inherit;';
    return el;
  }
  function makeNumber(label,value,min,max) {
    const wrap=document.createElement('label');wrap.style.cssText='display:flex;flex-direction:column;gap:3px;font-size:12px;';wrap.textContent=label;
    const input=document.createElement('input');input.type='number';input.value=value;input.min=min;input.max=max;
    input.style.cssText='width:112px;color:#eee;background:#303136;border:1px solid #777;padding:4px;border-radius:5px;';wrap.append(input);
    return {wrap,input};
  }
  const val=(ctrl)=>Math.max(Number(ctrl.input.min),Math.min(Number(ctrl.input.max),Number(ctrl.input.value)||0));
  const checkStop=()=>{ if (cancelled) throw new Error('用户暂停；已完成部分保存在本地，可以重新启动'); };
  const base='https://api.bilibili.com';
  async function request(path, params={}) {
    const url=new URL(path,base);
    for(const [k,v] of Object.entries(params)) if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));
    for(let attempt=0;attempt<3;attempt++){
      checkStop();
      if (attempt) await sleep((attempt+1)*4000);
      let response;
      try {
        response=await fetch(url.toString(), {credentials:'include',mode:'cors',cache:'no-store',headers:{Accept:'application/json'}});
      } catch(e){if(attempt===2)throw new Error(`网络/CORS 请求失败: ${String(e.message||e)}`);continue;}
      if([403,412,429].includes(response.status)) throw new Error(`触发请求限制 HTTP ${response.status}，已停止，请勿高频重试`);
      if(!response.ok) {if(attempt===2)throw new Error(`HTTP ${response.status} ${url.pathname}`);continue;}
      let result;
      try{result=await response.json();}catch{if(attempt===2)throw new Error('JSON解析失败');continue;}
      if(result.code===0) {await sleep(val(delayControl));return result.data||{};}
      if([-101,-111].includes(result.code)) throw new Error('登录失效，请确认当前 B站网页已经登录');
      if([-352,-412].includes(result.code)) throw new Error(`接口校验/风控 ${result.code} ${result.message||''}，已停止`);
      if(attempt===2)throw new Error(`API返回错误 ${result.code}: ${result.message||'未知'}`);
    }
    throw new Error('重试后仍失败');
  }
  async function writeJSON(name,obj){return writeText(name,JSON.stringify(obj,null,2),'application/json');}
  async function writeText(name,contents) {
    if(!directory)throw new Error('还没有选择目录');
    const parts=name.split('/');
    let parent=directory;
    for (const segment of parts.slice(0,-1)) parent=await parent.getDirectoryHandle(segment,{create:true});
    const file=await parent.getFileHandle(parts[parts.length-1],{create:true});
    const handle=await file.createWritable();
    try{await handle.write(contents);await handle.close();}catch(e){try{await handle.abort();}catch{}throw e;}
  }
  async function readJSON(name){
    try {
      const parts=name.split('/');let parent=directory;
      for (const segment of parts.slice(0,-1))parent=await parent.getDirectoryHandle(segment);
      const file=await (await parent.getFileHandle(parts[parts.length-1])).getFile();
      return JSON.parse(await file.text());
    }catch(e){if(e.name==='NotFoundError')return null;throw e;}
  }
  async function identity(){
    const info=await request('/x/web-interface/nav');
    if(!info.isLogin||!info.mid)throw new Error('B 站尚未登录，请先登录该页面');
    const account={uid:String(info.mid),name:info.uname||''};
    const owner=await readJSON('owner.json');
    if(owner&&owner.uid!==account.uid)throw new Error(`这个目录属于 UID ${owner.uid}，请为当前账号选择另一个目录`);
    if(!owner)await writeJSON('owner.json',account);
    log(`当前账号：${info.uname||'未知'} / UID ${info.mid}`);
    return account;
  }
  async function withTask(title,func){
    if(active){log('另一个任务正在执行，请先停止');return;}
    if(!directory){log('请先选择保存目录');return;}
    active=true;cancelled=false;status.textContent=`运行中：${title}`;
    try{await func();status.textContent=`已结束：${title}（请查看日志与本地文件）`;}
    catch(e){status.textContent=`采集停止：${e.message||e}`;log(`停止：${e.message||e}`);}
    finally{active=false;cancelled=false;}
  }
  async function getFollowings(account){
    const previous=await readJSON('followings.json');
    const people=new Map((previous?.account?.uid===account.uid?(previous.followings||[]):[]).map(u=>[String(u.uid),u]));
    let page=1;let expected=null;let complete=false;let stopReason='';
    while(page<=500){
      checkStop();
      const data=await request('/x/relation/followings',{vmid:account.uid,pn:page,ps:50});
      const list=Array.isArray(data.list)?data.list:[];
      if(typeof data.total==='number')expected=data.total;
      const old=people.size;
      for(const user of list){if(user.mid!=null)people.set(String(user.mid),{uid:String(user.mid),name:user.uname||'',face:user.face||'',sign:user.sign||'',special:user.special||0});}
      log(`关注页 ${page}：${list.length} 条，总计 ${people.size}${expected!=null?'/'+expected:''}`);
      if(!list.length){complete=expected==null||people.size>=expected;stopReason=complete?'已到分页末尾':'接口提前返回空列表';break;}
      if(page>1&&people.size===old&&(!expected||people.size<expected)){log('当前页全部为此前保存的关注账号，继续检查接口分页');}
      if(expected!=null&&people.size>=expected){complete=true;stopReason='数量与 API 报告一致';break;}
      if(list.length<50){complete=expected==null||people.size>=expected;stopReason=complete?'不足一页':'提前结束';break;}
      page++;
    }
    if(page>500)stopReason='达到安全上限 500 页';
    const archive={source:'followings',account,obtainedAt:timestamp(),expected,complete,stopReason,followings:[...people.values()]};
    await writeJSON('followings.json',archive);
    if(!complete)log(`注意：关注列表不完整：${stopReason}；${people.size}/${expected??'未知'}`);
    return archive;
  }
  async function collectFeed(account){
    const old=await readJSON('feed.json');
    const archive=old&&old.account?.uid===account.uid?old:{account,items:[],pageCount:0,offset:'',complete:false,stopReason:'',retrievedAt:timestamp()};
    if(archive.complete){archive.offset='';archive.complete=false;archive.pageCount=0;} // 新一轮刷新从首页开始，同时保留历史归档
    const seen=new Set(archive.items.map(x=>String(x.id_str)));
    const pageLimit=val(feedControl);let pagesThisRun=0;
    while(true){
      checkStop();
      if(pageLimit&&pagesThisRun>=pageLimit){archive.stopReason='达到用户设置的关注流页数上限';break;}
      const previous=archive.offset;
      const data=await request('/x/polymer/web-dynamic/v1/feed/all',{type:'all',offset:archive.offset||undefined,timezone_offset:-480});
      const items=Array.isArray(data.items)?data.items:[];
      let added=0;
      for(const item of items){if(item.id_str!=null&&!seen.has(String(item.id_str))){archive.items.push(item);seen.add(String(item.id_str));added++;}}
      archive.pageCount++;pagesThisRun++;
      archive.offset=String(data.offset??'');
      log(`关注动态第 ${archive.pageCount} 页：新增 ${added}，累计 ${seen.size}`);
      if(!data.has_more){archive.complete=true;archive.stopReason='API has_more=false';}
      else if(!items.length||previous===archive.offset){archive.stopReason='页面无数据或分页游标未变化';}
      await writeJSON('feed.json',archive);
      if(archive.complete||!items.length||previous===archive.offset)break;
    }
    await writeJSON('feed.json',archive);
    log(`关注流已写入 feed.json，总计 ${archive.items.length} 条；${archive.stopReason}`);
  }
  async function collectSpace(user,account,refresh=false){
    const path=`up/${user.uid}.json`;
    const old=await readJSON(path);
    if(old&&old.accountUid===account.uid&&old.complete&&!refresh){log(`跳过已完成：${user.name} (${user.uid}) ${old.items?.length||0}条`);return {skipped:true,count:old.items?.length||0};}
    const a=old&&old.accountUid===account.uid?old:{uid:user.uid,name:user.name,accountUid:account.uid,items:[],pageCount:0,offset:'',complete:false,stopReason:'',startedAt:timestamp()};
    const seen=new Set(a.items.map(x=>String(x.id_str)));
    const refreshHead=!!(refresh&&old?.complete);
    if(refreshHead)a.offset='';
    const max=val(pageControl);let nowPages=0;
    while(true){
      checkStop();
      if(max&&nowPages>=max){a.stopReason=`单 UP 本轮达到 ${max} 页上限（可再次运行续抓）`;break;}
      const prev=a.offset;
      let data;
      try{data=await request('/x/polymer/web-dynamic/v1/feed/space',{host_mid:user.uid,offset:a.offset||undefined,timezone_offset:-480});}
      catch(e){a.stopReason=`接口错误：${e.message||e}`;await writeJSON(path,a);throw e;}
      const items=Array.isArray(data.items)?data.items:[];
      let added=0;
      let oldHits=0;
      for(const item of items){if(item.id_str!=null){const id=String(item.id_str);if(!seen.has(id)){a.items.push(item);seen.add(id);added++;}else{oldHits++;const index=a.items.findIndex(x=>String(x.id_str)===id);if(index>=0)a.items[index]=item;}}}
      a.pageCount++;nowPages++;a.offset=String(data.offset??'');a.updatedAt=timestamp();
      if(!data.has_more){a.complete=true;a.stopReason='API has_more=false';}
      else if(refreshHead&&oldHits>0){a.complete=true;a.stopReason='已与此前完整归档衔接（近期增量已完成）';}
      else if(!items.length||a.offset===prev){a.stopReason='接口没有更多可翻页内容';}
      await writeJSON(path,a); // 每页落盘，尽量避免暂停时丢失已抓取页面
      if(a.complete||!items.length||a.offset===prev)break;
    }
    await writeJSON(path,a);
    log(`完成 ${user.name} (${user.uid})：${a.items.length} 条 / ${a.pageCount} 页；${a.stopReason}`);
    return {skipped:false,count:a.items.length,complete:a.complete};
  }
  async function deepArchive(refresh=false){
    const account=await identity();
    const follows=await getFollowings(account);
    const report={account,updatedAt:timestamp(),totalFollowings:follows.followings.length,followingsComplete:follows.complete,success:0,skipped:0,failed:[],incomplete:[],totalPostsObserved:0};
    for(let index=0;index<follows.followings.length;index++){
      checkStop();
      const user=follows.followings[index];
      status.textContent=`[${index+1}/${follows.followings.length}] ${user.name} (${user.uid})`;
      try{
        const result=await collectSpace(user,account,refresh);
        report.totalPostsObserved+=result.count;
        if(result.skipped)report.skipped++;else report.success++;
        if(!result.skipped&&!result.complete)report.incomplete.push(user.uid);
      }catch(e){
        if(cancelled)break;
        report.failed.push({uid:user.uid,name:user.name,error:String(e.message||e)});
        log(`UP 采集失败：${user.name}: ${e.message||e}`);
        if(/请求限制|登录失效|风控|校验|CORS/.test(String(e.message||e))){
          report.stopReason='发生认证、网络或风控问题，停止全部采集';break;
        }
      }
      if(index%5===0)await writeJSON('report.json',report);
    }
    report.updatedAt=timestamp();await writeJSON('report.json',report);
    log(`报告已存 report.json：成功${report.success}，跳过${report.skipped}，失败${report.failed.length}，未完全翻页${report.incomplete.length}`);
  }
  async function collectOpusDetails(){
    await identity();
    const ids=new Set();const feed=await readJSON('feed.json');
    const addItem=item=>{if(item?.id_str && item.modules?.module_dynamic?.major?.type==='MAJOR_TYPE_OPUS')ids.add(String(item.id_str));if(item?.orig)addItem(item.orig);};
    for(const item of feed?.items||[])addItem(item);
    let inspected=0;const dir=await directory.getDirectoryHandle('up').catch(e=>{if(e.name==='NotFoundError')return null;throw e;});
    if(dir)for await(const [name,handle] of dir.entries()){checkStop();if(handle.kind!=='file'||!name.endsWith('.json'))continue;const file=JSON.parse(await (await handle.getFile()).text());for(const item of file.items||[])addItem(item);}
    log(`待检查图文动态 ${ids.size} 条`);let done=0,skip=0,failed=0;
    for(const id of ids){
      checkStop();if(done>=val(detailControl))break;
      if(await readJSON(`detail/${id}.json`)){skip++;continue;}
      try{const detail=await request('/x/polymer/web-dynamic/v1/opus/detail',{id,features:'htmlNewStyle,onlyfansVote,onlyfansAssetsV2'});await writeJSON(`detail/${id}.json`,detail);done++;}
      catch(e){failed++;log(`图文详情 ${id} 获取失败：${e.message||e}`);if(/请求限制|登录失效|风控|校验|CORS/.test(String(e.message||e)))throw e;}
      if((done+failed)%10===0)log(`图文详情：新增 ${done}，失败 ${failed}，已有 ${skip}`);
    }
    log(`图文补全结束：新增 ${done} 条、失败 ${failed} 条、已有 ${skip} 条。详细内容存储在 detail/。`);
  }
  function extractText(item){
    const d=item.modules?.module_dynamic||{};
    const major=d.major||{};
    const text=[d.desc?.text,major?.opus?.summary?.text,major?.archive?.title,major?.archive?.desc,major?.article?.title,major?.live_rcmd?.content?.title]
      .filter(x=>typeof x==='string'&&x.trim());
    return [...new Set(text)].join(' | ');
  }
  function toCSV(rows){
    const keys=['id','uid','up_name','published','type','text','url'];
    const esc=x=>{
      let value=String(x??'').replaceAll(/\r?\n/g,' ');
      if(/^\s*[=+@-]/.test(value)) value="'"+value; // prevent CSV formula execution in spreadsheets
      return '"'+value.replaceAll('"','""')+'"';
    };
    return '\ufeff'+[keys.map(esc).join(','),...rows.map(x=>keys.map(k=>esc(x[k])).join(','))].join('\r\n');
  }
  async function exportCSV(){
    const rows=new Map();
    function merge(item){
      if(!item||item.id_str==null)return;
      const author=item.modules?.module_author||{};
      const id=String(item.id_str);const pub=author.pub_ts?new Date(Number(author.pub_ts)*1000).toISOString():'';
      rows.set(id,{id,uid:String(author.mid??''),up_name:author.name||'',published:pub,type:item.type||'',text:extractText(item),url:`https://t.bilibili.com/${encodeURIComponent(id)}`});
    }
    const feed=await readJSON('feed.json');for(const item of(feed?.items||[]))merge(item);
    let files=0;
    try{
      const dir=await directory.getDirectoryHandle('up');
      for await(const [name,handle] of dir.entries()){
        if(handle.kind!=='file'||!name.endsWith('.json'))continue;
        const data=JSON.parse(await(await handle.getFile()).text());
        for(const item of(data.items||[]))merge(item);
        files++;
      }
    }catch(e){if(e.name!=='NotFoundError')throw e;}
    const sorted=[...rows.values()].sort((a,b)=>b.published.localeCompare(a.published));
    await writeText('all_dynamics.csv',toCSV(sorted));
    log(`CSV已生成：all_dynamics.csv；汇总 ${files} 位 UP，去重后 ${sorted.length} 条动态。`);
  }
  pickBtn.onclick=async()=>{
    if(active)return;
    try{directory=await window.showDirectoryPicker({mode:'readwrite',id:'weepwood-bili-dynamics'});log(`保存目录：${directory.name}`);status.textContent=`保存到：${directory.name}`;}
    catch(e){if(e.name!=='AbortError')log(`选择目录失败：${e.message||e}`);}
  };
  feedBtn.onclick=()=>withTask('关注流',async()=>collectFeed(await identity()));
  deepBtn.onclick=()=>withTask('关注UP主深度归档',()=>deepArchive(false));
  updateBtn.onclick=()=>withTask('更新全部UP近期动态',()=>deepArchive(true));
  detailBtn.onclick=()=>withTask('补全图文长正文',collectOpusDetails);
  csvBtn.onclick=()=>withTask('汇总 CSV',exportCSV);
  pauseBtn.onclick=()=>{cancelled=true;log('已请求暂停，将在当前请求后停止并保存已完成数据');};
  closeBtn.onclick=()=>{if(active){log('先暂停当前任务，再关闭');return;}root.remove();};
  log('面板已准备。请选择本地文件夹开始采集。');
})();
