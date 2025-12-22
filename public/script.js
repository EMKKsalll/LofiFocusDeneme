// ==========================================
// FOCUS ROOM - FINAL FULL SÜRÜM (ORİJİNAL KOD + YOUTUBE FIX)
// ==========================================

// 1. YARDIMCI FONKSİYON: YouTube ID Bulucu (GÜNCELLENDİ: ARTIK HER LİNKİ TANIR)
function getVideoID(url) {
    if (!url) return null;
    // Gelişmiş Regex: ?si=, &feature=, short linkler hepsini yakalar
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{10,12})/);
    return (match && match[1]) ? match[1] : null;
}

// DEFAULT CONFIG (Yedek olarak kalacak)
const DEFAULT_CONFIG = {
    credentials: {
        email: "admin@focus.com",
        password: "admin"
    },
    loginBackgrounds: {
        night: "https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-1610-large.mp4",
        light: "https://assets.mixkit.co/videos/preview/mixkit-white-clouds-on-blue-sky-1229-large.mp4",
        sepia: "https://assets.mixkit.co/videos/preview/mixkit-set-of-dried-autumn-leaves-1579-large.mp4"
    },
    scenes: [
        { name: "Doğa", url: "https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4" },
        { name: "Yağmur", url: "https://assets.mixkit.co/videos/preview/mixkit-rain-falling-on-the-window-of-a-room-1846-large.mp4" },
        { name: "Kafe", url: "https://assets.mixkit.co/videos/preview/mixkit-people-working-in-a-coffee-shop-4824-large.mp4" },
        { name: "Lo-Fi (YouTube)", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk" }, 
        { name: "Uzay", url: "https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-1610-large.mp4" }
    ]
};

let activeConfig = DEFAULT_CONFIG;

const translations = {
    tr: {
        welcome: "Hoş Geldin", loginTitle: "Giriş Yap", loginSub: "Devam etmek için giriş yapın.",
        regTitle: "Kayıt Ol", regSub: "Aramıza katılmaya hazır mısın?", phUser: "E-posta veya Kullanıcı Adı",
        phPass: "Şifre", phEmail: "E-posta Adresi", phPassConfirm: "Şifre Tekrar", btnLogin: "Giriş Yap",
        btnRegister: "Kayıt Ol", noAccount: "Hesabın yok mu?", hasAccount: "Zaten hesabın var mı?",
        linkRegister: "Kayıt Ol", linkLogin: "Giriş Yap", timerStart: "BAŞLAT", timerStop: "DURDUR",
        pomodoro: "Pomodoro", stopwatch: "Kronometre", taskPlaceholder: "Bugün neye odaklanacaksın?",
        roomWait: "Oda listesi yükleniyor..."
    },
    en: {
        welcome: "Welcome", loginTitle: "Login", loginSub: "Please login to continue.",
        regTitle: "Sign Up", regSub: "Ready to join us?", phUser: "Email or Username",
        phPass: "Password", phEmail: "Email Address", phPassConfirm: "Confirm Password", btnLogin: "Login",
        btnRegister: "Register", noAccount: "Don't have an account?", hasAccount: "Already have an account?",
        linkRegister: "Sign Up", linkLogin: "Login", timerStart: "START", timerStop: "PAUSE",
        pomodoro: "Pomodoro", stopwatch: "Stopwatch", taskPlaceholder: "What is your focus today?",
        roomWait: "Loading rooms..."
    }
};

let currentLang = localStorage.getItem('language') || 'tr';
let currentTheme = localStorage.getItem('theme') || 'night';
let timerInterval = null;
let isTimerRunning = false;
let timeLeft = 25 * 60; 
let timerMode = 'pomodoro';
let stopwatchSeconds = 0;
let sessionStartTime = 0; 
let currentViewMode = 'normal';
let isYtMuted = true;

const videoEl = document.getElementById('bg-video');
const rainAudio = document.getElementById('rain-audio');
const musicAudio = document.getElementById('bg-audio');

let socket;
try { socket = io(); } catch(e) { console.log("Socket sunucusu yok, yerel modda çalışıyor."); }

document.addEventListener('DOMContentLoaded', () => {
    applyLanguage(currentLang);
    
    // --- SOCKET DİNLEYİCİLERİNİ BAŞLAT ---
    if(socket) initSocketListeners();

    // --- VERİTABANI BAĞLANTISI ---
    fetch('/api/config')
        .then(res => res.json())
        .then(data => {
            if(data && data.scenes) {
                // Config'den gelen sahneler varsa al, yoksa default kullan
                if(data.scenes.length > 0) activeConfig = data;
                console.log("Ayarlar yüklendi.");
            }
            // Sahneleri ayrıca API'den çekmeye çalış
            if (document.body.classList.contains('dashboard-page')) {
                loadScenes(); 
            }
            checkLoginStatus();
        })
        .catch(err => {
            console.error("Veritabanı hatası:", err);
            checkLoginStatus();
        });
});

function checkLoginStatus() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (isLoggedIn) {
        switchToDashboard();
    } else {
        switchToLogin();
    }
}

