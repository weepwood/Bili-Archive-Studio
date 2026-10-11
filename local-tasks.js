'use strict';
/** Explicitly limited to *local* reindexing and media caching, not account API crawling. */
class LocalTasks {
  constructor(db,{reindex,listMedia,cacheOne}) {
    this.db=db;this.ops={reindex,listMedia,cacheOne};this.active=null;
    db.recoverTasks();
  }
  start(kind) {
    if(!['reindex','cache'].includes(kind))throw Object.assign(new Error('不支持该任务类型'),{statusCode:400});
    if(this.active)throw Object.assign(new Error('已有本地任务正在执行'),{statusCode:409});
    const task=this.db.createTask(kind);
    const control={id:task.id,cancel:false};this.active=control;
    // Defer execution so the API can respond with its task ID.
    this.runPromise=new Promise(resolve=>setImmediate(resolve)).then(()=>this.execute(task,control));
    this.runPromise.catch(e=>{ console.error('本地任务执行异常：',e); });
    return task;
  }
  cancel(id){
    if(!this.active || this.active.id!==id)throw Object.assign(new Error('任务不存在或已经结束'),{statusCode:409});
    this.active.cancel=true;
    return this.db.updateTask(id,{state:'stopping',message:'已请求停止，等待当前操作结束'});
  }
  retry(id){
    const previous=this.db.getTask(id);
    if(!previous)throw Object.assign(new Error('找不到任务'),{statusCode:404});
    if(!['interrupted','failed','cancelled'].includes(previous.state))throw Object.assign(new Error('此任务不能重试'),{statusCode:409});
    return this.start(previous.kind);
  }
  async waitForIdle(){if(this.runPromise)await this.runPromise;}
  async execute(task,control){
    const id=task.id;
    this.db.updateTask(id,{state:'running',message:'任务已启动'});
    try{
      if(task.kind==='reindex'){
        await this.ops.reindex();
        this.db.updateTask(id,control.cancel?{state:'cancelled',message:'任务执行后收到停止请求；本次索引已经完成'}:{state:'completed',done:1,total:1,message:'本地 JSON 已导入索引'});
      } else {
        const urls=await this.ops.listMedia();let done=0,failed=0;
        this.db.updateTask(id,{total:urls.length,message:`需要处理 ${urls.length} 项媒体`});
        for(const url of urls){
          if(control.cancel)break;
          try{await this.ops.cacheOne(url);}catch(e){failed++;}
          done++;
          if(done%5===0||done===urls.length)this.db.updateTask(id,{done,failed,message:`已检查 ${done}/${urls.length}，失败 ${failed}`});
        }
        this.db.updateTask(id,{state:control.cancel?'cancelled':'completed',done,failed,message:control.cancel?'任务已停止，已下载文件保留':`完成 ${done} 项，失败 ${failed} 项`});
      }
    }catch(e){this.db.updateTask(id,{state:'failed',message:String(e.message||e).slice(0,500)});}
    finally {if(this.active===control)this.active=null;}
  }
}
module.exports={LocalTasks};
