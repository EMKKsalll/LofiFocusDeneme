const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// *** ADMIN YETKİSİ VERİLECEK MAİLLERİ BURAYA EKLE ***
const ADMIN_EMAILS = ["mamamaide0404@gmail.com", "admin@focus.com"];

// --- 1. SOKET (ODA VE CANLI SAYAÇ) YÖNETİMİ ---
let rooms = {}; 
// rooms objesi yapısı:
// {
//   'OdaAdi': { password: '123', users: [{id, username}], host: 'socketID' }
// }

io.on('connection', (socket) => {
    
    // Oda Listesini Gönder (Şifreleri gizleyerek)
    socket.on('getRooms', () => {
        const roomList = Object.keys(rooms).map(key => ({
            name: key,
            isPrivate: !!rooms[key].password, // Şifre varsa true döner
            count: rooms[key].users.length
        }));
        socket.emit('roomList', roomList);
    });

    // Oda Oluşturma
    socket.on('createRoom', ({ roomName, password, username }) => {
        if (rooms[roomName]) {
            socket.emit('error', 'Bu isimde bir oda zaten var!');
            return;
        }

        rooms[roomName] = {
            password: password || null, // Şifre yoksa null
            users: [],
            host: socket.id
        };

        // Oluşturan kişiyi odaya sok
        joinRoomLogic(socket, roomName, username);
        
        // Herkese güncel listeyi duyur
        io.emit('roomList', getSafeRoomList());
    });

    // Odaya Katılma
    socket.on('joinRoom', ({ roomName, password, username }) => {
        const room = rooms[roomName];
        
        if (!room) {
            socket.emit('error', 'Oda bulunamadı!');
            return;
        }

        // Şifre Kontrolü
        if (room.password && room.password !== password) {
            socket.emit('error', 'Hatalı şifre!');
            return;
        }

        joinRoomLogic(socket, roomName, username);
    });

    // Ortak Fonksiyon: Odaya Giriş İşlemleri
    function joinRoomLogic(socket, roomName, username) {
        socket.join(roomName);
        
        // Kullanıcıyı listeye ekle
        rooms[roomName].users.push({ id: socket.id, username });
        
        // Giriş yapana onay ver
        socket.emit('joinedRoom', { roomName });

        // Odadaki diğerlerine "Yeni biri geldi" de
        io.to(roomName).emit('roomUsers', rooms[roomName].users);
        
        // Genel oda listesini güncelle (Kişi sayısı değişti)
        io.emit('roomList', getSafeRoomList());
    }

    // Bağlantı Kopması (Disconnect)
    socket.on('disconnect', () => {
        for (const roomName in rooms) {
            // Kullanıcıyı odadan sil
            rooms[roomName].users = rooms[roomName].users.filter(u => u.id !== socket.id);
            
            if (rooms[roomName].users.length === 0) {
                // Oda boşaldıysa sil
                delete rooms[roomName];
            } else {
                // Oda hala doluysa listeyi güncelle
                io.to(roomName).emit('roomUsers', rooms[roomName].users);
            }
        }
        // Genel listeyi güncelle
        io.emit('roomList', getSafeRoomList());
    });
});

// Yardımcı: Şifreleri gizleyip liste döndürür
function getSafeRoomList() {
    return Object.keys(rooms).map(key => ({
        name: key,
        isPrivate: !!rooms[key].password,
        count: rooms[key].users.length
    }));
}

// --- 2. MIDDLEWARE VE AYARLAR ---
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'lofi-secret-key', resave: false, saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 saat
}));

// Dosya Yükleme Ayarı (Multer)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Klasör ve Dosya Kontrolleri
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
const scenesFile = path.join(dataDir, 'scenes.json');
const uploadDir = path.join(__dirname, 'public/uploads');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify([], null, 2));
if (!fs.existsSync(scenesFile)) fs.writeFileSync(scenesFile, JSON.stringify([], null, 2));

const readJSON = (file) => JSON.parse(fs.readFileSync(file));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// --- 3. API ROTALARI ---

