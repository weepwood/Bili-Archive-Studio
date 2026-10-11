'use strict';
const toText = value => typeof value === 'string' ? value : '';
const cleanUrl = value => {
  if (typeof value !== 'string' || !value.trim()) return '';
  const s = value.trim().startsWith('//') ? `https:${value.trim()}` : value.trim();
  try { const u = new URL(s); if(u.protocol === 'http:' && (/\.hdslb\.com$/.test(u.hostname)||/\.biliimg\.com$/.test(u.hostname)))u.protocol='https:'; return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; }
};
const image = pic => cleanUrl(typeof pic === 'string' ? pic : pic?.src || pic?.url || pic?.img_src || pic?.image_url || pic?.cover);
const uniq = values => [...new Set(values.filter(Boolean))];
function opusParagraphs(detail) {
  const root = detail?.data || detail || {};
  const modules=root?.item?.modules || root?.modules || [];
  const mod = (Array.isArray(modules) ? modules.find(m=>m.module_content)?.module_content : modules.module_content) || root?.module_content;
  const paragraphs = mod?.paragraphs || [];
  const contents = [];
  const pics = [];
  for (const p of paragraphs) {
    const nodes = p.text?.nodes || [];
    const line = nodes.map(n => n.word?.words || n.rich?.text || n.rich?.orig_text || n.text || '').join('');
    if (line) contents.push(line);
    for (const i of p.pic?.pics || p.pics?.pics || p.pics?.items || []) pics.push(image(i));
  }
  return { text: contents.join('\n'), images: uniq(pics) };
}
function normalize(item, detail = null) {
  if (!item || !item.id_str) return null;
  const m = item.modules || {};
  const author = m.module_author || {};
  const dyn = m.module_dynamic || {};
  const major = dyn.major || {};
  const kind = major.type || '';
  const opus = major.opus || {};
  const draw = major.draw || {};
  const video = major.archive || major.ugc_season || {};
  const article = major.article || {};
  const live = major.live_rcmd || major.live || {};
  const detailParts = opusParagraphs(detail);
  const videoMeta = major.type === 'MAJOR_TYPE_ARCHIVE' || !!video.bvid;
  const baseText = toText(dyn.desc?.text);
  const opusText = toText(opus.summary?.text);
  const blocks = uniq([baseText, detailParts.text || opusText]);
  const pictures = uniq([...(opus.pics || []).map(image), ...(draw.items || []).map(image), ...detailParts.images]);
  const bvid = video.bvid || '';
  let type = 'text';
  if (item.type === 'DYNAMIC_TYPE_FORWARD') type = 'forward';
  else if (videoMeta) type = 'video';
  else if (pictures.length || kind === 'MAJOR_TYPE_OPUS' || kind === 'MAJOR_TYPE_DRAW') type = 'image';
  else if (kind === 'MAJOR_TYPE_ARTICLE') type = 'article';
  else if (kind.includes('LIVE')) type = 'live';
  const forward = item.orig && item.orig.id_str !== item.id_str ? normalize(item.orig) : null;
  const title = toText(opus.title || video.title || article.title || live.title || '');
  const uid = String(author.mid || '');
  const pub = Number(author.pub_ts || 0);
  const cover = image(video.cover || article.covers?.[0] || opus.cover || live.cover || '');
  const videoUrl = bvid ? `https://www.bilibili.com/video/${encodeURIComponent(bvid)}` : cleanUrl(video.jump_url || '');
  const stats = m.module_stat || {};
  const dynamicId = String(item.id_str);
  return {
    id: dynamicId, uid, author: author.name || '', avatar: image(author.face),
    published: pub ? pub * 1000 : 0, publishedLabel: author.pub_time || '',
    type, rawType: item.type || '', title, text: blocks.join('\n\n'), images: pictures,
    cover, duration: toText(video.duration_text || ''), videoUrl,
    articleUrl: cleanUrl(article.jump_url || article.url || ''),
    sourceUrl: `https://t.bilibili.com/${encodeURIComponent(dynamicId)}`,
    forward, liked: Number(stats.like?.count || 0), comments: Number(stats.comment?.count || 0), shares: Number(stats.forward?.count || 0),
    detailReady: !!detail, hasOpus: kind === 'MAJOR_TYPE_OPUS',
    mediaUrls: uniq([image(author.face), ...pictures, cover, ...(forward ? [forward.avatar, ...forward.images, forward.cover] : [])])
  };
}
module.exports = { normalize, image, cleanUrl, opusParagraphs };
