const video = document.getElementById('bg-video');
const audio = document.getElementById('bg-audio');
const rainAudio = document.getElementById('rain-audio');
const sceneList = document.getElementById('scene-list');
const presetList = document.getElementById('preset-list');
const sceneName = document.getElementById('scene-name');

// Socket IO Bağlantısı
let socket;
try {
    socket = io();
    socket.on('userCount', (count) => {
        document.getElementById('user-count').innerText = count;
    });
} catch (e) { console.log("Socket hatası:", e); }

let currentSceneData = { name: 'Varsayılan', videoUrl: '', audioUrl: '', themeColor: '#a29bfe' };

async function init() {
    const res = await fetch('/api/check-auth');
    const data = await res.json();
    if (!data.loggedIn) return window.location.href = 'login.html';
    
    document.getElementById('user-info').innerText = data.user.email;
    await loadScenes();
    await loadPresets();
}

async function loadScenes() {
    const res = await fetch('/api/scenes');
    const scenes = await res.json();
    sceneList.innerHTML = '';

    if (scenes.length > 0 && !video.src) changeScene(scenes[0]);

    scenes.forEach(scene => {
        const div = document.createElement('div');
        div.className = 'scene-btn';
        div.innerHTML = `<span>${scene.name}</span> <i class="fa-solid fa-play"></i>`;
        div.onclick = () => changeScene(scene);
        sceneList.appendChild(div);
    });
}

async function loadPresets() {
    const res = await fetch('/api/presets');
    const presets = await res.json();
    presetList.innerHTML = '';
    
    if(presets.length === 0) presetList.innerHTML = '<p style="font-size:0.8rem; color:#666; padding:5px;">Henüz kayıt yok.</p>';

    presets.forEach(preset => {
        const div = document.createElement('div');
        div.className = 'scene-btn';
        div.style.borderLeft = `3px solid ${preset.themeColor}`;
        div.innerHTML = `<span>${preset.name}</span> <i class="fa-solid fa-rotate-right"></i>`;
        div.onclick = () => changeScene(preset);
        presetList.appendChild(div);
    });
}

function changeScene(scene) {
    currentSceneData = scene;
    sceneName.innerText = scene.name;
    video.src = scene.videoUrl;
    audio.src = scene.audioUrl;
    
    const color = scene.themeColor || '#a29bfe';
    document.documentElement.style.setProperty('--primary', color);
    
    video.play().catch(e => console.log("Video oynatma hatası:", e));
    if(!audio.paused) audio.play();
}

async function saveCurrentPreset() {
    const name = prompt("Ayara bir isim ver:");
    if(!name) return;

    const presetData = {
        name: name,
        videoUrl: currentSceneData.videoUrl,
        audioUrl: currentSceneData.audioUrl,
        themeColor: currentSceneData.themeColor || '#a29bfe'
    };

    const res = await fetch('/api/presets', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(presetData)
    });
    const data = await res.json();
    if(data.success) { alert("Kaydedildi!"); loadPresets(); }
}

function adjustVideo() {
    const brightness = document.getElementById('brightnessRange').value;
    const blur = document.getElementById('blurRange').value;
    video.style.filter = `brightness(${brightness}%) blur(${blur}px)`;
}

function loadSpotify() {
    const link = document.getElementById('spotify-link').value;
    const container = document.getElementById('spotify-frame');
    let embedUrl = link.replace('spotify.com/', 'spotify.com/embed/'); // Basit çeviri
    container.innerHTML = `<iframe style="border-radius:12px" src="${embedUrl}" width="100%" height="80" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
    audio.pause();
    document.getElementById('musicBtn').innerHTML = '<i class="fa-solid fa-music"></i> Müzik';
}

let isPlaying = false;
function toggleMusic() {
    const btn = document.getElementById('musicBtn');
    if(!isPlaying) { audio.play(); btn.style.background = 'var(--primary)'; isPlaying = true; } 
    else { audio.pause(); btn.style.background = 'transparent'; isPlaying = false; }
}

function toggleRain() {
    const btn = document.getElementById('rainBtn');
    if(rainAudio.paused) { rainAudio.play(); btn.style.background = 'var(--primary)'; } 
    else { rainAudio.pause(); btn.style.background = 'transparent'; }
}

let timeLeft = 25 * 60;
let timerId = null;
function updateTimer() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    document.getElementById('timer').innerText = `${m}:${s}`;
}
function toggleTimer() {
    const btn = document.getElementById('timerBtn');
    if(timerId) { clearInterval(timerId); timerId = null; btn.innerHTML = '<i class="fa-solid fa-play"></i> Başlat'; } 
    else { btn.innerHTML = '<i class="fa-solid fa-pause"></i> Duraklat'; timerId = setInterval(() => { if(timeLeft > 0) { timeLeft--; updateTimer(); } else { clearInterval(timerId); alert("Süre bitti!"); } }, 1000); }
}
function resetTimer() { clearInterval(timerId); timerId = null; timeLeft = 25 * 60; updateTimer(); document.getElementById('timerBtn').innerHTML = '<i class="fa-solid fa-play"></i> Başlat'; }
async function logout() { await fetch('/api/logout', { method: 'POST' }); window.location.href = 'login.html'; }
function toggleMenu() { document.getElementById('sidebar').classList.toggle('show'); }

init();