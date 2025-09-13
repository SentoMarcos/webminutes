(() => {
  const ROOT_ID = 'wm-overlay-root';

  if (document.getElementById(ROOT_ID)) return; // ya existe

  const stateKey = 'wm_overlay_v1';

  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(stateKey) || 'null'); } catch { return null; }
  })();

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.style.position = 'fixed';
  root.style.top = (saved?.top ?? 24) + 'px';
  root.style.left = (saved?.left ?? 24) + 'px';
  root.style.width = (saved?.width ?? 380) + 'px';
  root.style.height = (saved?.height ?? 520) + 'px';
  root.style.zIndex = '2147483646';
  root.style.background = 'transparent';

  const bar = document.createElement('div');
  bar.className = 'wm-titlebar';
  bar.innerHTML = `<span>WebMinutes</span><span class="wm-actions"><button title="Cerrar">×</button></span>`;

  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('popup.html');
  frame.setAttribute('allow', 'clipboard-write;');

  const resizer = document.createElement('div');
  resizer.className = 'wm-resizer';

  root.appendChild(bar);
  root.appendChild(frame);
  root.appendChild(resizer);
  document.documentElement.appendChild(root);

  // Drag
  let dragging = false; let startX=0, startY=0, startLeft=0, startTop=0;
  bar.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    startLeft = parseInt(root.style.left, 10);
    startTop = parseInt(root.style.top, 10);
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX; const dy = e.clientY - startY;
    root.style.left = startLeft + dx + 'px';
    root.style.top = startTop + dy + 'px';
  });
  window.addEventListener('mouseup', () => { dragging = false; persist(); });

  // Resize corner
  let resizing = false; let sX=0, sY=0, sW=0, sH=0;
  resizer.addEventListener('mousedown', (e) => {
    resizing = true;
    sX = e.clientX; sY = e.clientY;
    sW = parseInt(root.style.width, 10);
    sH = parseInt(root.style.height, 10);
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const dx = e.clientX - sX; const dy = e.clientY - sY;
    const minW = 260, minH = 220;
    root.style.width = Math.max(minW, sW + dx) + 'px';
    root.style.height = Math.max(minH, sH + dy) + 'px';
  });
  window.addEventListener('mouseup', () => { if (resizing) { resizing=false; persist(); }});

  // Close
  bar.querySelector('button')?.addEventListener('click', () => {
    root.remove();
    persist();
  });

  // Persist in localStorage of the page (simple y rápido). Si prefieres chrome.storage, lo cambiamos.
  function persist() {
    const data = {
      top: parseInt(root.style.top, 10),
      left: parseInt(root.style.left, 10),
      width: parseInt(root.style.width, 10),
      height: parseInt(root.style.height, 10)
    };
    try { localStorage.setItem(stateKey, JSON.stringify(data)); } catch {}
  }
})();
