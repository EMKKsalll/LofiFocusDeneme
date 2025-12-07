/* --- public/script.js (TAMAMINI DEĞİŞTİR) --- */

/* 1. OTURUM KONTROLÜ & GİRİŞ VİDEOSU */
document.addEventListener("DOMContentLoaded", () => {
    // Giriş Videosunu Yükle (Cache Önlemek için tarih ekledik)
    if (document.getElementById('bg-video')) {
        fetch('/api/settings').then(res => res.json()).then(settings => {
            if (settings.loginVideo && (location.pathname.includes('login') || location.pathname.includes('register'))) {
                const v = document.getElementById('bg-video');
                v.src = settings.loginVideo + '?v=' + new Date().getTime(); // Cache Fix
                v.load(); v.play().catch(e=>console.log(e));
            }
        });
    }
    // Ana Sayfa Yüklemeleri
    if (document.getElementById('sound-mixer-container')) { loadSounds(); loadScenes(); }
});

if (!location.pathname.includes('login') && !location.pathname.includes('register')) {
    fetch('/check-session').then(res => res.json()).then(data => {
        if (!data.loggedIn) location.href = '/login.html';
    });
}

/* 2. AUTH İŞLEMLERİ */
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const res = await fetch('/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: document.getElementById('username').value, password: document.getElementById('password').value })
        });
        const data = await res.json();
        if(data.success) location.href = '/'; else alert(data.error);
    });
}
const regForm = document.getElementById('register-form');
if (regForm) {
    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const res = await fetch('/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: document.getElementById('reg-username').value, password: document.getElementById('reg-password').value })
        });
        const data = await res.json();
        if(data.success) { alert('Kayıt başarılı!'); location.href='login.html'; } else alert(data.error);
    });
}

/* 3. SAYAÇ MANTIKLARI */
let timer;
let defaultTime = 25 * 60;
let timeLeft = defaultTime;
let isRunning = false;

function updateDisplay() {
    const d = document.getElementById('timer-display');
    if(d) d.innerText = `${Math.floor(timeLeft/60)}:${(timeLeft%60).toString().padStart(2,'0')}`;
}

function toggleTimer() {
    const btn = document.getElementById('main-btn');
    if(isRunning) {
        clearInterval(timer); isRunning=false; btn.innerText="Devam Et";
        document.body.classList.remove('focus-mode');
    } else {
        isRunning=true; btn.innerText="Duraklat";
        document.body.classList.add('focus-mode');
        timer = setInterval(()=>{
            if(timeLeft>0){ timeLeft--; updateDisplay(); }
            else { resetTimer(); alert("Süre Doldu!"); }
        }, 1000);
    }
}
function resetTimer() {
    clearInterval(timer); isRunning=false; timeLeft=defaultTime; updateDisplay();
    document.getElementById('main-btn').innerText="Başlat";
    document.body.classList.remove('focus-mode');
}

/* --- MANUEL SÜRE AYARI (YENİLENMİŞ) --- */
function toggleEditMode() {
    if(isRunning) return alert("Sayacı durdurun.");
    
    const box = document.getElementById('custom-timer-box');
    const display = document.getElementById('timer-display');
    const controls = document.querySelector('.controls'); // Kontrol tuşları
    const input = document.getElementById('custom-min');

    if(box.style.display === 'none') {
        // Düzenleme Modu AÇIK
        box.style.display = 'block';
        display.style.display = 'none';
        controls.style.opacity = '0';   // TUŞLARI GİZLE (Parlama Sorunu Çözüldü)
        controls.style.pointerEvents = 'none'; // Tıklanmasın
        input.value = ""; input.focus();
    } else {
        // Düzenleme Modu KAPALI
        box.style.display = 'none';
        display.style.display = 'block';
        controls.style.opacity = '1';   // TUŞLARI GÖSTER
        controls.style.pointerEvents = 'all';
    }
}

function saveCustomTime() {
    const val = parseInt(document.getElementById('custom-min').value);
    if(val > 0) {
        defaultTime = val * 60; timeLeft = defaultTime; updateDisplay();
        toggleEditMode();
    }
}
function handleEnter(e) { if(e.key==='Enter') saveCustomTime(); }

/* 4. MİKSER VE SAHNELER */
function loadSounds() {
    fetch('/api/sounds').then(r=>r.json()).then(sounds=>{
        const c = document.getElementById('sound-mixer-container');
        c.innerHTML = '';
        if(sounds.length===0) c.innerHTML='<p style="text-align:center;color:#666">Ses Yok</p>';
        sounds.forEach(s => {
            const div = document.createElement('div'); div.className='mixer-item';
            div.innerHTML = `<button class="sound-btn" onclick="toggleSound('${s.id}',this)">🔊 ${s.name}</button><input type="range" min="0" max="1" step="0.01" value="0.5" oninput="setVolume('${s.id}',this.value)"><audio id="audio-${s.id}" loop src="${s.path}"></audio>`;
            c.appendChild(div);
        });
    });
}
function toggleSound(id, btn) { const a=document.getElementById('audio-'+id); if(a.paused){a.play();btn.classList.add('active')}else{a.pause();btn.classList.remove('active')} }
function setVolume(id, v) { document.getElementById('audio-'+id).volume = v; }

function loadScenes() {
    fetch('/api/scenes').then(r=>r.json()).then(scenes=>{
        const l = document.getElementById('scene-list');
        l.innerHTML='';
        scenes.forEach(s => {
            const b = document.createElement('button'); b.className='scene-btn';
            b.innerHTML=`🎬 ${s.name}`;
            b.onclick=()=>{ document.getElementById('bg-video').src=s.videoPath; document.documentElement.style.setProperty('--primary-color', s.themeColor); };
            l.appendChild(b);
        });
    });
}

/* 5. DRAG & DROP */
const drag = document.getElementById("draggable-timer");
if(drag) {
    let p1=0,p2=0,p3=0,p4=0;
    drag.onmousedown=(e)=>{
        if(e.target.tagName==='BUTTON'||e.target.tagName==='INPUT')return;
        e.preventDefault(); p3=e.clientX; p4=e.clientY;
        document.onmouseup=()=>{document.onmouseup=null;document.onmousemove=null;};
        document.onmousemove=(e)=>{
            e.preventDefault(); p1=p3-e.clientX; p2=p4-e.clientY; p3=e.clientX; p4=e.clientY;
            drag.style.top=(drag.offsetTop-p2)+"px"; drag.style.left=(drag.offsetLeft-p1)+"px"; drag.style.transform="none";
        };
    };
}

/* 6. TO-DO */
const todo = document.getElementById('todo-input');
if(todo) {
    todo.addEventListener('keypress', (e)=>{
        if(e.key==='Enter' && e.target.value.trim()!==""){
            const d=document.createElement('div');
            d.innerHTML=`<span>${e.target.value}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#e74c3c;cursor:pointer">✖</button>`;
            document.getElementById('todo-list').appendChild(d); e.target.value='';
        }
    });
}