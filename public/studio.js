(()=>{'use strict';
const $=s=>document.querySelector(s), mk=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text||'';if(cls)e.className=cls;return e;};
const css=document.createElement('link');css.rel='stylesheet';css.href='/studio.css';document.head.append(css);
const root=mk('div','','studio-screen');root.hidden=true;root.innerHTML=`<div class="studio-shell"><aside class="studio-side"><div class="studio-brand">◈ Bili Archive Studio <small>工作台</small></div><nav id="studioNav"><button data-page="home" class="sel">⌂ 首页概览</button><button data-page="read">▤ 动态阅读</button><button data-page="collect">↻ 采集中心</button><button data-page="account">♙ 登录 / 关联账号</button><button data-page="authors">♧ 关注管理</button><button data-page="media">▧ 媒体管理</button><button data-page="settings">⚙ 设置与帮助</button></nav><div class="studio-tip">只连接本地 127.0.0.1 服务。<br>归档数据不会自动上传。</div></aside><div class="studio-main"><header class="studio-header"><span id="studioTitle">首页概览</span><button id="studioClose">✕ 返回阅读器</button></header><div id="studioContent" class="studio-content"></div></div></div>`;document.body.append(root);
const pages={home:'首页概览',read:'动态阅读',collect:'采集中心',account:'登录 / 关联账号',authors:'关注管理',media:'媒体管理',settings:'设置与帮助'};
let state={page:'home',status:null,users:[],tasks:[],pair:null};
async function api(url,method='GET'){const r=await fetch(url,{method,headers:method==='POST'?{'X-Bili-Archive':'1'}:{}});if(!r.ok){let detail={};try{detail=await r.json()}catch{}throw Error(detail.error||('请求失败: '+r.status))}return r.json()}
function panel(title,body){const c=mk('section','','studio-card');c.append(mk('h3',title));if(typeof body==='string')c.append(mk('p',body));else c.append(body);return c;}
function action(label,cb,primary=false){const b=mk('button',label,'studio-btn'+(primary?' main':''));b.onclick=async()=>{b.disabled=true;try{await cb()}catch(e){alert(e.message)}finally{b.disabled=false}};return b;}
function row(container,...els){const r=mk('div','','studio-row');r.append(...els);container.append(r);return r}
function metric(label,value){const c=mk('div','','studio-metric');c.append(mk('div',String(value),'num'),mk('div',label,'hint'));return c}
function info(text){return mk('p',text,'studio-note')}
function taskBoard(tasks){
 const box=mk('section','','studio-card');box.append(mk('h3','本地任务历史与进度'));
 if(!tasks.length){box.append(info('尚无任务。开始一次“本地重新索引”或“媒体缓存”即可看到进度。'));return box;}
 const labels={reindex:'本地 JSON → SQLite 索引',cache:'媒体资源缓存'};
 const status={queued:'等待执行',running:'执行中',stopping:'正在停止',completed:'已完成',failed:'失败',cancelled:'已取消',interrupted:'意外中断'};
 for(const job of tasks.slice(0,20)){
   const el=mk('div','','studio-task');const head=mk('div','','studio-task-head');
   head.append(mk('strong',labels[job.kind]||job.kind),mk('span',status[job.state]||job.state,`studio-task-state state-${job.state}`));
   el.append(head);
   const count=job.total?`${job.done}/${job.total}`:(job.kind==='reindex'?'本地扫描':'准备中');
   el.append(mk('p',`${count} · ${job.message||'无详细说明'} · 失败 ${job.failed||0}`,'studio-task-desc'));
   if(job.total){const track=mk('div','','studio-progress');const bar=mk('div','','studio-progress-bar');bar.style.width=Math.min(100,Math.round(job.done/job.total*100))+'%';track.append(bar);el.append(track)}
   const actions=mk('div','','studio-task-actions');
   if(['running','queued','stopping'].includes(job.state)&&job.state!=='stopping')actions.append(action('停止任务',async()=>{await api('/api/tasks/cancel?id='+encodeURIComponent(job.id),'POST');await refresh()}));
   if(['failed','cancelled','interrupted'].includes(job.state))actions.append(action('重新执行',async()=>{await api('/api/tasks/retry?id='+encodeURIComponent(job.id),'POST');await refresh()}));
   if(actions.childElementCount)el.append(actions);
   box.append(el);
 }
 return box;
}

async function render(){const c=$('#studioContent');c.replaceChildren();$('#studioTitle').textContent=pages[state.page];document.querySelectorAll('#studioNav button').forEach(b=>b.classList.toggle('sel',b.dataset.page===state.page));const s=state.status||{},h=s.health||{},m=s.media||{};
if(state.page==='home'){const g=mk('div','','studio-metrics');g.append(metric('已归档动态',s.posts||0),metric('关注 UP 主',s.authors||0),metric('缓存媒体',m.cached||0),metric('待补全图文',h.missingDetail||0));c.append(g);c.append(panel('账号连接状态',s.linkedAccount?`已关联 B 站账号：${s.linkedAccount.name}（UID ${s.linkedAccount.uid}）；登录凭证仍保存在浏览器，客户端仅保存公开账号资料。`:'尚未关联 B 站账号。点击下方按钮完成浏览器登录与账号关联。'));const a=mk('div','','studio-actions');a.append(action(s.linkedAccount?'查看关联账号':'登录 / 关联 B 站账号',()=>setPage('account'),true),action('进入采集中心',()=>setPage('collect')),action('刷新归档索引',async()=>{await api('/api/reindex','POST');await refresh();}),action('阅读动态',()=>setPage('read')));c.append(a);}
if(state.page==='read'){closeStudio();return;}
if(state.page==='collect'){
 c.append(panel('账号动态采集 · 浏览器采集助手','已登录的 B 站页面中使用 Chrome / Edge 扩展进行关注流、逐人历史动态及 Opus 详情采集。扩展不会传输账号 Cookie。此阶段本工作台尚不能远程启动浏览器内的采集；请在扩展面板中执行。'));
 const browser=mk('div','','studio-actions');browser.append(action('打开 B 站动态',()=>window.open('https://t.bilibili.com','_blank','noopener')),action('查看安装步骤',()=>setPage('settings')));c.append(browser);
 c.append(panel('本地任务 · 可在工作台控制','下面的任务仅负责读取本地已保存的 JSON，更新 SQLite 搜索索引，或按需缓存图片与视频封面。数据抓取和本地整理是两类不同任务。'));
 const a=mk('div','','studio-actions');a.append(action('扫描 JSON 并更新 SQLite',async()=>{await api('/api/tasks/start?kind=reindex','POST');await refresh()},true),action('开始缓存未下载媒体',async()=>{await api('/api/tasks/start?kind=cache','POST');await refresh()}));c.append(a);
 c.append(taskBoard(state.tasks));
 c.append(panel('归档可访问性报告',`已经检查 ${h.spaces||0} 位 UP 的归档文件；未翻页完成 ${h.incomplete?.length||0} 位；采集失败 ${h.failed?.length||0} 位；待补全图文 ${h.missingDetail||0} 条。接口结束并不证明已经获取全部历史。`));
}
if(state.page==='account'){
 const linked=s.linkedAccount;
 const account=mk('div','','studio-account');
 account.append(mk('div',linked?'已关联':'未关联','studio-account-badge'+(linked?' linked':'')));
 account.append(mk('strong',linked?linked.name:'连接你的哔哩哔哩账号','studio-account-title'));
 account.append(info(linked?'UID '+linked.uid+' · 关联时间 '+(linked.linkedAt||'未知'):'通过 Edge / Chrome 的 B 站已登录页面完成账号关联。客户端不接收密码、Cookie 或 SESSDATA。'));
 if(s.accountMismatch)account.append(info('注意：关联账号与本地旧归档的 UID 不一致。请为不同账号使用独立归档目录，避免混淆。'));
 c.append(account);
 c.append(panel('步骤 1 · 登录哔哩哔哩','在 Edge 或 Chrome 打开哔哩哔哩官方网页并登录。桌面客户端不会直接复用浏览器 Cookie。'));
 c.append(action('打开 B 站登录页 ↗',()=>{window.open('https://www.bilibili.com/','_blank','noopener,noreferrer')},true));
 c.append(panel('步骤 2 · 安装采集助手','在 Edge / Chrome 扩展管理页开启开发者模式，加载已解压的 extension 文件夹（可从本版本 Release 下载扩展 ZIP）。扩展只访问 B 站和本地 127.0.0.1。'));
 const actions=mk('div','','studio-actions');
 actions.append(action('生成 8 位连接码',async()=>{state.pair=await api('/api/account/pair/start','POST');await render()},true));
 if(linked)actions.append(action('解除账号关联',async()=>{if(!confirm('解除账号关联？不会删除已经归档的数据。'))return;await api('/api/account/disconnect','POST');state.pair=null;await refresh()}));
 c.append(actions);
 if(state.pair){
   const expires=new Date(state.pair.expiresAt).getTime();
   if(Date.now()<expires){
     const codeCard=mk('div','','studio-code-card');
     codeCard.append(mk('span','连接码（5 分钟内有效）'));
     codeCard.append(mk('strong',state.pair.code,'studio-pair-code'));
     codeCard.append(info('在浏览器点击「Bili Archive Studio 采集助手」扩展 → 输入连接码 → 关联当前 B 站账号。关联成功后，此页面会自动更新。'));
     c.append(codeCard);
   } else state.pair=null;
 }
 c.append(panel('步骤 3 · 开始归档','在浏览器扩展中选择「打开动态采集面板」，再选择归档文件夹并采集。关联账号不等于已完成采集，数据仍需单独下载到本地。'));
}
if(state.page==='authors'){const search=mk('input','','studio-input');search.placeholder='搜索 UP 主名称或 UID';const list=mk('div','','studio-author-list');const draw=()=>{list.replaceChildren();for(const u of state.users.filter(x=>(x.name+' '+x.uid).toLowerCase().includes(search.value.toLowerCase())).slice(0,500)){const item=mk('div','','studio-author');item.append(mk('strong',u.name||u.uid),mk('span',`${u.count||0} 条 · UID ${u.uid}`));list.append(item)}};search.oninput=draw;c.append(search,list);draw();}
if(state.page==='media'){c.append(panel('媒体管理',`已保存 ${m.cached||0} 张 · 正在处理 ${m.active||0} · 排队 ${m.queued||0} · 失败 ${m.failed||0}`));const a=mk('div','','studio-actions');a.append(action('缓存全部图片和视频封面',async()=>{await api('/api/cache','POST');await refresh()},true),action('停止加入下载队列',async()=>{await api('/api/stop-cache','POST');await refresh()}));c.append(a);c.append(taskBoard(state.tasks));if(m.lastError)c.append(info('上次媒体错误：'+m.lastError));}
if(state.page==='settings'){c.append(panel('本地数据目录',s.data||'尚未加载'));c.append(panel('浏览器扩展安装','Chrome / Edge → 扩展管理 → 开发者模式 → 加载已解压的扩展程序 → 选择本项目 extension 目录。登录 B 站后点击工具栏的扩展图标。'));c.append(panel('安全说明','不要将 archive-data、Cookie、SESSDATA 上传公开仓库。碰到 API 限流或验证失败请停止采集，不要强行绕过。'));c.append(panel('存储引擎',s.database?.enabled?'SQLite 已启用 · archive.sqlite · FTS5 三元组索引，原始 JSON 未被修改':'数据库尚未初始化。启动程序后会自动建立 SQLite 索引。'));c.append(panel('版本说明','第二阶段：SQLite 与本地任务已集成。B 站网页 API 采集仍需浏览器扩展，Tauri Windows 测试版已提供。当前账号登录与采集通过浏览器扩展完成；本地任务不负责从 B 站抓取内容。'));}
}
async function refresh(){try{const [status,users,tasks]=await Promise.all([api('/api/status'),api('/api/users'),api('/api/tasks')]);state.status=status;state.users=users.items||[];state.tasks=tasks.items||[];if(status.linkedAccount)state.pair=null;await render();const accountButton=$('#accountLink');if(accountButton)accountButton.textContent=status.linkedAccount?'已关联：'+status.linkedAccount.name:'登录 / 关联账号'}catch(e){$('#studioContent').replaceChildren(info(e.message))}}
function closeStudio(){root.hidden=true;document.body.classList.remove('studio-open');}
function setPage(p){if(p==='read'){closeStudio();return;}state.page=p;render();}
function openStudio(p='home'){state.page=p;root.hidden=false;document.body.classList.add('studio-open');render();refresh();}
document.querySelectorAll('#studioNav button').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
$('#openStudio').addEventListener('click',()=>openStudio('home'));
$('#accountLink').addEventListener('click',()=>openStudio('account'));
$('#leaveReader').addEventListener('click',()=>openStudio('home'));
$('#studioClose').addEventListener('click',closeStudio);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)closeStudio()});
setInterval(()=>{if(!root.hidden&&['collect','media','home','account'].includes(state.page))refresh().catch(()=>{})},4000);
api('/api/status').then(s=>{if(!s.linkedAccount&&!s.account?.uid)openStudio('account');else {const a=$('#accountLink');if(a&&s.linkedAccount)a.textContent='已关联：'+s.linkedAccount.name;}}).catch(()=>{});
})();
