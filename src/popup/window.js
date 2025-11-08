// window.js - WebMinutes dashboard window
(function(){
  // Utils
  function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function msToHMS(ms){const s=Math.floor(ms/1000);const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);const sec=s%60;const p=[];if(h>0)p.push(`${h}h`);if(m>0)p.push(`${m}m`);p.push(`${sec}s`);return p.join(' ')}
  function hostnameFromUrl(url){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}}
  const SOCIAL_APPS={"youtube.com":"YouTube","m.youtube.com":"YouTube","youtu.be":"YouTube","twitter.com":"X","x.com":"X","t.co":"X","instagram.com":"Instagram","facebook.com":"Facebook","m.facebook.com":"Facebook","fb.watch":"Facebook","tiktok.com":"TikTok","vm.tiktok.com":"TikTok","reddit.com":"Reddit","old.reddit.com":"Reddit","linkedin.com":"LinkedIn","web.whatsapp.com":"WhatsApp","wa.me":"WhatsApp","web.telegram.org":"Telegram","t.me":"Telegram"};
  // Host representativo por app canónica (para cargar favicon aunque el label no sea host)
  const APP_ICON_HOST={
    'X':'x.com',
    'YouTube':'youtube.com',
    'Instagram':'instagram.com',
    'Facebook':'facebook.com',
    'TikTok':'tiktok.com',
    'Reddit':'reddit.com',
    'LinkedIn':'linkedin.com',
    'WhatsApp':'web.whatsapp.com',
    'Telegram':'web.telegram.org'
  };
  function appNameFromHost(host){if(!host)return 'Otros';if(SOCIAL_APPS[host])return SOCIAL_APPS[host];for(const k in SOCIAL_APPS){if(host===k||host.endsWith('.'+k))return SOCIAL_APPS[k]}return host}
  // Categorías temáticas
  const THEME_RULES=[
    {name:'Social', apps:['Facebook','Instagram','X','Reddit','LinkedIn']},
    {name:'Video', apps:['YouTube','TikTok']},
    {name:'Mensajería', apps:['WhatsApp','Telegram']},
    {name:'Educación', hosts:['upv.es','coursera.org','udemy.com','edx.org','moodle']},
    {name:'Productividad', hosts:['docs.google.com','drive.google.com','notion.so','notion.site','slack.com','teams.microsoft.com','calendar.google.com']},
    {name:'Noticias', hosts:['elpais.com','bbc.com','nytimes.com','theguardian.com','elmundo.es','lemonde.fr']},
    {name:'Compras', hosts:['amazon.','ebay.','aliexpress.','mercadolibre.']},
    {name:'Desarrollo', hosts:['github.com','gitlab.com','stackoverflow.com']},
    {name:'Gaming', hosts:['twitch.tv','steamcommunity.com','store.steampowered.com']}
  ];
  function classifyTheme(app, host){
    for(const r of THEME_RULES){
      if(r.apps && r.apps.includes(app)) return r.name;
      if(r.hosts && host){
        for(const h of r.hosts){ if(host===h || host.endsWith('.'+h) || host.includes(h)) return r.name; }
      }
    }
    return 'Otros';
  }

  // Estado en ventana
  let themesMap=new Map(); // theme -> { ms, items: [{label, host, ms}] }
  const liveAdjust = {}; // theme -> live ms not yet flushed
  // Live host (para unificar correctamente en Top del día)
  let liveNow = { host: '', ms: 0 };

  function renderThemes(){
    const container=document.getElementById('themesList'); if(!container) return;
  const totalMs=[...themesMap.entries()].reduce((a,[theme,t])=>a + t.ms + (liveAdjust[theme]||0),0);
    container.innerHTML='';
    const sorted=[...themesMap.entries()].sort((a,b)=>b[1].ms-a[1].ms);
    for(const [theme,info] of sorted){
      const dispMs = info.ms + (liveAdjust[theme]||0);
      const pct= totalMs? Math.round(dispMs/totalMs*100) : 0;
      const card=document.createElement('div'); card.className='theme-card';
      const header=document.createElement('div'); header.className='theme-card__header';
      const badge=document.createElement('div'); badge.className='theme-card__badge'; badge.textContent=theme[0]?.toUpperCase()||'?';
      const title=document.createElement('div'); title.className='theme-card__title'; title.textContent=theme;
      header.appendChild(badge); header.appendChild(title);
  const time=document.createElement('div'); time.className='theme-card__time'; time.textContent=msToHMS(dispMs);
      const pctEl=document.createElement('div'); pctEl.className='theme-card__pct'; pctEl.textContent=`${pct}%`;
      const list=document.createElement('ul'); list.className='theme-card__list';
      const topItems=info.items.sort((a,b)=>b.ms-a.ms).slice(0,5);
      for(const it of topItems){ const li=document.createElement('li'); const lspan=document.createElement('span'); lspan.textContent=it.label; const rspan=document.createElement('span'); rspan.textContent=msToHMS(it.ms); li.appendChild(lspan); li.appendChild(rspan); list.appendChild(li);}      
      card.appendChild(header); card.appendChild(time); card.appendChild(pctEl); card.appendChild(list);
      container.appendChild(card);
    }
    // fecha y total en hero
    const dateEl=document.getElementById('heroDate'); if(dateEl) dateEl.textContent=new Date().toLocaleDateString(undefined,{weekday:'long',day:'2-digit',month:'long'});
    const totalEl=document.getElementById('heroTotal'); if(totalEl) totalEl.textContent=msToHMS(totalMs);
    renderDailyStats(totalMs);
  }

  function renderDailyStats(totalMs){
    const list=document.getElementById('topUnifiedList'); const btn=document.getElementById('btnExpandTop'); if(!list||!btn) return;
    // 1) Agregar por host
    const hostAgg=new Map();
    for(const t of themesMap.values()){
      for(const it of t.items){ if(it.host) hostAgg.set(it.host,(hostAgg.get(it.host)||0)+it.ms); }
    }
    // Sumar live actual al host en curso
    if(liveNow.host && liveNow.ms>0) hostAgg.set(liveNow.host,(hostAgg.get(liveNow.host)||0)+liveNow.ms);
    // 2) Reducir a clave canónica: app conocida o host si no hay app (evita duplicados X vs x.com)
    const canonicalAgg=new Map();
    for(const [host,ms] of hostAgg.entries()){
      const app=appNameFromHost(host); // devuelve nombre app conocida o host tal cual
      const key=app; // si es app conocida, agrupa; si no, se queda el host
      canonicalAgg.set(key,(canonicalAgg.get(key)||0)+ms);
    }
    const entries=[...canonicalAgg.entries()].map(([label,ms])=>({label,ms})).sort((a,b)=>b.ms-a.ms);
    // Render top 3 by default
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    const toShow = expanded ? entries.slice(0,12) : entries.slice(0,3);
    list.innerHTML='';
    const total = totalMs || toShow.reduce((a,b)=>a+b.ms,0);
    toShow.forEach((e,idx)=>{
      const pct = total? Math.round(e.ms/total*100):0;
      const li=document.createElement('li');
      li.className='daily-item';
      li.style.setProperty('--w', pct+"%");
      const meter=document.createElement('div'); meter.className='meter'; meter.innerHTML='<span></span>';
      const left=document.createElement('div'); left.className='left';
      const rank=document.createElement('div'); rank.className='rank'; rank.textContent=String(idx+1);
      const avatar=document.createElement('div'); avatar.className='avatar';
      const img=document.createElement('img');
      const letter=(e.label[0]||'?').toUpperCase();
      avatar.setAttribute('data-letter', letter);
      loadFaviconForLabel(e.label).then(url=>{ if(url){ img.src=url; avatar.removeAttribute('data-fallback'); } else { avatar.setAttribute('data-fallback','1'); } }).catch(()=>{ avatar.setAttribute('data-fallback','1'); });
      avatar.appendChild(img);
      const label=document.createElement('span'); label.className='label'; label.textContent=e.label;
      left.appendChild(rank); left.appendChild(avatar); left.appendChild(label);
      const right=document.createElement('div'); right.className='right';
      const time=document.createElement('span'); time.className='time'; time.textContent=`${msToHMS(e.ms)} · ${pct}%`;
      right.appendChild(time);
      li.appendChild(meter); li.appendChild(left); li.appendChild(right);
      list.appendChild(li);
    });
    btn.textContent = expanded ? 'Ver menos' : 'Ver más';
  }

  async function rebuildFromStorage(){
    const key=todayKey(); const data=await chrome.storage.local.get([key]); const map=data[key]||{};
    const raw=Object.entries(map).filter(([u])=>/^(https?:)/i.test(u));
    themesMap=new Map();
    for(const [url,ms] of raw){
      const host=hostnameFromUrl(url); const app=appNameFromHost(host); const theme=classifyTheme(app, host);
      const t=themesMap.get(theme)||{ms:0,items:[]}; t.ms+=ms; t.items.push({label: app!==host? `${app} (${host})` : host, host, ms}); themesMap.set(theme,t);
    }
    renderThemes();
  }

  // Favicon helpers for unified list
  function hostnameFromLabel(label){
    // If label looks like host
    if(/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(label)) return label.toLowerCase();
    // If label is like "App (host)"
    const m = label.match(/\(([^)]+)\)/); if(m) return m[1].replace(/^www\./,'').toLowerCase();
    // If label is a known canonical app name, map to representative host
    if(APP_ICON_HOST[label]) return APP_ICON_HOST[label];
    return '';
  }
  function faviconCandidates(host){
    if(!host) return [];
    const h = host.replace(/^www\./,'');
    const parent = h.split('.').slice(-2).join('.');
    const cand = [
      `https://www.google.com/s2/favicons?sz=64&domain_url=https://${h}`,
      `https://www.google.com/s2/favicons?sz=64&domain=${h}`,
      `https://icons.duckduckgo.com/ip3/${h}.ico`,
      `https://${h}/favicon.ico`,
      `https://${h}/favicon.png`,
      `https://${h}/apple-touch-icon.png`,
    ];
    if(parent && parent!==h){
      cand.push(
        `https://www.google.com/s2/favicons?sz=64&domain=${parent}`,
        `https://icons.duckduckgo.com/ip3/${parent}.ico`,
        `https://${parent}/favicon.ico`
      );
    }
    cand.push(`http://${h}/favicon.ico`);
    // Tiny override example for UPV intranet
    if(h.endsWith('intranet.upv.es')||h.includes('upv.es')){
      cand.unshift('https://www.upv.es/favicon.ico');
    }
    return cand;
  }
  const favCache = new Map();
  async function loadFaviconForLabel(label){
    const host = hostnameFromLabel(label);
    if(!host) return '';
    if(favCache.has(host)) return favCache.get(host);
    const cands = faviconCandidates(host);
    for(const u of cands){
      try{
        const ok = await pingImage(u, 3000);
        if(ok){ favCache.set(host, u); return u; }
      }catch{}
    }
    favCache.set(host, '');
    return '';
  }
  function pingImage(url, timeout){
    return new Promise((resolve)=>{
      const img=new Image(); let done=false;
      const t=setTimeout(()=>{ if(!done){ done=true; resolve(false); img.src='about:blank'; } }, timeout);
      img.onload=()=>{ if(!done){ done=true; clearTimeout(t); resolve(true); } };
      img.onerror=()=>{ if(!done){ done=true; clearTimeout(t); resolve(false); } };
      img.src=url;
    });
  }

  function liveStart(){
    try{const port=chrome.runtime.connect({name:'popup'}); port.onMessage.addListener(msg=>{if(!msg||msg.type!=='wm_live') return; const url=msg.url||''; let host=''; try{host=new URL(url).hostname.replace(/^www\./,'');}catch{} const app=appNameFromHost(host); const theme=classifyTheme(app, host); if(!themesMap.has(theme)) return; const ms=Math.max(0,msg.liveMs||0); liveAdjust[theme]=ms; liveNow.host=host; liveNow.ms=ms; renderThemes(); }); }catch{}
  }

  function wireExpand(){ const btn=document.getElementById('btnExpandTop'); if(!btn) return; btn.addEventListener('click',()=>{ const cur=btn.getAttribute('aria-expanded')==='true'; btn.setAttribute('aria-expanded', String(!cur)); renderThemes(); }); }

  async function init(){ await rebuildFromStorage();
    // Listen to storage flushes to rebuild base numbers
    try{ chrome.storage.onChanged.addListener((changes, area)=>{ if(area!=='local') return; const key=todayKey(); if(changes[key]){ rebuildFromStorage(); } }); }catch{}
    wireExpand();
    liveStart(); }
  document.addEventListener('DOMContentLoaded', init);
})();