// Kayıt Ol
app.post('/api/register', async (req, res) => {
    const { email, password, username } = req.body;
    const users = readJSON(usersFile);
    
    if (users.find(u => u.email === email)) {
        return res.json({ success: false, message: 'Bu mail zaten kayıtlı!' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    // Eğer username boşsa mailin başını al
    const finalUsername = username || email.split('@')[0];

    users.push({ 
        id: Date.now(), 
        email, 
        username: finalUsername, 
        password: hashedPassword, 
        presets: [], 
        logs: [] 
    });
    
    writeJSON(usersFile, users);
    res.json({ success: true });
});

// Giriş Yap
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const users = readJSON(usersFile);
    const user = users.find(u => u.email === email);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.json({ success: false, message: 'Hatalı mail veya şifre!' });
    }

    // Admin mi kontrol et
    const isAdmin = ADMIN_EMAILS.includes(user.email);

    req.session.user = { 
        id: user.id, 
        email: user.email, 
        username: user.username,
        isAdmin: isAdmin 
    };
    
    res.json({ success: true });
});

// Çıkış Yap
app.post('/api/logout', (req, res) => { 
    req.session.destroy(); 
    res.json({ success: true }); 
});

// Oturum Kontrolü
app.get('/api/check-auth', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// --- SAHNE (SCENE) İŞLEMLERİ (ADMİN) ---

// Sahneleri Getir
app.get('/api/scenes', (req, res) => { 
    res.json(readJSON(scenesFile)); 
});

// Sahne Yükle (Admin Paneli İçin)
app.post('/api/scenes/upload', upload.fields([{ name: 'videoFile' }, { name: 'audioFile' }]), (req, res) => {
    const { name, themeColor } = req.body;
    const scenes = readJSON(scenesFile);
    
    scenes.push({
        id: Date.now(),
        name,
        themeColor: themeColor || '#a29bfe',
        videoUrl: '/uploads/' + req.files['videoFile'][0].filename,
        audioUrl: '/uploads/' + req.files['audioFile'][0].filename
    });
    
    writeJSON(scenesFile, scenes);
    res.redirect('/admin.html');
});

// Sahne Sil
app.delete('/api/scenes/:id', (req, res) => {
    let scenes = readJSON(scenesFile);
    scenes = scenes.filter(s => s.id !== parseInt(req.params.id));
    writeJSON(scenesFile, scenes);
    res.json({ success: true });
});

// --- PRESET (KAYITLI AYARLAR) İŞLEMLERİ ---

app.post('/api/presets', (req, res) => {
    if (!req.session.user) return res.json({ success: false });
    const { name, videoUrl, audioUrl, themeColor } = req.body;
    const users = readJSON(usersFile);
    const userIndex = users.findIndex(u => u.id === req.session.user.id);
    
    if(!users[userIndex].presets) users[userIndex].presets = [];
    
    users[userIndex].presets.push({ id: Date.now(), name, videoUrl, audioUrl, themeColor });
    writeJSON(usersFile, users);
    res.json({ success: true });
});

app.get('/api/presets', (req, res) => {
    if (!req.session.user) return res.json([]);
    const users = readJSON(usersFile);
    const user = users.find(u => u.id === req.session.user.id);
    res.json(user.presets || []);
});

// --- LOGS (ÇALIŞMA GEÇMİŞİ) İŞLEMLERİ ---

app.post('/api/logs', (req, res) => {
    if (!req.session.user) return res.json({ success: false });
    const { task, duration, date } = req.body;
    const users = readJSON(usersFile);
    const userIndex = users.findIndex(u => u.id === req.session.user.id);
    
    if(!users[userIndex].logs) users[userIndex].logs = [];
    
    // Yeni kaydı en başa ekle
    users[userIndex].logs.unshift({ id: Date.now(), task, duration, date });
    
    // Sadece son 50 kaydı tut
    if(users[userIndex].logs.length > 50) users[userIndex].logs.pop();
    
    writeJSON(usersFile, users);
    res.json({ success: true });
});

app.get('/api/logs', (req, res) => {
    if (!req.session.user) return res.json([]);
    const users = readJSON(usersFile);
    const user = users.find(u => u.id === req.session.user.id);
    res.json(user.logs || []);
});

// Sunucuyu Başlat
server.listen(PORT, () => console.log(`Sunucu http://localhost:${PORT} adresinde aktif.`));