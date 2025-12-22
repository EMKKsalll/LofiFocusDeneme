const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ============================================================
// 1. MONGODB BAĞLANTISI VE AYARLAR
// ============================================================

// BURAYA DİKKAT: <db_password> kısmını silip kendi şifreni yaz!
const DB_URI = "mongodb+srv://mamamaide1:123456789@cluster0.p4kob.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(DB_URI)
    .then(() => console.log("✅ Veritabanına Bağlandı (MongoDB Atlas)"))
    .catch(err => console.error("❌ Veritabanı Hatası:", err));

// --- VERİTABANI ŞEMALARI (Tablolar) ---
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    username: String,
    password: { type: String, required: true },
    // Kullanıcının kaydettiği özel ayarlar
    presets: [{ 
        name: String, videoUrl: String, audioUrl: String, themeColor: String, id: Number 
    }],
    // Kullanıcının çalışma geçmişi
    logs: [{ 
        task: String, duration: Number, date: String, id: Number 
    }]
});
const User = mongoose.model('User', userSchema);

const sceneSchema = new mongoose.Schema({
    name: String,
    themeColor: String,
    videoUrl: String,
    audioUrl: String,
    id: Number 
});
const Scene = mongoose.model('Scene', sceneSchema);

// Admin Panelindeki Arka Plan Ayarları İçin Şema
const configSchema = new mongoose.Schema({
    loginBackgrounds: Object,
    scenes: Array
});
const Config = mongoose.model('Config', configSchema);

// --- MEVCUT KODLARIN ARASINA EKLE ---

// Oda Şeması (MongoDB için)
const roomSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    password: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});
const Room = mongoose.model('Room', roomSchema);

// Aktif Kullanıcıları Hafızada Tutacağız (DB'yi yormamak için)
let activeRoomUsers = {}; // { "OdaIsmi": [ {id, username, joinTime} ] }

// *** ADMIN YETKİSİ VERİLECEK MAİLLERİ BURAYA EKLE ***
const ADMIN_EMAILS = ["mamamaide0404@gmail.com", "admin@focus.com"];


// ============================================================
// 2. MIDDLEWARE VE KLASÖR AYARLARI
// ============================================================
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'lofi-secret-key', resave: false, saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 saat
}));

// Yükleme Klasörü Ayarları
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });


// --- SOCKET.IO (GERÇEK ZAMANLI ODA SİSTEMİ - DB ENTEGRELİ) ---
io.on('connection', (socket) => {
    
    // 1. Oda Listesini Gönder (Veritabanından Çeker)
    socket.on('getRooms', async () => {
        const roomList = await getSafeRoomList();
        socket.emit('roomList', roomList);
    });

    // 2. Oda Oluştur (Veritabanına Kaydeder)
    socket.on('createRoom', async ({ roomName, password, username }) => {
        try {
            // Önce DB'de var mı bak
            const existingRoom = await Room.findOne({ name: roomName });
            if (existingRoom) {
                socket.emit('error', 'Bu isimde bir oda zaten var!');
                return;
            }

            // Yoksa DB'ye kaydet (Kalıcı olması için)
            const newRoom = new Room({
                name: roomName,
                password: password || null
            });
            await newRoom.save();

            // Hafızadaki kullanıcı listesini başlat
            if (!activeRoomUsers[roomName]) activeRoomUsers[roomName] = [];

            // Odaya sok
            joinRoomLogic(socket, roomName, username);

        } catch (err) {
            console.error(err);
            socket.emit('error', 'Oda oluşturulurken hata oluştu.');
        }
    });

    // 3. Odaya Katıl
    socket.on('joinRoom', async ({ roomName, password, username }) => {
        try {
            // Odayı DB'den bul
            const room = await Room.findOne({ name: roomName });
            
            if (!room) {
                socket.emit('error', 'Oda bulunamadı!');
                return;
            }
            // Şifre kontrolü
            if (room.password && room.password !== password) {
                socket.emit('error', 'Hatalı şifre!');
                return;
            }

            // Giriş işlemini yap
            joinRoomLogic(socket, roomName, username);

        } catch (err) {
            console.error(err);
            socket.emit('error', 'Odaya girerken hata oluştu.');
        }
    });

    // --- YARDIMCI: Odaya Giriş Mantığı ---
    async function joinRoomLogic(socket, roomName, username) {
        socket.join(roomName);

        // Kullanıcı listesi hafızada yoksa oluştur
        if (!activeRoomUsers[roomName]) activeRoomUsers[roomName] = [];

        // Kullanıcı zaten listede mi?
        const existingUserIndex = activeRoomUsers[roomName].findIndex(u => u.id === socket.id);
        
        if (existingUserIndex === -1) {
            // Değilse ekle
            activeRoomUsers[roomName].push({ 
                id: socket.id, 
                username: username, 
                joinTime: Date.now() 
            });
        }

        // 1. Kullanıcıya "Girdin" de ve güncel listeyi ver
        socket.emit('joinedRoom', { roomName, users: activeRoomUsers[roomName] });
        
        // 2. Odadaki diğerlerine "Biri geldi" de ve listeyi güncelle
        io.to(roomName).emit('roomUsers', activeRoomUsers[roomName]);
        
        // 3. Herkese oda listesini (yeni kişi sayısıyla) duyur
        const updatedList = await getSafeRoomList();
        io.emit('roomList', updatedList);
    }

    // 4. Bağlantı Kopması (Disconnect)
    socket.on('disconnect', async () => {
        let changedRoom = null;

        // Hangi odadaydı bul ve çıkar
        for (const roomName in activeRoomUsers) {
            const userIndex = activeRoomUsers[roomName].findIndex(u => u.id === socket.id);
            
            if (userIndex !== -1) {
                activeRoomUsers[roomName].splice(userIndex, 1); // Listeden sil
                changedRoom = roomName;
                
                // Odadakilere güncel listeyi yolla
                io.to(roomName).emit('roomUsers', activeRoomUsers[roomName]);
                break;
            }
        }

        // Eğer bir odadan çıktıysa, ana listeyi (sayıları) güncelle
        if (changedRoom) {
            const updatedList = await getSafeRoomList();
            io.emit('roomList', updatedList);
        }
    });
});

