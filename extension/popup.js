'use strict';
const output=document.getElementById('result');
async function send(action,extra={}){
  output.textContent='操作中…';
  try {
    const r=await chrome.runtime.sendMessage({action,...extra});
    if(!r?.ok)throw Error(r?.error||'操作失败');
    output.textContent=action==='link'?'已关联：'+r.account.name+'（UID '+r.account.uid+'）。返回客户端即可查看。':action==='collect'?'采集面板已在 B 站网页打开。':'已打开 B 站登录页面。';
  }catch(e){output.textContent='失败：'+String(e.message||e)}
}
document.getElementById('login').onclick=()=>send('open-login');
document.getElementById('link').onclick=()=>send('link',{code:document.getElementById('pair').value});
document.getElementById('collect').onclick=()=>send('collect');
