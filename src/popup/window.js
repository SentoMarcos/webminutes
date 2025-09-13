// window.js - WebMinutes dashboard window
(function(){
  function msToHMS(ms){const s=Math.floor(ms/1000);const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);const sec=s%60;const p=[];if(h>0)p.push(`${h}h`);if(m>0)p.push(`${m}m`);p.push(`${sec}s`);return p.join(' ')}
  function shortLabelFromUrl(url,max=56){try{const u=new URL(url);const host=u.hostname.replace(/^www\./,'');let path=u.pathname.replace(/\/$/,'');if(path.length>28)path=path.slice(0,25)+'…';const label=path&&path!=='/'?`${host}${path}`:host;return label.length>max?label.slice(0,max-1)+'…':label}catch{return url.length>max?url.slice(0,max-1)+'…':url}}
  function hostnameFromUrl(url){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}}
  function iconUrlFor(app,sampleHost){const host=sampleHost||'example.com';return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}

  async function loadData(){
    const key = (new Date()).toISOString().slice(0,10);
    const data = await chrome.storage.local.get([key]);
    const map = data[key]||{};
    // Date + total en la hero provisional
    const totalMs = Object.values(map).reduce((a,b)=>a+b,0);
    const dText = new Date().toLocaleDateString(undefined,{weekday:'long',day:'2-digit',month:'long'});
    const dateEl = document.getElementById('heroDate');
    const totalEl = document.getElementById('heroTotal');
    if(dateEl) dateEl.textContent = dText;
    if(totalEl) totalEl.textContent = msToHMS(totalMs);
  }
  document.addEventListener('DOMContentLoaded', loadData);
})();