function switchToDashboard() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    document.body.classList.remove('login-page');
    document.body.classList.add('dashboard-page');
    
    applyTheme(currentTheme); 
    initDashboardPage();
    
    // --- ODA LİSTESİNİ İSTE ---
    if(socket) socket.emit('getRooms');
}

function switchToLogin() {
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('dashboard-container').classList.add('hidden');
    document.body.classList.add('login-page');
    document.body.classList.remove('dashboard-page');

    applyTheme(currentTheme);
    initLoginPage();
}

// --- TEMA VE DİL FONKSİYONLARI ---
function applyTheme(theme) {
    localStorage.setItem('theme', theme);
    currentTheme = theme;
    
    document.body.className = ''; 
    if (theme === 'light') document.body.classList.add('light-mode');
    else if (theme === 'sepia') document.body.classList.add('sepia-mode');
    else document.body.classList.add('night-mode');
    
    if(document.getElementById('login-container').classList.contains('hidden')) {
         document.body.classList.add('dashboard-page');
    } else {
         document.body.classList.add('login-page');
    }

    document.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active'));
    const activeDot = document.getElementById(`theme-${theme}`);
    if (activeDot) activeDot.classList.add('active');

    const btnIcon = document.querySelector('#login-theme-btn i');
    if (btnIcon) btnIcon.className = theme === 'night' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

    if (document.body.classList.contains('login-page')) {
        const bgUrl = activeConfig.loginBackgrounds[theme];
        const ytId = getVideoID(bgUrl);

        if (ytId) {
            playYouTube(ytId);
        } else {
            hideYouTube();
            if(videoEl) {
                videoEl.style.display = 'block';
                videoEl.src = bgUrl;
                videoEl.play().catch(e => {});
            }
        }
    }
}

function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('language', lang);
    const t = translations[lang];
    
    // Login Textleri
    if (document.getElementById('txt-login-title')) {
        document.getElementById('txt-login-title').innerText = t.loginTitle;
        document.getElementById('txt-login-sub').innerText = t.loginSub;
        document.getElementById('btn-login-submit').innerText = t.btnLogin;
        document.getElementById('txt-no-account').innerText = t.noAccount;
        document.getElementById('link-go-register').innerText = t.linkRegister;
        document.getElementById('txt-register-title').innerText = t.regTitle;
        document.getElementById('txt-register-sub').innerText = t.regSub;
        document.getElementById('btn-register-submit').innerText = t.btnRegister;
        document.getElementById('txt-has-account').innerText = t.hasAccount;
        document.getElementById('link-go-login').innerText = t.linkLogin;
        
        document.getElementById('login-user').placeholder = t.phUser;
        document.getElementById('login-pass').placeholder = t.phPass;
        document.getElementById('reg-user').placeholder = t.phUser;
        document.getElementById('reg-email').placeholder = t.phEmail;
        document.getElementById('reg-pass').placeholder = t.phPass;
        document.getElementById('reg-pass-confirm').placeholder = t.phPassConfirm;
        document.getElementById('login-lang-btn').innerText = lang.toUpperCase();
    }
    
    // Dashboard Textleri
    if (document.getElementById('welcome-message')) {
        const username = localStorage.getItem('username') || 'Misafir';
        document.getElementById('welcome-message').innerText = `${t.welcome}, ${username}`;
        document.getElementById('mode-pomodoro').innerText = t.pomodoro;
        document.getElementById('mode-stopwatch').innerText = t.stopwatch;
        document.getElementById('taskInput').placeholder = t.taskPlaceholder;
        
        document.getElementById('lang-tr').classList.toggle('active', lang === 'tr');
        document.getElementById('lang-en').classList.toggle('active', lang === 'en');
        updateTimerButtonText();
    }
}

