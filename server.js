const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(cors());

// Session Ayarları
app.use(session({
    secret: 'lofi_secret_key',
    resave: false,
    saveUninitialized: false
}));

// --- KLASÖR VE DOSYA KONTROLLERİ ---
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public/uploads');

// Klasörler yoksa oluştur
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Veritabanı Dosyaları
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SCENES_FILE = path.join(DATA_DIR, 'scenes.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SOUNDS_FILE = path.join(DATA_DIR, 'sounds.json'); // Sesler veritabanı

// Dosyalar yoksa içlerini boş dizi [] veya default ayar ile oluştur
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(SCENES_FILE)) fs.writeFileSync(SCENES_FILE, '[]');
if (!fs.existsSync(SOUNDS_FILE)) fs.writeFileSync(SOUNDS_FILE, '[]');
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ loginVideo: null }));

// Veri Okuma/Yazma Yardımcı Fonksiyonları
const readData = (file) => JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
const writeData = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Multer (Dosya Yükleme Ayarları)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- ROTALAR ---

// 1. KAYIT OL
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const users = readData(USERS_FILE);
    if (users.find(u => u.username === username)) return res.json({ success: false, error: 'Kullanıcı zaten var.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now(), username, password: hashedPassword, isAdmin: username === 'admin' };
    
    users.push(newUser);
    writeData(USERS_FILE, users);
    res.json({ success: true });
});

// 2. GİRİŞ YAP
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = readData(USERS_FILE);
    const user = users.find(u => u.username === username);

    if (!user || !(await bcrypt.compare(password, user.password))) return res.json({ success: false, error: 'Hatalı giriş.' });

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;
    res.json({ success: true });
});

// 3. ÇIKIŞ YAP
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// 4. OTURUM KONTROL
app.get('/check-session', (req, res) => {
    res.json({ loggedIn: !!req.session.userId, isAdmin: req.session.isAdmin });
});

// --- API: SAHNELER (SCENES) ---
app.get('/api/scenes', (req, res) => res.json(readData(SCENES_FILE)));

app.post('/api/scenes', upload.fields([{ name: 'video' }, { name: 'audio' }]), (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Yetkisiz' });
    
    const scenes = readData(SCENES_FILE);
    const newScene = {
        id: Date.now(),
        name: req.body.name,
        themeColor: req.body.themeColor || '#a29bfe',
        videoPath: '/uploads/' + req.files['video'][0].filename,
        audioPath: req.files['audio'] ? '/uploads/' + req.files['audio'][0].filename : null
    };
    scenes.push(newScene);
    writeData(SCENES_FILE, scenes);
    res.json({ success: true });
});

// --- API: ORTAM SESLERİ (SOUNDS) ---
app.get('/api/sounds', (req, res) => res.json(readData(SOUNDS_FILE)));

app.post('/api/sounds', upload.single('audio'), (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Yetkisiz' });
    
    const sounds = readData(SOUNDS_FILE);
    const newSound = {
        id: Date.now(),
        name: req.body.name,
        path: '/uploads/' + req.file.filename
    };
    
    sounds.push(newSound);
    writeData(SOUNDS_FILE, sounds);
    res.json({ success: true });
});

// --- API: AYARLAR (GİRİŞ VİDEOSU) ---
app.get('/api/settings', (req, res) => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    res.json(settings);
});

app.post('/api/settings/login-video', upload.single('video'), (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Yetkisiz' });
    
    const settings = readData(SETTINGS_FILE);
    settings.loginVideo = '/uploads/' + req.file.filename;
    
    writeData(SETTINGS_FILE, settings);
    res.json({ success: true, path: settings.loginVideo });
});

// --- SUNUCUYU BAŞLAT ---
app.listen(PORT, () => console.log(`Sunucu çalışıyor: http://localhost:${PORT}`));