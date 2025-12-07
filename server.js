const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(cors());

// Session Ayarları
app.use(session({
    secret: 'lofi_secret_key_123', // Gerçek projede .env dosyasında olmalı
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Localhost için false, Render.com'da https varsa true
}));

// Veritabanı Dosyaları
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const SCENES_FILE = path.join(__dirname, 'data', 'scenes.json');

// Yardımcı Fonksiyon: JSON Oku
const readData = (file) => {
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
};

// Yardımcı Fonksiyon: JSON Yaz
const writeData = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// Multer (Dosya Yükleme Ayarları)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- AUTH ROUTE'LARI ---

// Kayıt Ol
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const users = readData(USERS_FILE);

    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Kullanıcı zaten var.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now(), username, password: hashedPassword, isAdmin: username === 'admin' };
    
    users.push(newUser);
    writeData(USERS_FILE, users);
    
    res.json({ success: true, message: 'Kayıt başarılı! Giriş yapın.' });
});

// Giriş Yap
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = readData(USERS_FILE);
    const user = users.find(u => u.username === username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Hatalı kullanıcı adı veya şifre.' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;

    res.json({ success: true, isAdmin: user.isAdmin });
});

// Çıkış Yap
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// Oturum Kontrolü
app.get('/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, username: req.session.username, isAdmin: req.session.isAdmin });
    } else {
        res.json({ loggedIn: false });
    }
});

// --- SCENE (SAHNE) ROUTE'LARI ---

// Sahneleri Getir
app.get('/api/scenes', (req, res) => {
    const scenes = readData(SCENES_FILE);
    res.json(scenes);
});

// Yeni Sahne Ekle (Admin Only) - Video, Ses ve Renk
app.post('/api/scenes', upload.fields([{ name: 'video' }, { name: 'audio' }]), (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Yetkisiz işlem.' });

    const { name, themeColor } = req.body; // themeColor frontend'den geliyor
    const scenes = readData(SCENES_FILE);

    const newScene = {
        id: Date.now(),
        name,
        themeColor: themeColor || '#a29bfe', // Varsayılan renk
        videoPath: '/uploads/' + req.files['video'][0].filename,
        audioPath: req.files['audio'] ? '/uploads/' + req.files['audio'][0].filename : null
    };

    scenes.push(newScene);
    writeData(SCENES_FILE, scenes);
    res.json({ success: true, message: 'Sahne eklendi.' });
});

// Sunucuyu Başlat
app.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor.`);
});