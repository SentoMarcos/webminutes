// Replace whole file with a clean implementation
(function(){
  // Chart.js only (user request)
  const USE_CHARTJS = true;
  // Runtime cache to support live updates
  let chartRef = null;        // Chart instance
  let partsRef = [];          // [{label, ms, app, host}]
  let colorsRef = [];         // segment colors
  let totalRef = 0;           // cached total ms
  let liveBoost = { url: '', ms: 0 }; // unflushed live ms for active URL
  // Center text cache shared across renders and hover
  let lastCenterText = null;
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
  // Favicon helpers: prefer the actual host's icon with a resilient fallback chain
  function faviconCandidatesFor(app, host){
    const APP_HOST={"YouTube":"youtube.com","X":"x.com","Instagram":"instagram.com","Facebook":"facebook.com","TikTok":"tiktok.com","Reddit":"reddit.com","LinkedIn":"linkedin.com","WhatsApp":"web.whatsapp.com","Telegram":"web.telegram.org"};
    const h = host && host.trim() ? host.trim() : (APP_HOST[app]||'');
    if(!h) return [];
    const enc = encodeURIComponent;
    // Known overrides for tricky hosts (auth walls, intranets, etc.)
    const OVERRIDES = {
      'intranet.upv.es': 'https://www.upv.es/favicon.ico',
      'upv.es': 'https://www.upv.es/favicon.ico'
    };
    if(OVERRIDES[h]) return [OVERRIDES[h]];
    // derive parent domain (strip first label) for intranet subdomains like intranet.upv.es
    let parent = '';
    const parts = h.split('.');
    if(parts.length > 2) parent = parts.slice(1).join('.');
    const parentCands = parent ? [
      `https://www.google.com/s2/favicons?sz=64&domain_url=https://${enc(parent)}/`,
      `https://www.google.com/s2/favicons?sz=64&domain=${enc(parent)}`,
      `https://${parent}/favicon.ico`
    ] : [];
    // Use domain_url to better support subdomains, then common icon file names
    const cands = [
      `https://www.google.com/s2/favicons?sz=64&domain_url=https://${enc(h)}/`,
      `https://www.google.com/s2/favicons?sz=64&domain=${enc(h)}`,
      `https://icons.duckduckgo.com/ip3/${h}.ico`,
      `https://${h}/favicon.ico`,
      `https://${h}/favicon.png`,
      `https://${h}/apple-touch-icon.png`,
      `https://${h}/apple-touch-icon-precomposed.png`,
      ...parentCands
    ];
    // As a last resort, try http (some intranets may not serve https icon)
    cands.push(`http://${h}/favicon.ico`);
    return cands;
  }

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
            // Recalcula centro e iconos en cada frame de dibujo para seguir el arco actualizado
            try { updateCenterOverlay(); updateIcons(); } catch {}
          }
        }]
      });
  canvas.__wmChart = chart;
  chartRef = chart;

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
          // Generar candidatos de favicon para el host representativo de este segmento
          const candidates = (item && item.app !== 'Otros') ? faviconCandidatesFor(item.app, item.host) : [];
          const img = document.createElement('img');
          img.className = 'chart-icons__img';
          img.alt = item ? item.label : '';
          if(!candidates.length) return; // no icon for 'Otros' o sin host
          img.src = candidates[0];
          // Fallback entre candidatos si falla la carga
          img.onerror = function(){
            try{
              const cur = Number(img.dataset.favIndex||'0');
              const next = cur + 1;
              if(next < candidates.length){
                img.dataset.favIndex = String(next);
                img.src = candidates[next];
              }else{
                // último recurso: generar una inicial dentro de un círculo
                const label = (item?.label||'').trim();
                const letter = label ? label[0].toUpperCase() : '?';
                const size = parseInt(img.style.width)||24;
                const canvas = document.createElement('canvas');
                canvas.width = size; canvas.height = size;
                const ctx = canvas.getContext('2d');
                if(ctx){
                  ctx.fillStyle = colors[i%colors.length];
                  ctx.beginPath(); ctx.arc(size/2, size/2, size/2, 0, Math.PI*2); ctx.fill();
                  ctx.font = `bold ${Math.round(size*0.55)}px Segoe UI, Arial`; ctx.textAlign='center'; ctx.textBaseline='middle';
                  ctx.fillStyle = '#fff'; ctx.fillText(letter, size/2, size/2+1);
                  try{ img.src = canvas.toDataURL('image/png'); img.onerror = null; }catch{ img.style.display='none'; }
                }else{
                  img.style.display = 'none';
                }
              }
            }catch{}
          };
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

      // Store refs for live updates
      partsRef = parts;
      colorsRef = bg;
      totalRef = parts.reduce((a,it)=>a+it.ms,0);
      // Legend a la derecha se oculta; si se quisiera mostrar, aquí se podría reconstruir
    } else {
      // If Chart.js is not available, we won't render; you chose Chart.js only.
      console.warn('Chart.js no disponible: no se renderiza la gráfica');
    }


  // Center overlay is sized from chart innerRadius; value set earlier

    const d=new Date();document.getElementById('date').textContent=d.toLocaleDateString(undefined,{weekday:'long',day:'2-digit',month:'long'});

    // Exponer estado para captura
    try{ window.__wmLastState = { parts, total, colors, canvas: document.getElementById('pie'), chart: document.getElementById('pie')?.__wmChart }; }catch{}
  }

  // Listeners
  document.getElementById('btnWindow').addEventListener('click',async()=>{try{await chrome.windows.create({url:chrome.runtime.getURL('src/popup/window.html'),type:'popup',width:820,height:660});window.close()}catch(e){console.error('No se pudo abrir la ventana flotante',e)}});

  // Captura del gráfico como PNG
  function captureChart(){
    try{
      const state = window.__wmLastState || {};
      const canvas = state.canvas || document.getElementById('pie');
      if(!(canvas instanceof HTMLCanvasElement)) return;
      const chart = state.chart || canvas.__wmChart;
      // Limpiar hover para captura limpia
      try{ chart?.setActiveElements([]); chart?.update('none'); }catch{}

  const pad = 50; // margen alrededor del donut
  const LEG_GUTTER = 24; // separación entre donut y leyenda
  const LEG_W = 240; // ancho de la leyenda a la derecha
  const baseW = (canvas.width||0);
  const baseH = (canvas.height||0);
  const W = baseW + pad*2 + LEG_GUTTER + LEG_W; // expandimos el lienzo a la derecha
  const H = baseH + pad*2;

      // Lienzo compuesto
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const ctx = out.getContext('2d');
      if(!ctx) return;
  // Fondo tipo "Wrapped": base oscuro + acentos de color suaves
  ctx.fillStyle = '#181c23';
  ctx.fillRect(0,0,W,H);
  const grad1 = ctx.createRadialGradient(W*0.15, H*0.2, 10, W*0.15, H*0.2, Math.max(W,H)*0.6);
  grad1.addColorStop(0, 'rgba(167,139,250,0.25)'); // violeta
  grad1.addColorStop(1, 'rgba(167,139,250,0)');
  ctx.fillStyle = grad1; ctx.beginPath(); ctx.rect(0,0,W,H); ctx.fill();
  const grad2 = ctx.createRadialGradient(W*0.65, H*0.15, 10, W*0.65, H*0.15, Math.max(W,H)*0.5);
  grad2.addColorStop(0, 'rgba(244,114,182,0.25)'); // rosa
  grad2.addColorStop(1, 'rgba(244,114,182,0)');
  ctx.fillStyle = grad2; ctx.beginPath(); ctx.rect(0,0,W,H); ctx.fill();
  const grad3 = ctx.createRadialGradient(W*0.85, H*0.85, 10, W*0.85, H*0.85, Math.max(W,H)*0.5);
  grad3.addColorStop(0, 'rgba(245,158,11,0.22)'); // naranja
  grad3.addColorStop(1, 'rgba(245,158,11,0)');
  ctx.fillStyle = grad3; ctx.beginPath(); ctx.rect(0,0,W,H); ctx.fill();
  // Donut base (a la izquierda)
  ctx.drawImage(canvas, pad, pad);

      // Geometría de la gráfica
      const meta = chart?.getDatasetMeta?.(0);
      const arcs = meta?.data || [];
      const items = state.parts || [];
      const cols = state.colors || [];

      // Centro: Total (alineado visualmente al centro con dos líneas)
      const arc0 = arcs[0];
      if(arc0){
        const cx = pad + arc0.x, cy = pad + arc0.y;
        const inner = arc0.innerRadius;
        // halo sutil
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, inner - 6, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(24,28,35,0.72)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(148,163,184,0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // textos centrados (dos líneas)
        const totalMs = (items?.reduce((a,it)=>a+it.ms,0)) || 0;
        const valueSize = Math.max(20, Math.min(36, inner*0.30));
        const labelSize = Math.max(11, Math.min(14, inner*0.14));
        const gap = Math.max(4, inner*0.06);
        // Línea superior: label
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `500 ${labelSize}px Segoe UI, Roboto, Arial`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Total', cx, cy - (valueSize/2 + gap/2));
        // Línea inferior: valor
        ctx.font = `bold ${valueSize}px Segoe UI, Roboto, Arial`;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(msToHMS(totalMs), cx, cy + (labelSize/2 + gap/2));
      }

  // Etiquetas por segmento alrededor del donut (se mantienen)
      ctx.font = '12px Segoe UI, Roboto, Arial';
      ctx.fillStyle = '#cbd5e1';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      arcs.forEach((arc, i)=>{
        const it = items[i];
        if(!arc || !it) return;
        const a0 = arc.startAngle, a1 = arc.endAngle;
        const angle = (a0+a1)/2;
        const thickness = Math.max(arc.outerRadius - arc.innerRadius, 1);
        const safeInset = Math.min(10, thickness * 0.25);
        // Llevar el icono más hacia el borde externo del anillo
        const rMid = arc.innerRadius + safeInset + (thickness - 2*safeInset) * 0.88;
        const cx = pad + arc.x + Math.cos(angle)*rMid;
        const cy = pad + arc.y + Math.sin(angle)*rMid;

        // punto "icono" del color del segmento (similar al popup: fondo blanco, borde de color, sombra)
        const color = cols[i % cols.length] || '#22c55e';
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 6; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 2;
        ctx.beginPath();
        const r = Math.max(7, Math.min(11, thickness*0.22));
        ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.fillStyle = '#ffffff'; // fondo blanco
        ctx.fill();
        ctx.lineWidth = 3; // borde de color
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.restore();

        // etiqueta con nombre y tiempo
        const labelR = arc.outerRadius + 18;
        const tx = pad + arc.x + Math.cos(angle) * labelR;
        const ty = pad + arc.y + Math.sin(angle) * labelR;
        ctx.textAlign = Math.cos(angle) >= 0 ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        const text = `${it.label} • ${msToHMS(it.ms)}`;
        // Sombra para legibilidad
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 4; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(text, tx, ty);
        ctx.restore();
      });

      // Leyenda a la derecha: punto de color + label + tiempo
      const lx = pad + baseW + LEG_GUTTER;
      const ly = pad;
      const lineH = 22;
      const maxRows = Math.min(items.length, Math.floor((H - ly - 12) / lineH));
  // Panel de fondo sutil para la leyenda (estilo tarjeta)
      ctx.save();
      ctx.fillStyle = '#23272f';
      ctx.strokeStyle = 'rgba(42,49,57,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(lx - 12, ly - 12, LEG_W + 24, Math.max(44, maxRows*lineH + 24), 12)
                    : ctx.rect(lx - 12, ly - 12, LEG_W + 24, Math.max(44, maxRows*lineH + 24));
      ctx.fill();
      ctx.stroke();
      ctx.restore();

  // Título estilo Wrapped con gradiente
  const titleGrad = ctx.createLinearGradient(lx, ly-10, lx+LEG_W, ly+10);
  titleGrad.addColorStop(0, '#a78bfa');
  titleGrad.addColorStop(0.6, '#f472b6');
  titleGrad.addColorStop(1, '#f59e0b');
  ctx.fillStyle = titleGrad;
  ctx.font = 'bold 16px Segoe UI, Roboto, Arial';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('Tu Wrapped', lx, ly - 8);

      const labelFont = '700 13px Segoe UI, Roboto, Arial';
      const timeFont = '600 12px Segoe UI, Roboto, Arial';
      function ellipsize(text, maxPx, font){
        ctx.save(); ctx.font = font;
        if(ctx.measureText(text).width <= maxPx){ ctx.restore(); return text; }
        let t = text;
        while(t.length && ctx.measureText(t + '…').width > maxPx){ t = t.slice(0, -1); }
        ctx.restore();
        return t + '…';
      }
      for(let i=0;i<maxRows;i++){
        const it = items[i];
        const cy = ly + 10 + i*lineH;
        const color = cols[i % cols.length] || '#22c55e';
        // punto color
        ctx.save();
        ctx.beginPath(); ctx.arc(lx + 8, cy + 1, 5, 0, Math.PI*2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        // rank number con color destacado
        ctx.font = '700 12px Segoe UI, Roboto, Arial';
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(`#${i+1}`, lx + 8 + 12 + 4, cy + 5);

        // tiempo + porcentaje (derecha)
        const totalMs = (items?.reduce((a,x)=>a+x.ms,0)) || 0;
        const pct = totalMs ? Math.round(it.ms/totalMs*100) : 0;
        const timeStr = `${msToHMS(it.ms)} (${pct}%)`;
        ctx.font = timeFont; ctx.fillStyle = '#cbd5e1';
        const timeW = ctx.measureText(timeStr).width;
        const timeX = lx + LEG_W - 8; // borde derecho
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(timeStr, timeX, cy + 5);
        // label (izquierda, truncada) después de #rank
        ctx.font = labelFont; ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'left';
        const labelLeft = lx + 8 + 12 + 4 + ctx.measureText(`#${i+1}`).width + 8;
        const labelMaxW = Math.max(30, LEG_W - (labelLeft - lx) - 8 - timeW);
        const label = ellipsize(it.label, labelMaxW, labelFont);
        ctx.fillText(label, labelLeft, cy + 5);
      }

      // Fecha en esquina
      try{
        const dateEl = document.getElementById('date');
        if(dateEl){
          ctx.font = '12px Segoe UI, Roboto, Arial';
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(dateEl.textContent||'', 12, 10);
        }
      }catch{}

      const url = out.toDataURL('image/png');
      const a = document.createElement('a');
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
      a.href = url;
      a.download = `webminutes_donut_${stamp}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }catch(e){ console.error('No se pudo capturar el gráfico', e); }
  }
  const btnCap = document.getElementById('btnCapture');
  if(btnCap) btnCap.addEventListener('click', captureChart);

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

  // Live: open a port and apply 1s increments to the active slice
  try{
    const port = chrome.runtime.connect({ name: 'popup' });
    port.onMessage.addListener((msg)=>{
      if(!msg || msg.type !== 'wm_live') return;
      const activeUrl = msg.url || '';
      const ms = Math.max(0, msg.liveMs || 0);
      if(ms > 0){
        try{ console.debug('[WebMinutes popup] live tick', { url: activeUrl, ms }); }catch{}
      }
      liveBoost = { url: activeUrl, ms };
      // Apply a lightweight redraw without rebuilding the chart
      if(!chartRef || !partsRef?.length) return;
      // Find which part corresponds to activeUrl
      let host = '';
      try{ host = new URL(activeUrl).hostname.replace(/^www\./,''); }catch{}
      const app = appNameFromHost(host);
      let idx = partsRef.findIndex(it=> it.app === app);
      if(idx < 0){
        // si el activo no está en el TopN, volcamos el live a 'Otros' si existe
        idx = partsRef.findIndex(it=> it.label === 'Otros');
      }
      if(idx >= 0){
        // Compose dataset values with live ms en el índice elegido
        const vals = partsRef.map((it,j)=> Math.max(0, Math.round((it.ms + (j===idx?ms:0))/1000)) );
        const ds = chartRef.data.datasets[0];
  ds.data = vals;
  chartRef.update('none');
  try{ updateIcons(); }catch{}
        // update center total visually
        const centerValEl = document.getElementById('centerTotal');
        const totalMs = partsRef.reduce((a,it)=>a+it.ms,0) + ms;
        if(centerValEl){
          const txt = msToHMS(totalMs);
          centerValEl.textContent = txt;
          // keep cache in sync so hover-out shows updated total
          lastCenterText = txt;
        }
      }
    });
  }catch{}
})();