// --- LOGIN SAYFASI ---
function initLoginPage() {
    document.getElementById('login-form').onsubmit = (e) => {
        e.preventDefault(); 
        const inputUser = document.getElementById('login-user').value;
        const inputPass = document.getElementById('login-pass').value;
        
        if (inputUser === activeConfig.credentials?.email && inputPass === activeConfig.credentials?.password) {
            localStorage.setItem('role', 'admin');
        } else {
            localStorage.setItem('role', 'user');
        }
        localStorage.setItem('username', inputUser);
        localStorage.setItem('isLoggedIn', 'true'); 
        
        switchToDashboard();
    };

    document.getElementById('link-go-register').onclick = (e) => { 
        e.preventDefault(); 
        document.getElementById('login-box').classList.add('hidden'); 
        document.getElementById('register-box').classList.remove('hidden'); 
    };

    document.getElementById('link-go-login').onclick = (e) => { 
        e.preventDefault(); 
        document.getElementById('register-box').classList.add('hidden'); 
        document.getElementById('login-box').classList.remove('hidden'); 
    };

    document.getElementById('register-form').onsubmit = (e) => { 
        e.preventDefault(); 
        localStorage.setItem('username', document.getElementById('reg-user').value); 
        localStorage.setItem('isLoggedIn', 'true'); 
        switchToDashboard();
    };
    
    document.getElementById('login-lang-btn').onclick = () => applyLanguage(currentLang === 'tr' ? 'en' : 'tr');
    document.getElementById('login-theme-btn').onclick = () => applyTheme(currentTheme === 'night' ? 'light' : 'night');
}

// --- DASHBOARD SAYFASI ---
function initDashboardPage() {
    rainAudio.src = "https://cdn.pixabay.com/audio/2021/08/09/audio_659021c322.mp3";

    const createRoomBtn = document.getElementById('btn-create-room');
    if(createRoomBtn) {
        createRoomBtn.onclick = createRoom;
    }

    if (localStorage.getItem('role') === 'admin') {
        const adminBtn = document.getElementById('btn-admin-panel');
        if(adminBtn) {
            adminBtn.classList.remove('hidden');
            adminBtn.onclick = openAdminPanel;
        }
    }

    const closeAdminX = document.getElementById('close-admin-x');
    if(closeAdminX) closeAdminX.onclick = () => document.getElementById('admin-modal').style.display = 'none';
    
    document.getElementById('btn-save-config').onclick = saveAdminConfig;
    document.getElementById('btn-reset-config').onclick = resetAdminConfig;
    document.getElementById('btn-add-scene-row').onclick = () => addSceneInput();

    document.getElementById('menu-toggle').onclick = openSidebar;
    document.getElementById('close-sidebar').onclick = closeSidebar;
    document.getElementById('sidebar-overlay').onclick = closeSidebar;
    
    document.getElementById('lang-tr').onclick = () => applyLanguage('tr');
    document.getElementById('lang-en').onclick = () => applyLanguage('en');
    
    document.getElementById('theme-night').onclick = () => applyTheme('night');
    document.getElementById('theme-light').onclick = () => applyTheme('light');
    document.getElementById('theme-sepia').onclick = () => applyTheme('sepia');
    
    document.getElementById('btn-logout').onclick = () => { 
        localStorage.removeItem('isLoggedIn'); 
        switchToLogin();
    };
    
    document.getElementById('timerBtn').onclick = toggleTimer;
    document.getElementById('resetTimerBtn').onclick = resetTimer;
    document.getElementById('mode-pomodoro').onclick = () => setTimerMode('pomodoro');
    document.getElementById('mode-stopwatch').onclick = () => setTimerMode('stopwatch');

    const viewBtns = document.querySelectorAll('.view-btn');
    viewBtns.forEach(btn => {
        btn.onclick = () => {
            viewBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentViewMode = btn.dataset.mode;
            updateViewMode();
        };
    });
    
    document.getElementById('exit-zen-btn').onclick = () => {
        currentViewMode = 'normal';
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.view-btn[data-mode="normal"]').classList.add('active');
        updateViewMode();
    };

    document.getElementById('btn-add-task').onclick = addTask;
    document.getElementById('taskInput').onkeypress = (e) => { if(e.key === 'Enter') addTask(); };
    loadTodos();
    
    document.getElementById('rainBtn').onclick = toggleRain;
    document.getElementById('musicBtn').onclick = () => alert("Müzik için Spotify sekmesini kullanın.");
    document.getElementById('videoSoundBtn').onclick = toggleVideoMute;

    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.target}`).classList.add('active');
        };
    });

    document.getElementById('btn-set-yt').onclick = () => {
        const link = document.getElementById('yt-bg-link').value;
        const ytId = getVideoID(link);
        if (ytId) playYouTube(ytId);
        else alert("Geçersiz YouTube linki!");
    };

    document.getElementById('btn-set-spotify').onclick = () => {
        let link = document.getElementById('spotify-link').value;
        if (link.includes('open.spotify.com') && !link.includes('/embed')) {
            link = link.replace('open.spotify.com', 'open.spotify.com/embed');
        }
        document.getElementById('spotify-frame').innerHTML = `<iframe src="${link}" width="100%" height="80" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
    };

    document.getElementById('brightnessRange').oninput = updateFilters;
    document.getElementById('blurRange').oninput = updateFilters;
    document.getElementById('btn-show-history').onclick = showRealHistory;
    document.getElementById('close-history-x').onclick = () => document.getElementById('history-modal').style.display = 'none';
    
    loadScenes(); // Ortamları yükle
}

