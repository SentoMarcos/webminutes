// Replace whole file with a clean implementation
(function(){
  // Chart.js only (user request)
  const USE_CHARTJS = true;
  // ---------- Utilidades ----------
  function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function msToHMS(ms){const s=Math.floor(ms/1000);const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);const sec=s%60;const p=[];if(h>0)p.push(`${h}h`);if(m>0)p.push(`${m}m`);p.push(`${sec}s`);return p.join(' ')}
  function shortLabelFromUrl(url,max=56){try{const u=new URL(url);const host=u.hostname.replace(/^www\./,'');let path=u.pathname.replace(/\/$/,'');if(path.length>28)path=path.slice(0,25)+'…';const label=path&&path!=='/'?`${host}${path}`:host;return label.length>max?label.slice(0,max-1)+'…':label}catch{return url.length>max?url.slice(0,max-1)+'…':url}}
  function hostnameFromUrl(url){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}}
  const SOCIAL_APPS={
    "youtube.com":"YouTube","m.youtube.com":"YouTube","youtu.be":"YouTube",
    "twitter.com":"X","x.com":"X","t.co":"X",
    "instagram.com":"Instagram",
    "facebook.com":"Facebook","m.facebook.com":"Facebook","fb.watch":"Facebook",
    "tiktok.com":"TikTok","vm.tiktok.com":"TikTok",
    "reddit.com":"Reddit","old.reddit.com":"Reddit",
    "linkedin.com":"LinkedIn",
    "web.whatsapp.com":"WhatsApp","wa.me":"WhatsApp",
    "web.telegram.org":"Telegram","t.me":"Telegram"
  };
  function appNameFromHost(host){if(!host)return 'Otros';if(SOCIAL_APPS[host])return SOCIAL_APPS[host];for(const key of Object.keys(SOCIAL_APPS)){if(host===key||host.endsWith('.'+key))return SOCIAL_APPS[key]}return host}
  function iconUrlFor(app,sampleHost){const APP_HOST={"YouTube":"youtube.com","X":"x.com","Instagram":"instagram.com","Facebook":"facebook.com","TikTok":"tiktok.com","Reddit":"reddit.com","LinkedIn":"linkedin.com","WhatsApp":"web.whatsapp.com","Telegram":"web.telegram.org"};const host=APP_HOST[app]||sampleHost||'example.com';return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}

  function makeCsvRow(cols){return cols.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')}
  async function exportCsv(){const all=await chrome.storage.local.get(null);let csv='date,url,seconds\n';Object.keys(all).sort().forEach(date=>{const dayMap=all[date];if(!dayMap||typeof dayMap!=='object')return;Object.entries(dayMap).forEach(([url,ms])=>{csv+=makeCsvRow([date,url,Math.floor(ms/1000)])+'\n'})});const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`webminutes_${Date.now()}.csv`;document.body.appendChild(a);a.click();URL.revokeObjectURL(url);a.remove()}
  async function resetToday(){await chrome.storage.local.set({[todayKey()]:{}});await loadToday()}

  async function loadToday(){
    const key=todayKey();
    const data=await chrome.storage.local.get([key]);
    const map=data[key]||{};

    // Agregar por APP/SITIO en lugar de por URL, para que YouTube se agrupe correctamente
    const rawEntries = Object.entries(map).filter(([u])=>/^(https?:)/i.test(u));
    const byApp = new Map(); // appName -> { ms, host }
    for(const [url, ms] of rawEntries){
      const host = hostnameFromUrl(url);
      const app = appNameFromHost(host);
      const cur = byApp.get(app) || { ms: 0, host: host };
      cur.ms += ms;
      // Mantén un host de muestra utilizable (prioriza hosts que no sean subdominios raros)
      if(!cur.host || /^(www\.)?youtube\.com$/.test(host)) cur.host = host;
      byApp.set(app, cur);
    }
    const entries = Array.from(byApp.entries()) // [app, {ms, host}]
      .sort((a,b)=>b[1].ms - a[1].ms)
      .map(([app, obj])=>({ label: app, ms: obj.ms, app, host: obj.host }));
    const legend=document.getElementById('pieLegend');
    const tooltip=document.getElementById('pieTooltip');
    legend.innerHTML='';
  // Paleta alineada con la ventana (verdes/lima + acentos complementarios sutiles)
  const colors=['#a3e635','#84cc16','#22c55e','#38bdf8','#f59e0b','#f97316','#eab308'];
    const topN=6;
  const parts=entries.slice(0,topN);
  const rest=entries.slice(topN);
  const total=entries.reduce((a, it)=>a+it.ms,0)||1;
  const other=rest.reduce((a, it)=>a+it.ms,0);
  if(other>0) parts.push({ label:'Otros', ms: other, app:'Otros', host:'' });

  const useChart = USE_CHARTJS && typeof window.Chart !== 'undefined' && document.getElementById('pie') instanceof HTMLCanvasElement;
  if(useChart){
      // Build Chart.js doughnut
      const canvas = document.getElementById('pie');
      // Destroy previous chart if any (when reloading)
      if(canvas.__wmChart){ canvas.__wmChart.destroy(); }
    // Ensure components are registered (Chart.js v3+/v4+ requirement)
    try { if (Chart.registerables) { Chart.register(...Chart.registerables); } } catch {}
  const labels = parts.map((it)=> it.label);
  const dataVals = parts.map((it)=> Math.max(0, Math.round(it.ms/1000))); // seconds for stable animation
      const bg = parts.map((_,i)=> colors[i%colors.length]);

      // Subtle base ring underlay plugin
      const baseRingPlugin = {
        id: 'wmBaseRing',
        beforeDatasetsDraw(chart, args, opts){
          const meta = chart.getDatasetMeta(0);
          if(!meta || !meta.data || !meta.data[0]) return;
          const arc = meta.data[0];
          const {x, y, outerRadius, innerRadius} = arc;
          const ctx = chart.ctx;
          ctx.save();
          // Draw a soft base ring that peaks through spacing
          ctx.beginPath();
          ctx.lineWidth = Math.max(6, (outerRadius-innerRadius) * 0.5);
          ctx.strokeStyle = 'rgba(163,230,53,0.18)';
          ctx.arc(x, y, (outerRadius+innerRadius)/2, 0, Math.PI*2);
          ctx.stroke();
          ctx.restore();
        }
      };

  // state for hover focus
  let lastCenterText = null; // cache of default total text
  let hoverIndex = -1; // índice actualmente en hover

      const chart = new Chart(canvas, {
        type: 'doughnut',
        data: { labels, datasets: [{
          data: dataVals,
          backgroundColor: bg,
          borderWidth: 0,
          spacing: 2,
          hoverOffset: 6,
          borderRadius: 6
        }]},
        options: {
          maintainAspectRatio: false,
          responsive: true,
          cutout: '60%',
          animation: { animateRotate: true, animateScale: false, duration: 650, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          }
        },
        plugins: [baseRingPlugin, {
          id: 'wmLayout',
          afterDatasetsDraw(c){
            // solo recalcula centro; los iconos se crean al inicio y en resize
            try { updateCenterOverlay(); } catch {}
          }
        }]
      });
  canvas.__wmChart = chart;

      // Helpers: center overlay + icons positioning from actual geometry
      const updateCenterOverlay = () => {
  const meta = chart.getDatasetMeta(0);
        const arc0 = meta && meta.data && meta.data[0];
        const centerWrap = document.querySelector('.chart-center');
        if(!arc0 || !centerWrap) return;
  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = centerWrap.parentElement.getBoundingClientRect();
  const offX = canvasRect.left - wrapRect.left;
  const offY = canvasRect.top - wrapRect.top;
  // Chart.js guarda x/y/radios en unidades CSS (retina se gestiona en el contexto), no aplicar escalas
  const diameterCss = Math.max(80, (arc0.innerRadius * 2)) - 8; // margen para que quede dentro
        centerWrap.style.width = `${diameterCss}px`;
        centerWrap.style.height = `${diameterCss}px`;
  // posicionar exactamente al centro del círculo con offset del canvas dentro del contenedor
  centerWrap.style.left = `${offX + arc0.x}px`;
  centerWrap.style.top = `${offY + arc0.y}px`;
        const valEl = centerWrap.querySelector('.center-value');
        if(valEl){
          valEl.style.fontSize = Math.max(18, Math.min(26, diameterCss * 0.16)) + 'px';
          // remember default total (first time only)
          if(lastCenterText === null) lastCenterText = valEl.textContent;
        }
      };

      const updateIcons = () => {
  const meta = chart.getDatasetMeta(0);
        const arcs = meta && meta.data ? meta.data : [];
        const iconsLayer = document.getElementById('chartIcons');
        if(!iconsLayer) return;
        iconsLayer.innerHTML = '';
  const canvasRect = canvas.getBoundingClientRect();
  const layerRect = iconsLayer.getBoundingClientRect();
  const offX = canvasRect.left - layerRect.left;
  const offY = canvasRect.top - layerRect.top;
        // posición dentro de la banda del donut, con límites para no invadir el centro
        arcs.forEach((arc, i)=>{
          const a0 = arc.startAngle;
          const a1 = arc.endAngle;
          const angle = (a0 + a1) / 2;
          const thickness = Math.max(arc.outerRadius - arc.innerRadius, 1);
          const safeInset = Math.min(10, thickness * 0.25); // deja margen desde ambos bordes
          const rMid = arc.innerRadius + safeInset + (thickness - 2*safeInset) * 0.7; // más hacia fuera para no pisar el centro
          const cx = Math.cos(angle), sy = Math.sin(angle);
          let x = arc.x + cx * rMid;
          let y = arc.y + sy * rMid;
          const item = parts[i];
          const fav = item && item.app !== 'Otros' ? iconUrlFor(item.app, item.host) : '';
          const img = document.createElement('img');
          img.className = 'chart-icons__img';
          img.alt = item ? item.label : '';
          if(!fav) return; // no icon for 'Otros'
          img.src = fav;
          // borde del color del segmento
          img.style.borderColor = colors[i%colors.length];
          img.referrerPolicy = 'no-referrer';
          // tamaño en función del grosor del anillo (clamp 20..28)
          const size = Math.max(20, Math.min(28, thickness * 0.45));
          img.style.width = `${size}px`;
          img.style.height = `${size}px`;
          img.style.left = `${offX + x}px`;
          img.style.top = `${offY + y}px`;
          // sin listeners: hover solo en el canvas (iconos tienen pointer-events:none)
          iconsLayer.appendChild(img);
        });
      };
  // set center to total and cache default before first layout
  {
    const centerValEl = document.getElementById('centerTotal');
    const totalStr = msToHMS(Object.values(map).reduce((a,b)=>a+b,0));
    if(centerValEl){ centerValEl.textContent = totalStr; }
    lastCenterText = totalStr;
  }
  // keep synced on resize
  updateCenterOverlay();
  updateIcons();
  chart.resize();
      window.addEventListener('resize', ()=>{ updateCenterOverlay(); updateIcons(); }, { passive: true });

      // Helpers to control center content
      const showSliceInCenter = (index) => {
        const centerWrap = document.querySelector('.chart-center');
        const valEl = centerWrap?.querySelector('.center-value');
        const titleEl = centerWrap?.querySelector('.center-title');
        if(!valEl || !titleEl) return;
        const item = parts[index];
        if(!item) return;
        titleEl.textContent = item.label;
        valEl.textContent = msToHMS(item.ms);
      };
      const revertCenter = () => {
        const centerWrap = document.querySelector('.chart-center');
        const valEl = centerWrap?.querySelector('.center-value');
        const titleEl = centerWrap?.querySelector('.center-title');
        if(titleEl) titleEl.textContent = 'Total';
        if(valEl && lastCenterText !== null) valEl.textContent = lastCenterText;
      };

      // Custom tooltip + hover-to-focus on canvas
      canvas.addEventListener('mousemove', (ev)=>{
        const p = chart.getElementsAtEventForMode(ev, 'nearest', { intersect: true }, false)[0];
        if(!p){
          tooltip.hidden = true;
          if(hoverIndex !== -1){
            hoverIndex = -1;
            revertCenter();
            try{ chart.setActiveElements([]); chart.update('none'); }catch{}
          }
          return;
        }
        const idx = p.index;
        if(idx !== hoverIndex){
          hoverIndex = idx;
          const it = parts[idx];
          const pct = Math.round(it.ms/total*100);
          tooltip.textContent = `${it.label} • ${msToHMS(it.ms)} (${pct}%)`;
          try{
            showSliceInCenter(idx);
            chart.setActiveElements([{datasetIndex:0, index: idx}]);
            chart.update('none');
          }catch{}
        }
        // actualizar posición del tooltip en cada movimiento
        tooltip.style.left = (ev.clientX + 12) + 'px';
        tooltip.style.top = (ev.clientY + 12) + 'px';
        tooltip.hidden = false;
      });
      canvas.addEventListener('mouseleave', ()=>{
        tooltip.hidden = true;
        hoverIndex = -1;
        revertCenter();
        try{ chart.setActiveElements([]); chart.update('none'); }catch{}
      });

      // No click-to-focus; behavior is hover-based

      // Legend a la derecha se oculta; si se quisiera mostrar, aquí se podría reconstruir
    } else {
      // If Chart.js is not available, we won't render; you chose Chart.js only.
      console.warn('Chart.js no disponible: no se renderiza la gráfica');
    }


  // Center overlay is sized from chart innerRadius; value set earlier

    const d=new Date();document.getElementById('date').textContent=d.toLocaleDateString(undefined,{weekday:'long',day:'2-digit',month:'long'});
  }

  // Listeners
  document.getElementById('btnWindow').addEventListener('click',async()=>{try{await chrome.windows.create({url:chrome.runtime.getURL('src/popup/window.html'),type:'popup',width:820,height:660});window.close()}catch(e){console.error('No se pudo abrir la ventana flotante',e)}});

  loadToday();

  // Live refresh: listen to storage changes for today's key and refresh lightweight
  try{
    chrome.storage.onChanged.addListener((changes, area)=>{
      if(area !== 'local') return;
      const key = todayKey();
      if(changes[key]){
        // debounce to avoid flooding
        clearTimeout(window.__wmRefreshTimer);
        window.__wmRefreshTimer = setTimeout(()=>{
          loadToday();
        }, 200);
      }
    });
  }catch{}
})();
