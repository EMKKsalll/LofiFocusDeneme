/* --- 1. OTURUM VE GİRİŞ VİDEOSU --- */
// Sayfa yüklenince çalışır
document.addEventListener("DOMContentLoaded", () => {
    // Login veya Register sayfasındaysak videoyu çek
    if (document.getElementById('bg-video')) {
        fetch('/api/settings')
            .then(res => res.json())
            .then(settings => {
                if (settings.loginVideo && (location.pathname.includes('login') || location.pathname.includes('register'))) {
                    const video = document.getElementById('bg-video');
                    video.src = settings.loginVideo;
                    video.load(); // Tarayıcıyı yenilemeye zorla
                    video.play().catch(e => console.log("Otomatik oynatma engellendi, kullanıcı etkileşimi bekleniyor."));
                }
            });
    }

    // Ana Sayfadaysak (index.html) Sesleri ve Sahneleri Yükle
    if (document.getElementById('sound-mixer-container')) {
        loadSounds();
        loadScenes();
    }
});

// Oturum Kontrolü
if (!location.pathname.includes('login') && !location.pathname.includes('register')) {
    fetch('/check-session').then(res => res.json()).then(data => {
        if (!data.loggedIn) location.href = '/login.html';
    });
}

/* --- 2. SES MİKSERİ (ADMİNDEN GELEN SESLERİ YÜKLE) --- */
function loadSounds() {
    fetch('/api/sounds')
        .then(res => res.json())
        .then(sounds => {
            const container = document.getElementById('sound-mixer-container');
            container.innerHTML = ''; // Temizle

            if (sounds.length === 0) {
                container.innerHTML = '<p style="color:#888; text-align:center; font-size:0.8rem;">Henüz ses eklenmemiş.<br>Admin panelinden ekleyin.</p>';
                return;
            }

            sounds.forEach(sound => {
                // Her ses için HTML oluştur
                const div = document.createElement('div');
                div.className = 'mixer-item';
                div.innerHTML = `
                    <button class="sound-btn" onclick="toggleSound('${sound.id}', this)">🔊 ${sound.name}</button>
                    <input type="range" min="0" max="1" step="0.01" value="0.5" oninput="setVolume('${sound.id}', this.value)">
                    <audio id="audio-${sound.id}" loop src="${sound.path}"></audio>
                `;
                container.appendChild(div);
            });
        });
}

function toggleSound(id, btn) {
    const audio = document.getElementById('audio-' + id);
    if(audio.paused) { audio.play(); btn.classList.add('active'); }
    else { audio.pause(); btn.classList.remove('active'); }
}
function setVolume(id, val) { document.getElementById('audio-' + id).volume = val; }

/* --- 3. SAHNELERİ YÜKLE --- */
function loadScenes() {
    const sceneList = document.getElementById('scene-list');
    if(!sceneList) return;
    
    fetch('/api/scenes').then(res=>res.json()).then(scenes => {
        sceneList.innerHTML = ''; // Temizle
        if(scenes.length === 0) sceneList.innerHTML = '<p style="text-align:center; color:#888;">Sahne yok.</p>';
        
        scenes.forEach(scene => {
            const btn = document.createElement('button');
            btn.className = 'scene-btn'; 
            btn.innerHTML = `<span>🎬 ${scene.name}</span>`;
            btn.onclick = () => {
                document.getElementById('bg-video').src = scene.videoPath;
                document.documentElement.style.setProperty('--primary-color', scene.themeColor);
            };
            sceneList.appendChild(btn);
        });
    });
}

/* --- 4. AUTH FORM İŞLEMLERİ --- */
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
        if (data.success) location.href = '/';
        else alert(data.error);
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
        if (data.success) { alert('Kayıt başarılı!'); location.href = 'login.html'; }
        else alert(data.error);
    });
}

/* --- 5. DRAG & DROP --- */
const dragElement = document.getElementById("draggable-timer");
if (dragElement) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    dragElement.onmousedown = (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    };
    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        dragElement.style.top = (dragElement.offsetTop - pos2) + "px";
        dragElement.style.left = (dragElement.offsetLeft - pos1) + "px";
        dragElement.style.transform = "none";
    }
    function closeDragElement() { document.onmouseup = null; document.onmousemove = null; }
}

/* --- 6. SAYAÇ & ODAK MODU --- */
let timer;
let defaultTime = 25 * 60;
let timeLeft = defaultTime;
let isRunning = false;

function updateDisplay() {
    const display = document.getElementById('timer-display');
    if (display) display.innerText = `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`;
}

function toggleTimer() {
    const btn = document.getElementById('main-btn');
    if (isRunning) {
        clearInterval(timer); isRunning = false; btn.innerText = "Devam Et";
        document.body.classList.remove('focus-mode');
    } else {
        isRunning = true; btn.innerText = "Duraklat";
        document.body.classList.add('focus-mode');
        timer = setInterval(() => {
            if (timeLeft > 0) { timeLeft--; updateDisplay(); } 
            else { resetTimer(); alert("Süre doldu!"); }
        }, 1000);
    }
}

function resetTimer() {
    clearInterval(timer); isRunning = false; timeLeft = defaultTime; updateDisplay();
    if(document.getElementById('main-btn')) document.getElementById('main-btn').innerText = "Başlat";
    document.body.classList.remove('focus-mode');
}

// Manuel Süre Ayarı
function toggleEditMode() {
    if(isRunning) return alert("Sayacı durdurun.");
    const box = document.getElementById('custom-timer-box');
    const display = document.getElementById('timer-display');
    const input = document.getElementById('custom-min');
    
    if(box.style.display === 'none') { 
        box.style.display = 'block'; display.style.display = 'none'; 
        input.value = ""; input.focus();
    }
    else { box.style.display = 'none'; display.style.display = 'block'; }
}

function saveCustomTime() {
    const input = document.getElementById('custom-min');
    const min = parseInt(input.value);
    if(min > 0) { 
        defaultTime = min * 60; timeLeft = defaultTime; updateDisplay(); toggleEditMode(); 
    }
}
function handleEnter(e) { if(e.key==='Enter') saveCustomTime(); }

/* --- 7. TO-DO --- */
const todoInput = document.getElementById('todo-input');
if(todoInput) {
    todoInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter' && e.target.value.trim() !== "") {
            const div = document.createElement('div');
            div.innerHTML = `<span>${e.target.value}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#e74c3c;cursor:pointer;">✖</button>`;
            document.getElementById('todo-list').appendChild(div);
            e.target.value = '';
        }
    });
}