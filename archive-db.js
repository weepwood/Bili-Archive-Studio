'use strict';
/** SQLite is a derived searchable index; the JSON files remain the canonical archive. */
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

class ArchiveDB {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'archive.sqlite');
    this.db = new DatabaseSync(this.path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY, uid TEXT NOT NULL, kind TEXT NOT NULL, published INTEGER NOT NULL,
        author TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
        payload TEXT NOT NULL, signature TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_posts_time ON posts(published DESC,id DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_uid_time ON posts(uid,published DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_kind_time ON posts(kind,published DESC);
      CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(content, tokenize='trigram');
      CREATE TABLE IF NOT EXISTS authors(uid TEXT PRIMARY KEY,name TEXT NOT NULL,avatar TEXT NOT NULL,posts_count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS local_tasks (
        id TEXT PRIMARY KEY,kind TEXT NOT NULL,state TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_date ON local_tasks(created_at DESC);
      PRAGMA user_version=1;`);
    this.db.exec('CREATE TEMP TABLE IF NOT EXISTS scan_seen (id TEXT PRIMARY KEY)');
    this.markSeen = this.db.prepare('INSERT OR IGNORE INTO scan_seen(id) VALUES(?)');
    this.getSig = this.db.prepare('SELECT signature FROM posts WHERE id=?');
    this.upsert = this.db.prepare(`INSERT INTO posts(id,uid,kind,published,author,title,body,payload,signature,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      uid=excluded.uid,kind=excluded.kind,published=excluded.published,
      author=excluded.author,title=excluded.title,body=excluded.body,payload=excluded.payload,
      signature=excluded.signature,updated_at=excluded.updated_at`);
    this.getRowid = this.db.prepare('SELECT rowid FROM posts WHERE id=?');
    this.removeFTS = this.db.prepare('DELETE FROM posts_fts WHERE rowid=?');
    this.addFTS = this.db.prepare('INSERT INTO posts_fts(rowid,content) VALUES(?,?)');
    this.upsertAuthor = this.db.prepare(`INSERT INTO authors(uid,name,avatar,posts_count) VALUES(?,?,?,?)
      ON CONFLICT(uid) DO UPDATE SET name=excluded.name,avatar=excluded.avatar,posts_count=excluded.posts_count`);
  }
  sync(posts, authors) {
    let changed=0, skipped=0;
    const now=new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('DELETE FROM scan_seen');
      for (const item of posts) {
        this.markSeen.run(String(item.id));
        const payload=JSON.stringify(item);
        const signature=crypto.createHash('sha256').update(payload).digest('hex');
        if (this.getSig.get(String(item.id))?.signature===signature) {skipped++;continue;}
        this.upsert.run(String(item.id),String(item.uid||''),item.type||'text',Number(item.published||0),
          item.author||'',item.title||'',item.text||'',payload,signature,now);
        const rowid=this.getRowid.get(String(item.id)).rowid;
        this.removeFTS.run(rowid);
        this.addFTS.run(rowid,`${item.author||''} ${item.title||''} ${item.text||''} ${item.forward?.text||''}`);
        changed++;
      }
      const removed=this.db.prepare('SELECT count(*) AS n FROM posts WHERE id NOT IN (SELECT id FROM scan_seen)').get().n;
      this.db.exec('DELETE FROM posts_fts WHERE rowid IN (SELECT rowid FROM posts WHERE id NOT IN (SELECT id FROM scan_seen))');
      this.db.exec('DELETE FROM posts WHERE id NOT IN (SELECT id FROM scan_seen)');
      for(const a of authors) this.upsertAuthor.run(String(a.uid),a.name||'',a.avatar||'',Number(a.count||0));
      this.db.exec('COMMIT');
      return {changed,unchanged:skipped,removed,total:this.db.prepare('SELECT count(*) AS n FROM posts').get().n};
    } catch(e) {this.db.exec('ROLLBACK');throw e;}
  }
  search({q='',uid='',type='all',sort='newest',page=1,size=12}={}) {
    const filters=[], args=[];
    if(uid){filters.push('p.uid=?');args.push(uid);}
    if(type!=='all'){filters.push('p.kind=?');args.push(type);}
    const query=String(q).trim().slice(0,300);
    const normalized=query.replace(/[^\p{L}\p{N}\s]/gu,' ').trim();
    // FTS5 trigram handles ≥3-codepoint phrases. Short Chinese queries use LIKE.
    if(normalized && Array.from(normalized).length>=3){
      filters.push('p.rowid IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH ?)');
      args.push('"'+normalized.replace(/"/g,'""')+'"');
    } else if(query) {
      filters.push("(p.author LIKE ? OR p.title LIKE ? OR p.body LIKE ?)");
      const pattern='%'+query.replace(/[\\%_]/g,c=>'\\'+c)+'%';
      filters[filters.length-1]="(p.author LIKE ? ESCAPE '\\' OR p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')";
      args.push(pattern,pattern,pattern);
    }
    const where=filters.length?' WHERE '+filters.join(' AND '):'';
    const total=this.db.prepare('SELECT count(*) n FROM posts p'+where).get(...args).n;
    const order=sort==='oldest'?'ASC':'DESC';
    const rows=this.db.prepare(`SELECT p.payload FROM posts p${where} ORDER BY p.published ${order},p.id ${order} LIMIT ? OFFSET ?`)
      .all(...args,Math.max(1,Math.min(40,Number(size)||12)),(Math.max(1,Number(page)||1)-1)*Math.max(1,Math.min(40,Number(size)||12)));
    return {total,page,size,items:rows.map(x=>JSON.parse(x.payload))};
  }
  createTask(kind){
    const id=crypto.randomUUID(),now=new Date().toISOString();
    this.db.prepare('INSERT INTO local_tasks(id,kind,state,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,kind,'queued',now,now);
    return this.getTask(id);
  }
  updateTask(id,props){
    const allowed=['state','done','total','failed','message'];
    const keys=Object.keys(props).filter(x=>allowed.includes(x));if(!keys.length)return this.getTask(id);
    this.db.prepare('UPDATE local_tasks SET '+keys.map(k=>`${k}=?`).join(',')+',updated_at=? WHERE id=?')
      .run(...keys.map(k=>props[k]),new Date().toISOString(),id);
    return this.getTask(id);
  }
  getTask(id){return this.db.prepare('SELECT * FROM local_tasks WHERE id=?').get(id)||null;}
  tasks(){return this.db.prepare('SELECT * FROM local_tasks ORDER BY created_at DESC LIMIT 50').all();}
  recoverTasks(){this.db.prepare("UPDATE local_tasks SET state='interrupted',message='程序重启中断；可点击重新执行' WHERE state IN ('queued','running','stopping')").run();}
  close(){this.db.close();}
}
module.exports={ArchiveDB};