// --- YOUTUBE OYNATMA (GÜÇLENDİRİLDİ) ---
function playYouTube(videoId) {
    if (videoEl) {
        videoEl.pause();
        videoEl.style.display = 'none';
    }

    let iframe = document.getElementById('bg-youtube');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'bg-youtube';
        Object.assign(iframe.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            objectFit: 'cover', zIndex: '-99', border: 'none', display: 'block',
            pointerEvents: 'none' 
        });
        document.body.insertBefore(iframe, document.body.firstChild);
    }

    const origin = window.location.origin;
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&enablejsapi=1&origin=${origin}`;
    iframe.style.display = 'block';
    isYtMuted = true;
}

function hideYouTube() {
    const iframe = document.getElementById('bg-youtube');
    if(iframe) {
        iframe.style.display = 'none';
        iframe.src = "";
    }
}

// --- SOCKET VE ODA İŞLEMLERİ ---
let currentRoomName = null;

function initSocketListeners() {
    socket.on('roomList', (rooms) => {
        const listDiv = document.getElementById('room-list');
        if (!listDiv) return;

        listDiv.innerHTML = '';
        if (rooms.length === 0) {
            listDiv.innerHTML = '<p style="opacity:0.7; padding:5px;">Aktif oda yok.</p>';
            return;
        }

        rooms.forEach(room => {
            const div = document.createElement('div');
            const isActive = room.name === currentRoomName ? 'border: 1px solid #a29bfe;' : '';
            div.style.cssText = `background: rgba(255,255,255,0.1); padding: 8px; margin-bottom: 5px; border-radius: 5px; display:flex; justify-content:space-between; align-items:center; ${isActive}`;
            const actionBtn = room.name === currentRoomName 
                ? `<span style="font-size:0.8rem; color:#a29bfe;">Buradasın</span>`
                : `<button onclick="joinRoom('${room.name}', ${room.isPrivate})" style="padding:4px 8px; cursor:pointer; background:#6c5ce7; border:none; color:white; border-radius:3px;">Katıl</button>`;

            div.innerHTML = `<span><strong>${room.name}</strong> (${room.count}) ${room.isPrivate ? '🔒' : ''}</span>${actionBtn}`;
            listDiv.appendChild(div);
        });
    });

    socket.on('joinedRoom', ({ roomName, users }) => {
        currentRoomName = roomName;
        document.getElementById('current-room-info').classList.remove('hidden');
        document.getElementById('current-room-name-display').innerText = `(${roomName})`;
        updateRoomUsersList(users);
        alert(`"${roomName}" odasına katıldınız!`);
    });

    socket.on('roomUsers', (users) => updateRoomUsersList(users));
    socket.on('error', (msg) => alert("Hata: " + msg));
}

function updateRoomUsersList(users) {
    const list = document.getElementById('room-users-list');
    if(!list) return;
    list.innerHTML = '';
    users.forEach(u => {
        const minutes = Math.floor((Date.now() - u.joinTime) / 60000);
        const li = document.createElement('li');
        li.style.cssText = "padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between;";
        const isMe = u.id === socket.id ? ' (Sen)' : '';
        const color = u.id === socket.id ? '#a29bfe' : 'white';
        li.innerHTML = `<span style="color:${color};">👤 ${u.username}${isMe}</span><span style="font-size:0.8rem; opacity:0.7;">${minutes} dk'dır çalışıyor</span>`;
        list.appendChild(li);
    });
}

