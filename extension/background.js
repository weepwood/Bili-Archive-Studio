chrome.action.onClicked.addListener(async tab=>{
  if(!tab.id)return;
  if(!/^https:\/\/(?:[\w-]+\.)*bilibili\.com\//i.test(tab.url||'')){
    await chrome.tabs.create({url:'https://www.bilibili.com/'});return;
  }
  try{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js'],world:'MAIN'});}catch(e){console.error('启动归档采集器失败',e);}
});