// --- YARDIMCI: Oda Listesini Hazırla ---
async function getSafeRoomList() {
    // 1. Tüm odaları DB'den çek
    const dbRooms = await Room.find({});
    
    // 2. Formatla ve kişi sayısını ekle
    return dbRooms.map(r => ({
        name: r.name,
        isPrivate: !!r.password, // Şifre varsa true, yoksa false
        count: activeRoomUsers[r.name] ? activeRoomUsers[r.name].length : 0
    }));
}


// ============================================================
// 4. API ROTALARI (ARTIK MONGODB KULLANIYOR)
// ============================================================

// --- KULLANICI İŞLEMLERİ ---

// Kayıt Ol
app.post('/api/register', async (req, res) => {
    const { email, password, username } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.json({ success: false, message: 'Bu mail zaten kayıtlı!' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const finalUsername = username || email.split('@')[0];

        const newUser = new User({
            email,
            username: finalUsername,
            password: hashedPassword,
            presets: [],
            logs: []
        });
        
        await newUser.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Sunucu hatası.' });
    }
});

// Giriş Yap
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.json({ success: false, message: 'Hatalı mail veya şifre!' });
        }

        const isAdmin = ADMIN_EMAILS.includes(user.email);

        req.session.user = { 
            id: user._id, // MongoDB ID'si
            email: user.email, 
            username: user.username,
            isAdmin: isAdmin 
        };
        
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: 'Giriş hatası.' });
    }
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


// --- SAHNE (SCENE) İŞLEMLERİ ---

// Sahneleri Getir
app.get('/api/scenes', async (req, res) => { 
    try {
        const scenes = await Scene.find();
        res.json(scenes);
    } catch (err) { res.json([]); }
});

// Sahne Yükle (Admin)
app.post('/api/scenes/upload', upload.fields([{ name: 'videoFile' }, { name: 'audioFile' }]), async (req, res) => {
    if (!req.session.user || !req.session.user.isAdmin) return res.status(403).send("Yetkisiz");

    try {
        const { name, themeColor } = req.body;
        const newScene = new Scene({
            name,
            themeColor: themeColor || '#a29bfe',
            videoUrl: '/uploads/' + req.files['videoFile'][0].filename,
            audioUrl: '/uploads/' + req.files['audioFile'][0].filename,
            id: Date.now()
        });
        await newScene.save();
        res.redirect('/admin.html');
    } catch (err) {
        res.status(500).send("Yükleme hatası: " + err.message);
    }
});

// Sahne Sil
app.delete('/api/scenes/:id', async (req, res) => {
    if (!req.session.user || !req.session.user.isAdmin) return res.json({ success: false });
    try {
        await Scene.deleteOne({ id: parseInt(req.params.id) });
        res.json({ success: true });
    } catch (err) { res.json({ success: false }); }
});


// --- PRESET (KAYITLI AYARLAR) İŞLEMLERİ ---

app.post('/api/presets', async (req, res) => {
    if (!req.session.user) return res.json({ success: false });
    const { name, videoUrl, audioUrl, themeColor } = req.body;
    
    try {
        const user = await User.findById(req.session.user.id);
        user.presets.push({ id: Date.now(), name, videoUrl, audioUrl, themeColor });
        await user.save();
        res.json({ success: true });
    } catch (err) { res.json({ success: false }); }
});

app.get('/api/presets', async (req, res) => {
    if (!req.session.user) return res.json([]);
    try {
        const user = await User.findById(req.session.user.id);
        res.json(user.presets || []);
    } catch (err) { res.json([]); }
});


// --- LOGS (ÇALIŞMA GEÇMİŞİ) İŞLEMLERİ ---

app.post('/api/logs', async (req, res) => {
    if (!req.session.user) return res.json({ success: false });
    const { task, duration, date } = req.body;
    
    try {
        const user = await User.findById(req.session.user.id);
        user.logs.unshift({ id: Date.now(), task, duration, date });
        // Son 50 kaydı tut
        if(user.logs.length > 50) user.logs.pop();
        await user.save();
        res.json({ success: true });
    } catch (err) { res.json({ success: false }); }
});

app.get('/api/logs', async (req, res) => {
    if (!req.session.user) return res.json([]);
    try {
        const user = await User.findById(req.session.user.id);
        res.json(user.logs || []);
    } catch (err) { res.json([]); }
});


// --- ADMIN CONFIG (GİRİŞ EKRANI VİDEOLARI) ---
// Not: Senin attığın kodda bu yoktu ama script.js bunu istiyor, o yüzden ekledim.
app.get('/api/config', async (req, res) => {
    try {
        const config = await Config.findOne();
        res.json(config || {}); 
    } catch (err) { res.json({}); }
});

app.post('/api/config', async (req, res) => {
    // Sadece admin
    if (!req.session.user || !req.session.user.isAdmin) return res.status(403).json({error: "Yetkisiz"});
    
    try {
        let config = await Config.findOne();
        if (config) {
            config.loginBackgrounds = req.body.loginBackgrounds;
            config.scenes = req.body.scenes;
            await config.save();
        } else {
            config = new Config(req.body);
            await config.save();
        }
        res.json({ message: "Kaydedildi" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// Sunucuyu Başlat
server.listen(PORT, () => console.log(`Sunucu http://localhost:${PORT} adresinde aktif.`));