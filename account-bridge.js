'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
class AccountBridge {
  constructor(dataDir, options={}) {
    this.file=path.join(dataDir, 'linked-account.json');
    this.now=options.now||(()=>Date.now());
    this.codeGenerator=options.codeGenerator||(()=>String(crypto.randomInt(0,100000000)).padStart(8,'0'));
    this.pair=null;
    this.linked=null;
    try {
      const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if (this.validate(saved)) this.linked=saved;
    } catch(e) { if(e.code!=='ENOENT') this.loadError=String(e.message||e); }
  }
  validate(v) {
    return !!v && typeof v.uid==='string' && /^\d{1,20}$/.test(v.uid) &&
      typeof v.name==='string' && v.name.trim().length>0 && v.name.length<=80 &&
      (v.avatar===undefined || (typeof v.avatar==='string' && v.avatar.length<=512)) &&
      !('cookie' in v) && !('token' in v) && !('SESSDATA' in v);
  }
  start(){
    this.pair={code:this.codeGenerator(),expires:this.now()+5*60*1000,tries:0};
    return {code:this.pair.code,expiresAt:new Date(this.pair.expires).toISOString()};
  }
  async connect(code, payload){
    const pair=this.pair;
    if(!pair || this.now()>pair.expires) {this.pair=null;const e=Error('连接码已过期，请重新生成');e.statusCode=403;throw e;}
    pair.tries++;
    if(pair.tries>=8) this.pair=null;
    const a=Buffer.from(String(code||'')),b=Buffer.from(pair.code);
    if(a.length!==b.length || !crypto.timingSafeEqual(a,b)){const e=Error('连接码无效');e.statusCode=403;throw e;}
    const record={uid:String(payload?.uid??''),name:String(payload?.name??'').trim(),avatar:String(payload?.avatar??''),linkedAt:new Date(this.now()).toISOString()};
    if(!this.validate(record)){const e=Error('账号资料格式错误');e.statusCode=400;throw e;}
    const tmp=this.file+'.tmp';
    await fsp.writeFile(tmp,JSON.stringify(record,null,2),{encoding:'utf8',mode:0o600});
    await fsp.rename(tmp,this.file);
    this.linked=record;
    this.pair=null;
    return {linkedAccount:this.linked};
  }
  async disconnect(){
    this.pair=null;this.linked=null;
    await fsp.rm(this.file,{force:true});
    return {linkedAccount:null};
  }
}
module.exports={AccountBridge};