window.leaveRoom = function() { location.reload(); };

window.joinRoom = function(roomName, isPrivate) {
    let password = null;
    if (isPrivate) {
        password = prompt("Oda şifresi:");
        if (password === null) return;
    }
    const username = localStorage.getItem('username') || 'Anonim';
    socket.emit('joinRoom', { roomName, password, username });
};

function createRoom() {
    const nameInput = document.getElementById('new-room-name');
    const passInput = document.getElementById('new-room-pass');
    if (!nameInput) return alert("Hata: Oda adı kutusu bulunamadı.");
    const roomName = nameInput.value.trim();
    const password = passInput ? passInput.value.trim() : null;
    const username = localStorage.getItem('username') || 'Anonim';
    if (!roomName) return alert("Lütfen bir oda adı girin.");
    socket.emit('createRoom', { roomName, password, username });
    nameInput.value = '';
    if(passInput) passInput.value = '';
}

// --- ORTAMLARI YÜKLE (DÜZELTİLDİ: DB + CONFIG) ---
async function loadScenes() {
    const container = document.getElementById('scene-list');
    if(!container) return;

    try {
        // Sunucudan (Veritabanından) çek
        const res = await fetch('/api/scenes');
        const dbScenes = await res.json();
        
        // Eğer veritabanı boşsa veya hata varsa aktif config'i kullan
        let scenesToLoad = (dbScenes && dbScenes.length > 0) ? dbScenes : activeConfig.scenes;

        container.innerHTML = '';
        scenesToLoad.forEach(s => {
            const div = document.createElement('div');
            div.className = 'scene-btn';
            
            // Veritabanında 'videoUrl', config'de 'url' olabilir. İkisini de kontrol et.
            const targetUrl = s.videoUrl || s.url;
            const themeColor = s.themeColor || '#a29bfe';

            div.innerHTML = `<i class="fa-solid fa-image"></i> ${s.name}`;
            div.style.borderLeft = `4px solid ${themeColor}`;

            div.addEventListener('click', () => {
                if(document.getElementById('scene-name')) document.getElementById('scene-name').innerText = s.name;
                const ytId = getVideoID(targetUrl);

                if (ytId) {
                    playYouTube(ytId);
                    document.documentElement.style.setProperty('--primary-color', themeColor);
                } else {
                    // Eğer YouTube ID'si bulunamazsa ve bu bir .mp4 ise
                    if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
                        console.error("YouTube ID çıkarılamadı:", targetUrl);
                    } else {
                        hideYouTube();
                        if(videoEl) {
                            videoEl.style.display = 'block';
                            videoEl.src = targetUrl;
                            videoEl.play().catch(e => console.log("Video hatası:", e));
                        }
                    }
                }
            });
            container.appendChild(div);
        });
    } catch (error) { 
        console.error("Sahne yükleme hatası:", error); 
    }
}

// --- ADMIN FORM ---
function openAdminPanel() {
    document.getElementById('admin-modal').style.display = 'flex';
    document.getElementById('admin-bg-night').value = activeConfig.loginBackgrounds.night;
    document.getElementById('admin-bg-light').value = activeConfig.loginBackgrounds.light;
    document.getElementById('admin-bg-sepia').value = activeConfig.loginBackgrounds.sepia;
    const container = document.getElementById('admin-scenes-container');
    container.innerHTML = '';
    activeConfig.scenes.forEach(scene => addSceneInput(scene.name, scene.url));
}

function addSceneInput(name = '', url = '') {
    const container = document.getElementById('admin-scenes-container');
    const div = document.createElement('div');
    div.className = 'admin-scene-row';
    div.innerHTML = `<input type="text" class="scene-name" placeholder="Ortam Adı" value="${name}"><input type="text" class="scene-url" placeholder="Video URL" value="${url}"><button class="btn-remove-scene" onclick="this.parentElement.remove()">Sil</button>`;
    container.appendChild(div);
}

