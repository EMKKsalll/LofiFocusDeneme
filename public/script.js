// Auth Kontrolü (Login/Register sayfaları hariç)
if (!window.location.pathname.includes('login') && !window.location.pathname.includes('register')) {
    fetch('/check-session').then(res => res.json()).then(data => {
        if (!data.loggedIn) window.location.href = '/login.html';
        
        // İlk giriş mi? Modal göster
        if (!localStorage.getItem('modalShown')) {
            const modal = document.getElementById('welcome-modal');
            if(modal) modal.style.display = 'flex';
        }
    });
}

// Modal Kapatma
function closeModal() {
    document.getElementById('welcome-modal').style.display = 'none';
    localStorage.setItem('modalShown', 'true');
}

// --- script.js İÇİNDEKİ İLGİLİ BÖLÜM ---

// 1. GİRİŞ YAPMA İŞLEMİ
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const res = await fetch('/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (data.success) {
                // Admin ise admin sayfasına, değilse ana sayfaya yönlendirilebilir
                // Ama şimdilik direkt ana sayfaya atıyoruz
                window.location.href = '/';
            } else {
                alert('Hata: ' + data.error);
            }
        } catch (err) {
            console.error(err);
            alert('Sunucuya bağlanılamadı.');
        }
    });
}

// 2. KAYIT OLMA İŞLEMİ (BUNU EKLEMEYİ UNUTMA)
const registerForm = document.getElementById('register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        
        try {
            const res = await fetch('/register', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (data.success) {
                alert('Kayıt başarılı! Şimdi giriş yapabilirsin.');
                window.location.href = 'login.html';
            } else {
                alert('Hata: ' + (data.error || 'Kayıt başarısız.'));
            }
        } catch (err) {
            console.error(err);
            alert('Sunucu hatası.');
        }
    });
}
// (Register form mantığı Login ile aynı yapıdadır, endpoint /register olur)

// --- Ana Sayfa İşlemleri ---
const sceneList = document.getElementById('scene-list');
if (sceneList) {
    // Sahneleri Getir
    fetch('/api/scenes').then(res => res.json()).then(scenes => {
        if(scenes.length === 0) {
            sceneList.innerHTML = '<p>Henüz sahne yok.</p>';
            return;
        }
        

        scenes.forEach((scene, index) => {
            const btn = document.createElement('button');
            btn.innerText = scene.name;
            btn.onclick = () => loadScene(scene);
            sceneList.appendChild(btn);
            
            // İlk sahneyi otomatik yükle
            if (index === 0) loadScene(scene);
        });
    });
}

// SAHNE VE TEMA DEĞİŞTİRME (EN ÖNEMLİ KISIM)
function loadScene(scene) {
    // 1. Videoyu değiştir
    document.getElementById('bg-video').src = scene.videoPath;
    
    // 2. Sesi değiştir
    const audio = document.getElementById('bg-audio');
    if (scene.audioPath) {
        audio.src = scene.audioPath;
        audio.play();
    } else {
        audio.pause();
    }

    // 3. CSS Değişkenini Güncelle (Dinamik Tema)
    document.documentElement.style.setProperty('--primary-color', scene.themeColor);
    
    // Aktif butonu işaretle
    document.querySelectorAll('.scene-selector button').forEach(b => b.classList.remove('active'));
    // (Burada buton referansını bulup active class eklenebilir)
}

// Ses Kontrolü
const volSlider = document.getElementById('volume-slider');
if(volSlider) {
    volSlider.addEventListener('input', (e) => {
        document.getElementById('bg-audio').volume = e.target.value;
    });
}

// Pomodoro Sayacı
let timer;
let timeLeft = 25 * 60;
let isRunning = false;

function updateDisplay() {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    document.getElementById('timer').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
}

function toggleTimer() {
    if (isRunning) {
        clearInterval(timer);
        isRunning = false;
    } else {
        isRunning = true;
        timer = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateDisplay();
            } else {
                clearInterval(timer);
                alert("Süre doldu!");
            }
        }, 1000);
    }
}

function resetTimer() {
    clearInterval(timer);
    isRunning = false;
    timeLeft = 25 * 60;
    updateDisplay();
}

// To-Do Listesi (Basit LocalStorage)
const todoInput = document.getElementById('todo-input');
if (todoInput) {
    todoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const div = document.createElement('div');
            div.className = 'todo-item';
            div.innerHTML = `<span>${todoInput.value}</span> <button onclick="this.parentElement.remove()" style="background:none; border:none; color:red;">X</button>`;
            document.getElementById('todo-list').appendChild(div);
            todoInput.value = '';
        }
    });

    
}
