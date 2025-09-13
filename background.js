// WebMinutes MV3 background tracker
// Tracks time spent on the active tab while the user is active and a Chrome window is focused.
(function(){
	const TICK_MINUTES = 0.25; // 15 seconds
	const ALARM_NAME = 'wm-tick';

	// State
	let current = { tabId: null, windowId: null, url: null, start: 0 };
	let isUserActive = true;
	let isWindowFocused = true;
	let lastDayKey = todayKey();

	function todayKey(){
		const d = new Date();
		const m = String(d.getMonth()+1).padStart(2,'0');
		const day = String(d.getDate()).padStart(2,'0');
		return `${d.getFullYear()}-${m}-${day}`;
	}
	function now(){ return Date.now(); }
	function isTrackableUrl(url){
		if(!url) return false;
		return /^(https?:)/i.test(url); // only http/https
	}

	async function addMsToUrl(url, ms){
		if(!url || !isFinite(ms) || ms <= 0) return;
		try{
			const key = todayKey();
			const data = await chrome.storage.local.get([key]);
			const map = data[key] && typeof data[key] === 'object' ? data[key] : {};
			const prev = map[url] || 0;
			map[url] = prev + ms;
			await chrome.storage.local.set({ [key]: map });
		}catch(e){
			console.warn('WebMinutes: failed to persist time', e);
		}
	}

	async function flush(reason){
		try{
			// Rotate day if needed
			const tk = todayKey();
			if (tk !== lastDayKey){
				lastDayKey = tk;
				// Reset the start so we don't attribute previous span into the new day
				if(current.url) current.start = now();
				return;
			}

			if(!current.url || !isUserActive || !isWindowFocused) return;
			const end = now();
			const delta = Math.max(0, end - (current.start || end));
			if(delta > 0 && isTrackableUrl(current.url)){
				// Clamp any excessively large delta (e.g., if worker slept too long)
				const clamped = Math.min(delta, 5 * 60 * 1000); // 5 minutes max per flush
				await addMsToUrl(current.url, clamped);
				current.start = end;
			} else {
				current.start = end;
			}
		}catch(e){
			console.warn('WebMinutes: flush error', reason, e);
		}
	}

	async function setActive(tab){
		try{
			const url = tab && tab.url ? tab.url : null;
			// If url not known (like chrome://), keep but won't track
			if (current.tabId === tab.id && current.url === url) {
				// no change
				current.windowId = tab.windowId;
				return;
			}
			await flush('switch');
			current = { tabId: tab.id, windowId: tab.windowId, url, start: now() };
		}catch(e){
			console.warn('WebMinutes: setActive error', e);
		}
	}

		function setupAlarm(){
			try{
				if(!chrome.alarms){ return; }
				chrome.alarms.clear(ALARM_NAME, ()=>{
					try{ chrome.alarms.create(ALARM_NAME, { periodInMinutes: TICK_MINUTES }); }catch(e){}
				});
			}catch(e){ console.warn('WebMinutes: alarm setup error', e); }
		}

	async function initActiveContext(){
		try{
			const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
			if(tab) await setActive(tab);
		}catch{}
	}

	// Listeners
	chrome.runtime.onStartup.addListener(()=>{ setupAlarm(); initActiveContext(); });
	chrome.runtime.onInstalled.addListener(()=>{ setupAlarm(); initActiveContext(); chrome.idle.setDetectionInterval?.(60); });

			chrome?.alarms?.onAlarm?.addListener?.(async (alarm)=>{
				if(alarm && alarm.name === ALARM_NAME){
					await flush('alarm');
				}
			});

		chrome?.idle?.onStateChanged?.addListener?.(async (state)=>{
			isUserActive = (state === 'active');
			await flush('idle-change');
		});

	chrome.windows.onFocusChanged.addListener(async (windowId)=>{
		isWindowFocused = (windowId !== chrome.windows.WINDOW_ID_NONE);
		await flush('focus-change');
		if(isWindowFocused){
			try{
				const [tab] = await chrome.tabs.query({ active: true, windowId });
				if(tab) await setActive(tab);
			}catch{}
		}
	});

	chrome.tabs.onActivated.addListener(async (activeInfo)=>{
		try{
			const tab = await chrome.tabs.get(activeInfo.tabId);
			if(tab) await setActive(tab);
		}catch(e){ console.warn('WebMinutes: onActivated', e); }
	});

	chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab)=>{
		try{
			if(tabId === current.tabId && (changeInfo.url || changeInfo.status === 'complete')){
				await setActive(tab);
			}
		}catch(e){ console.warn('WebMinutes: onUpdated', e); }
	});

	chrome.tabs.onRemoved.addListener(async (tabId, removeInfo)=>{
		if(tabId === current.tabId){
			await flush('tab-removed');
			current = { tabId: null, windowId: null, url: null, start: 0 };
		}
	});
})();