function saveAdminConfig() {
    activeConfig.loginBackgrounds.night = document.getElementById('admin-bg-night').value;
    activeConfig.loginBackgrounds.light = document.getElementById('admin-bg-light').value;
    activeConfig.loginBackgrounds.sepia = document.getElementById('admin-bg-sepia').value;
    const sceneRows = document.querySelectorAll('.admin-scene-row');
    const newScenes = [];
    sceneRows.forEach(row => {
        const name = row.querySelector('.scene-name').value;
        const url = row.querySelector('.scene-url').value;
        if(name && url) newScenes.push({ name, url });
    });
    activeConfig.scenes = newScenes;

    fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeConfig)
    })
    .then(res => res.json())
    .then(() => {
        alert("Ayarlar Veritabanına Kaydedildi!");
        if(document.body.classList.contains('dashboard-page')) loadScenes();
        else applyTheme(currentTheme);
        document.getElementById('admin-modal').style.display = 'none';
    })
    .catch(err => alert("Kaydetme hatası: " + err));
}

function resetAdminConfig() {
    if(confirm("Fabrika ayarlarına dönülsün mü?")) location.reload();
}

// --- YARDIMCILAR ---
function updateFilters() {
    const b = document.getElementById('brightnessRange').value;
    const blur = document.getElementById('blurRange').value;
    const filter = `brightness(${b}%) blur(${blur}px)`;
    if(videoEl) videoEl.style.filter = filter;
    const yt = document.getElementById('bg-youtube');
    if(yt) yt.style.filter = filter;
}

function toggleRain() {
    const btn = document.getElementById('rainBtn');
    if (rainAudio.paused) { rainAudio.play(); btn.classList.add('active'); } 
    else { rainAudio.pause(); btn.classList.remove('active'); }
}

// DONMA SORUNUNU ÇÖZEN GÜVENLİ FONKSİYON
function toggleVideoMute() {
    const btn = document.getElementById('videoSoundBtn');
    const ytIframe = document.getElementById('bg-youtube');
    
    if (ytIframe && ytIframe.style.display !== 'none') {
        isYtMuted = !isYtMuted;
        const command = isYtMuted ? 'mute' : 'unMute';
        if(ytIframe.contentWindow) ytIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args: [] }), '*');
        btn.innerHTML = isYtMuted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
    } 
    else if (videoEl && videoEl.style.display !== 'none') {
        videoEl.muted = !videoEl.muted;
        btn.innerHTML = videoEl.muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
        
        // Ekstra: Arka plan sesi (audio) varsa onu da yönet
        if(musicAudio && musicAudio.src) {
             if(videoEl.muted) musicAudio.pause();
             else musicAudio.play().catch(e => console.log(e));
        }
    }
}

function toggleTimer() {
    if (isTimerRunning) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        if(videoEl) videoEl.pause();
        const sessionDuration = (Date.now() - sessionStartTime) / 1000 / 60; 
        if(sessionDuration >= 1) saveSessionToLocal(Math.floor(sessionDuration));
    } else {
        isTimerRunning = true;
        sessionStartTime = Date.now();
        if(videoEl && videoEl.style.display !== 'none') videoEl.play();
        updateViewMode();
        timerInterval = setInterval(() => {
            if (timerMode === 'pomodoro') {
                if (timeLeft > 0) timeLeft--;
                else completeSession();
            } else {
                stopwatchSeconds++;
            }
            updateTimerDisplay();
        }, 1000);
    }
    updateTimerButtonText();
}

