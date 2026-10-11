'use strict';
async function biliTab() {
  const tabs=await chrome.tabs.query({url:['https://*.bilibili.com/*']});
  const active=tabs.find(t=>t.active);
  const tab=active||tabs[0];
  if(!tab?.id)throw Error('请先在 Edge 或 Chrome 登录哔哩哔哩，并保持网页打开');
  return tab;
}
async function accountFromPage(tabId){
  const results=await chrome.scripting.executeScript({
    target:{tabId},world:'MAIN',
    func:async()=>{
      const r=await fetch('https://api.bilibili.com/x/web-interface/nav',{credentials:'include',cache:'no-store'});
      if(!r.ok)throw Error('哔哩哔哩登录接口 HTTP '+r.status);
      const payload=await r.json();
      if(payload.code!==0||!payload.data?.isLogin||!payload.data?.mid)throw Error('账号未登录，请先在 B 站网页登录');
      return {uid:String(payload.data.mid),name:String(payload.data.uname||''),avatar:String(payload.data.face||'')};
    }
  });
  if(!results[0]?.result)throw Error('无法读取当前 B 站登录信息');
  return results[0].result;
}
async function handle(message){
  if(message.action==='open-login'){
    await chrome.tabs.create({url:'https://www.bilibili.com/'});
    return {ok:true};
  }
  const tab=await biliTab();
  if(message.action==='collect'){
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js'],world:'MAIN'});
    await chrome.tabs.update(tab.id,{active:true});
    return {ok:true};
  }
  if(message.action==='link'){
    const code=String(message.code||'').trim();
    if(!/^\d{8}$/.test(code))throw Error('请填写工作台显示的 8 位连接码');
    const account=await accountFromPage(tab.id);
    let lastError;
    for(const port of [18765,8765]){
      try {
        const r=await fetch('http://127.0.0.1:'+port+'/api/account/link',{
          method:'POST',headers:{'Content-Type':'application/json','X-Bili-Archive-Pair':code},
          body:JSON.stringify(account)
        });
        const data=await r.json();
        if(!r.ok)throw Error(data.error||'本地关联失败 HTTP '+r.status);
        return {ok:true,account:data.linkedAccount,port};
      }catch(e){
        if(/连接码|账号资料|无效|过期|origin required/i.test(String(e.message)))throw e;
        lastError=e;
      }
    }
    throw Error('无法连接客户端，请确认已打开桌面程序并生成连接码。'+String(lastError?.message||''));
  }
  throw Error('未知操作');
}
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  handle(message).then(sendResponse,error=>sendResponse({ok:false,error:String(error.message||error)}));
  return true;
});
