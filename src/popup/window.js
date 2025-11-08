// window.js - WebMinutes dashboard window
(function(){
  // Utils
  function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function msToHMS(ms){const s=Math.floor(ms/1000);const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);const sec=s%60;const p=[];if(h>0)p.push(`${h}h`);if(m>0)p.push(`${m}m`);p.push(`${sec}s`);return p.join(' ')}
  function hostnameFromUrl(url){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}}
  const SOCIAL_APPS={"youtube.com":"YouTube","m.youtube.com":"YouTube","youtu.be":"YouTube","twitter.com":"X","x.com":"X","t.co":"X","instagram.com":"Instagram","facebook.com":"Facebook","m.facebook.com":"Facebook","fb.watch":"Facebook","tiktok.com":"TikTok","vm.tiktok.com":"TikTok","reddit.com":"Reddit","old.reddit.com":"Reddit","linkedin.com":"LinkedIn","web.whatsapp.com":"WhatsApp","wa.me":"WhatsApp","web.telegram.org":"Telegram","t.me":"Telegram"};
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

  function liveStart(){
    try{const port=chrome.runtime.connect({name:'popup'}); port.onMessage.addListener(msg=>{if(!msg||msg.type!=='wm_live') return; const url=msg.url||''; let host=''; try{host=new URL(url).hostname.replace(/^www\./,'');}catch{} const app=appNameFromHost(host); const theme=classifyTheme(app, host); if(!themesMap.has(theme)) return; const ms=Math.max(0,msg.liveMs||0); liveAdjust[theme]=ms; renderThemes(); }); }catch{}
  }

  async function init(){ await rebuildFromStorage();
    // Listen to storage flushes to rebuild base numbers
    try{ chrome.storage.onChanged.addListener((changes, area)=>{ if(area!=='local') return; const key=todayKey(); if(changes[key]){ rebuildFromStorage(); } }); }catch{}
    liveStart(); }
  document.addEventListener('DOMContentLoaded', init);
})();