function updateViewMode() {
    const panel = document.getElementById('main-panel');
    const exitBtn = document.getElementById('exit-zen-btn');
    panel.classList.remove('ui-minimal', 'ui-hidden');
    exitBtn.classList.add('hidden');
    if (isTimerRunning) {
        if (currentViewMode === 'minimal') panel.classList.add('ui-minimal');
        else if (currentViewMode === 'zen') {
            panel.classList.add('ui-hidden');
            exitBtn.classList.remove('hidden');
        }
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    timeLeft = 25 * 60;
    stopwatchSeconds = 0;
    updateTimerDisplay();
    updateTimerButtonText();
    document.getElementById('main-panel').classList.remove('ui-minimal', 'ui-hidden');
    document.getElementById('exit-zen-btn').classList.add('hidden');
}

function setTimerMode(mode) {
    timerMode = mode;
    resetTimer();
    document.getElementById('mode-pomodoro').classList.toggle('active', mode === 'pomodoro');
    document.getElementById('mode-stopwatch').classList.toggle('active', mode === 'stopwatch');
}

function updateTimerDisplay() {
    let val = timerMode === 'pomodoro' ? timeLeft : stopwatchSeconds;
    const m = Math.floor(val / 60).toString().padStart(2, '0');
    const s = (val % 60).toString().padStart(2, '0');
    document.getElementById('timer').innerText = `${m}:${s}`;
}

function updateTimerButtonText() {
    const t = translations[currentLang];
    const btn = document.getElementById('timerBtn');
    if (!btn) return;
    btn.innerHTML = isTimerRunning ? `<i class="fa-solid fa-pause"></i> ${t.timerStop}` : `<i class="fa-solid fa-play"></i> ${t.timerStart}`;
}

function completeSession() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    const duration = timerMode === 'pomodoro' ? 25 : Math.floor(stopwatchSeconds / 60);
    saveSessionToLocal(duration);
    alert("Süre doldu! Oturum kaydedildi.");
    resetTimer();
}

function saveSessionToLocal(durationMinutes) {
    if(durationMinutes <= 0) return;
    let currentTaskName = document.getElementById('current-task-display').innerText.replace('Odak: ', '') || "Genel Çalışma";
    let sessions = JSON.parse(localStorage.getItem('studySessions') || '[]');
    sessions.push({ date: new Date().toISOString().split('T')[0], duration: durationMinutes, task: currentTaskName });
    localStorage.setItem('studySessions', JSON.stringify(sessions));
}

let chartInstance = null;
function showRealHistory() {
    document.getElementById('history-modal').style.display = 'flex';
    const ctx = document.getElementById('weeklyChart').getContext('2d');
    const sessions = JSON.parse(localStorage.getItem('studySessions') || '[]');
    const last7Days = [];
    const dataPoints = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const total = sessions.filter(s => s.date === dateStr).reduce((acc, curr) => acc + curr.duration, 0);
        last7Days.push(d.toLocaleDateString(currentLang === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'short' }));
        dataPoints.push(total);
    }
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: last7Days, datasets: [{ label: currentLang === 'tr' ? 'Süre (dk)' : 'Time (min)', data: dataPoints, backgroundColor: 'rgba(162, 155, 254, 0.6)', borderColor: '#a29bfe', borderWidth: 1 }] },
        options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { color: 'white' } }, x: { ticks: { color: 'white' } } }, plugins: { legend: { labels: { color: 'white' } } } }
    });
    const todaySessions = sessions.filter(s => s.date === new Date().toISOString().split('T')[0]);
    const detailsList = document.getElementById('history-details-list');
    detailsList.innerHTML = todaySessions.length ? todaySessions.map(s => `<div class="detail-item"><span class="detail-task">${s.task || "Genel"}</span><span class="detail-time">${s.duration} dk</span></div>`).join('') : "<p style='opacity:0.6; font-size:0.9rem;'>Bugün henüz çalışma kaydı yok.</p>";
}

function openSidebar() { document.getElementById('sidebar').classList.add('show'); document.getElementById('sidebar-overlay').classList.add('show'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('show'); document.getElementById('sidebar-overlay').classList.remove('show'); }

function addTask() {
    const input = document.getElementById('taskInput');
    const txt = input.value.trim();
    if (!txt) return;
    const todos = JSON.parse(localStorage.getItem('todos') || '[]');
    todos.push({ text: txt, completed: false });
    localStorage.setItem('todos', JSON.stringify(todos));
    input.value = '';
    loadTodos();
}

function loadTodos() {
    const list = document.getElementById('todo-list');
    list.innerHTML = '';
    const todos = JSON.parse(localStorage.getItem('todos') || '[]');
    todos.forEach((todo, index) => {
        const li = document.createElement('li');
        li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        li.innerHTML = `<span>${todo.text}</span> <i class="fa-solid fa-trash" style="color:#ff6b6b;"></i>`;
        li.querySelector('span').onclick = () => document.getElementById('current-task-display').innerText = `Odak: ${todo.text}`;
        li.querySelector('i').onclick = (e) => { e.stopPropagation(); todos.splice(index, 1); localStorage.setItem('todos', JSON.stringify(todos)); loadTodos(); };
        list.appendChild(li);
    });
}