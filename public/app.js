(() => {
'use strict';
const $ = s => document.querySelector(s);
const EMPTY_AVATAR='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#d7eff8"/><circle cx="50" cy="38" r="19" fill="#9cd2e4"/><path d="M14 94a36 36 0 0 1 72 0" fill="#9cd2e4"/></svg>');
const state = {type:'all',uid:'',q:'',page:1,sort:'newest',loaded:[],total:0,users:[],status:null};
const el = (tag, cls='', text='') => {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined && text!==null)n.textContent=String(text);return n;};
function toast(message){const n=$('#toast');n.textContent=message;n.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>n.classList.remove('show'),3200);}
async function get(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}
async function post(url){const r=await fetch(url,{method:'POST',headers:{'X-Bili-Archive':'1'}});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}
function imageUrl(src){return src ? '/api/media?url='+encodeURIComponent(src) : '';}
function photo(src,css=''){const i=el('img',css);i.loading='lazy';i.referrerPolicy='no-referrer';i.alt='';if(src){i.src=imageUrl(src);i.onerror=()=>{i.onerror=()=>{i.onerror=null;i.src=EMPTY_AVATAR;};i.src=src;};}else i.src=EMPTY_AVATAR;return i;}
function dateLabel(ms){if(!ms)return '发布时间未知';return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(ms));}
function fmt(num){if(num==null)return '0';let n=Number(num)||0;return n>=10000?(n/10000).toFixed(1)+'万':String(n);}
function link(text,url,cls=''){const a=el('a',cls,text);if(typeof url==='string'&&/^https:\/\//.test(url)){a.href=url;a.target='_blank';a.rel='noopener noreferrer';}else a.href='#';return a;}
function openLight(images,i=0){if(!images.length)return;let idx=i;const b=$('#lightbox');b.hidden=false;const paint=()=>{$('#lightImage').src=imageUrl(images[idx]);$('#lightImage').onerror=()=>{$('#lightImage').onerror=null;$('#lightImage').src=images[idx];};$('#lightPosition').textContent=(idx+1)+' / '+images.length;};$('#lightPrev').onclick=()=>{idx=(idx+images.length-1)%images.length;paint();};$('#lightNext').onclick=()=>{idx=(idx+1)%images.length;paint();};paint();}
function imageGrid(images){const selected=images.slice(0,9);const grid=el('div','image-grid'+(images.length===1?' single':images.length===2?' two':''));selected.forEach((src,i)=>{const b=el('button','image-cell');b.type='button';b.setAttribute('aria-label',`查看第${i+1}张图片`);b.append(photo(src));if(i===8&&images.length>9)b.append(el('span','more-images','+'+(images.length-9)));b.onclick=()=>openLight(images,i);grid.append(b);});return grid;}
function videoCard(p){const url=p.videoUrl||p.articleUrl||p.sourceUrl;const card=link('',url,'video-card');const cover=el('div','video-cover');if(p.cover)cover.append(photo(p.cover));else cover.append(el('div','placeholder','视频封面'));cover.append(el('span','play','▶'));if(p.duration)cover.append(el('span','duration',p.duration));const detail=el('div','video-details');detail.append(el('strong','',p.title||'查看原视频'));detail.append(el('small','',p.type==='video'?'播放视频 · 跳转哔哩哔哩':'打开原文'));card.append(cover,detail);return card;}
function content(p, nested=false){const fragment=document.createDocumentFragment();if(p.title && p.type!=='video')fragment.append(el('div','post-title',p.title));if(p.text){const block=el('div','post-text',p.text);if(p.text.length>350&&!nested){block.classList.add('clamped');const expand=el('button','expand-text','展开全文');expand.onclick=()=>{block.classList.toggle('clamped');expand.textContent=block.classList.contains('clamped')?'展开全文':'收起';};fragment.append(block,expand);}else fragment.append(block);}
 if(p.images?.length)fragment.append(imageGrid(p.images));if((p.type==='video' || p.type==='article')&&(p.videoUrl||p.articleUrl||p.cover))fragment.append(videoCard(p));
 if(p.forward && !nested){const wrap=el('div','forward-card');const author=link('@'+(p.forward.author||'原作者'),p.forward.uid?'https://space.bilibili.com/'+encodeURIComponent(p.forward.uid):p.forward.sourceUrl,'forward-author');wrap.append(author,el('div','forward-text',p.forward.text||p.forward.title||''));if(p.forward.images?.length)wrap.append(imageGrid(p.forward.images));if(p.forward.videoUrl||p.forward.cover)wrap.append(videoCard(p.forward));wrap.append(link('查看被转发动态 ↗',p.forward.sourceUrl,'inline-link'));fragment.append(wrap);}
 if(!p.text&&!p.images?.length&&!p.cover&&!p.forward){fragment.append(el('div','post-text','该动态的内容模块暂不可解析，可访问原始动态查看。'));}
 return fragment;
}
function card(p){const c=el('article','post');const head=el('div','post-head');const avatar=photo(p.avatar,'poster-avatar');const avatarLink=link('',`https://space.bilibili.com/${encodeURIComponent(p.uid)}`);avatarLink.append(avatar);const info=el('div','post-identity');info.append(link(p.author||'未知作者',`https://space.bilibili.com/${encodeURIComponent(p.uid)}`,'author-name'));info.append(el('div','date',dateLabel(p.published)+' · '+({video:'投稿了视频',image:'发布了图文动态',forward:'转发了动态',text:'发布了动态',article:'发布了专栏',live:'发布了直播动态'}[p.type]||'发布了动态')));head.append(avatarLink,info);head.append(link('查看原文 ↗',p.sourceUrl,'idlink'));c.append(head);
 const body=el('div','post-body');body.append(content(p));c.append(body);
 const footer=el('div','post-footer');const share=el('button');share.append(el('i','','↗'),el('span','',fmt(p.shares)));share.onclick=()=>{navigator.clipboard?.writeText(p.sourceUrl).then(()=>toast('动态链接已复制')).catch(()=>toast('请使用查看原文复制链接'));};
 const comments=link('',p.sourceUrl);comments.append(el('i','','▢'),el('span','',fmt(p.comments)));
 const likes=link('',p.sourceUrl);likes.append(el('i','','♡'),el('span','',fmt(p.liked)));
 footer.append(share,comments,likes);c.append(footer);return c;
}
function empty(initial){const e=el('div','empty');e.append(el('div','empty-icon','▤'));e.append(el('h3','',initial?'你的动态档案馆尚未导入数据':'没有找到符合条件的动态'));
 const p=el('p');p.textContent=initial?'首先在哔哩哔哩已登录页面使用采集器，将关注动态保存到本地目录。然后让本阅读器使用同一个数据目录启动。':'尝试更换关键词或选择其他动态分类。';e.append(p);
 if(initial){const code=el('p');code.append(el('code','','node server.js --data "你的归档目录"'));e.append(code);}return e;
}
function highlightFilter(){document.querySelectorAll('[data-tab],[data-filter]').forEach(b=>{const type=b.dataset.tab||b.dataset.filter;b.classList.toggle('active',type===state.type);});$('#allBadge').textContent=String(state.status?.posts||0);const label=state.uid?state.users.find(u=>u.uid===state.uid)?.name+' · 动态':'探索已保存的点滴与精彩';$('#filterSubtitle').textContent=label||'探索已保存的点滴与精彩';}
async function fetchPosts(reset=false){try{
 if(reset){state.page=1;state.loaded=[];$('#feed').replaceChildren();}
 const params=new URLSearchParams({type:state.type,uid:state.uid,q:state.q,page:String(state.page),size:'12',sort:state.sort});const data=await get('/api/posts?'+params);
 state.total=data.total;state.loaded.push(...data.items);for(const p of data.items)$('#feed').append(card(p));
 $('#searchCount').textContent=state.total+' 条动态';
 $('#loadMore').hidden=state.loaded.length>=data.total||data.total===0;
 if(!state.loaded.length)$('#feed').append(empty(!state.status?.posts));
 highlightFilter();
 }catch(e){toast('读取动态失败：'+e.message);}}
function selectType(type){state.type=type;state.page=1;fetchPosts(true);window.scrollTo({top:0,behavior:'smooth'});}
function selectUser(uid){state.uid=uid;fetchPosts(true);$('#modal').hidden=true;window.scrollTo({top:0,behavior:'smooth'});}
function renderUsers(){const bar=$('#avatarScroller');bar.replaceChildren();const users=state.users.slice(0,15);if(!users.length){bar.append(el('div','ghost-avatars','尚无 UP 主资料，请先使用采集器获取关注列表。'));return;}
 for(const u of users){const b=el('button','follow-user');const av=el('span','avatar-wrap');av.append(photo(u.avatar));b.append(av,el('span','',u.name||u.uid));b.onclick=()=>selectUser(u.uid);bar.append(b);}
 const top=$('#topUsers');top.replaceChildren();for(const u of state.users.slice(0,6)){const b=el('button','top-user');b.append(photo(u.avatar));const label=el('span','label');label.append(el('b','',u.name||u.uid),el('small','',u.count+' 条动态已归档'));b.append(label);b.onclick=()=>selectUser(u.uid);top.append(b);}
 if(!top.children.length)top.append(el('span','ghost-avatars','暂无数据'));
}
function renderStatus(s){state.status=s;$('#accountName').textContent=s.account?.name||'本地归档';$('#accountUid').textContent=s.account?.uid?'UID: '+s.account.uid:'尚未连接账号';$('#statUsers').textContent=fmt(s.authors);$('#statUsersLeft').textContent=fmt(s.authors);$('#statPosts').textContent=fmt(s.posts);$('#statPostsLeft').textContent=fmt(s.posts);$('#statMedia').textContent=fmt(s.media.cached);$('#statRich').textContent=fmt((s.types.image||0)+(s.types.video||0));const h=s.health||{};const complete=h.followingsComplete;const count=h.incomplete?.length||0;$('#healthBrief').replaceChildren(el('div','',`关注列表：${h.followingsCollected||0} 人 / ${h.followingsExpected??'未知'} 人`),el('div',complete?'health-value':'health-warn',complete?'关注列表已翻页结束':'关注列表尚未确认完整'),el('div',count?'health-warn':'health-value',`UP 主未完结：${count} 人`),el('div','','图文详情待补全：'+(h.missingDetail||0)+' 条'));
 const m=s.media;$('#cacheInfo').textContent=`本地缓存 ${m.cached} 张 · 等待 ${m.queued} 张 · 下载中 ${m.active} · 失败 ${m.failed}${m.lastError?' · 最后错误：'+m.lastError:''}`;
 $('#stopCache').hidden=!m.caching;
 $('#cacheAll').disabled=!!m.caching;
}
function showModal(title,content){$('#modalTitle').textContent=title;$('#modalBody').replaceChildren(content);$('#modal').hidden=false;}
function showUsers(){const list=el('div','dialog-user-list');const all=el('button');all.append(el('span','','全部 UP 主 · '+state.users.length+' 人'));all.onclick=()=>selectUser('');list.append(all);
 for(const u of state.users){const b=el('button');b.append(photo(u.avatar));const label=el('span');label.append(el('b','',u.name||u.uid),el('small','',u.count+' 条 · UID '+u.uid));b.append(label);b.onclick=()=>selectUser(u.uid);list.append(b);}
 showModal('归档的 UP 主',list);
}
function showHealth(){const h=state.status?.health||{};const d=el('div','dialog-text');const rows=[['数据存储目录',state.status?.data||''],['已去重动态',state.status?.posts||0],['获取到的关注人数',h.followingsCollected||0],['API 报告的关注人数',h.followingsExpected??'未知'],['关注列表状态',h.followingsComplete?'已翻页结束':'未确认完整'],['空间归档文件',h.spaces||0],['未完全归档的 UP 主',h.incomplete?.length||0],['图文详情待补全',h.missingDetail||0],['错误 UP 主',h.failed?.length||0]];
 for(const [k,v] of rows){const r=el('div','details-row');r.append(el('b','',k),el('span','',v));d.append(r);}d.append(el('h3','','未完成归档的 UP 主'));
 for(const u of (h.incomplete||[]).slice(0,100))d.append(el('div','error-item',`${u.uid}: ${u.reason} (${u.count}条)`));
 for(const e of (h.failed||[]).slice(0,100))d.append(el('div','error-item',`${e.name||e.uid}: ${e.error}`));
 d.append(el('p','', '“接口已无更多页面”只代表该接口的可见分页结束，不能证明历史动态全部保存。已删除、私密、付费或平台未开放的内容无法保证获取。'));
 showModal('归档完整性报告',d);
}
async function boot(){try{const [s,u]=await Promise.all([get('/api/status'),get('/api/users')]);state.users=u.items||[];renderStatus(s);renderUsers();await fetchPosts(true);}catch(e){toast('连接本地服务失败：'+e.message);}}
 document.querySelectorAll('[data-filter],[data-tab]').forEach(b=>b.addEventListener('click',()=>selectType(b.dataset.filter||b.dataset.tab)));
 $('#loadMore').onclick=()=>{state.page++;fetchPosts(false);};
 let timer;$('#search').addEventListener('input',e=>{clearTimeout(timer);timer=setTimeout(()=>{state.q=e.target.value.trim();fetchPosts(true);},260);});
 $('#newest').onclick=()=>{state.sort='newest';$('#newest').classList.add('sort-active');$('#oldest').classList.remove('sort-active');fetchPosts(true);};
 $('#oldest').onclick=()=>{state.sort='oldest';$('#oldest').classList.add('sort-active');$('#newest').classList.remove('sort-active');fetchPosts(true);};
 for(const id of ['showUsers','usersMore','allUsersBtn'])$('#'+id).onclick=showUsers;
 for(const id of ['healthBtn','healthMore'])$('#'+id).onclick=showHealth;
 $('#refresh').onclick=async()=>{try{const r=await post('/api/reindex');toast(`已重新索引 ${r.count} 条动态`);await boot();}catch(e){toast(e.message);}};
 $('#cacheAll').onclick=async()=>{try{const r=await post('/api/cache');toast(`开始缓存 ${r.uncached} 张图片`);await boot();}catch(e){toast(e.message);}};
 $('#stopCache').onclick=async()=>{await post('/api/stop-cache');toast('已停止继续加入媒体队列（已有队列仍会完成）');};
 $('#modalClose').onclick=()=>$('#modal').hidden=true;$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')$('#modal').hidden=true;});
 $('#lightClose').onclick=()=>$('#lightbox').hidden=true;$('#lightbox').onclick=e=>{if(e.target.id==='lightbox')$('#lightbox').hidden=true;};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#lightbox').hidden=true;$('#modal').hidden=true;}if(!$('#lightbox').hidden){if(e.key==='ArrowLeft')$('#lightPrev').click();if(e.key==='ArrowRight')$('#lightNext').click();}});
 boot();setInterval(async()=>{try{const s=await get('/api/status');renderStatus(s);}catch{}},3500);
})();
