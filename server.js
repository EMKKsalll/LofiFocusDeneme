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
const DB_URI = "mongodb+srv://mamamaide:admin1234@cluster0.p4kob.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

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


// --- 1. SOKET (ODA VE CANLI SAYAÇ) YÖNETİMİ ---
let rooms = {}; 

io.on('connection', (socket) => {
    
    // Oda Listesini Gönder
    socket.on('getRooms', () => {
        socket.emit('roomList', getSafeRoomList());
    });

    // Oda Oluşturma
    socket.on('createRoom', ({ roomName, password, username }) => {
        if (rooms[roomName]) {
            socket.emit('error', 'Bu isimde bir oda zaten var!');
            return;
        }

        rooms[roomName] = {
            password: password || null,
            users: [],
            host: socket.id
        };

        joinRoomLogic(socket, roomName, username);
    });

    // Odaya Katılma
    socket.on('joinRoom', ({ roomName, password, username }) => {
        const room = rooms[roomName];
        if (!room) {
            socket.emit('error', 'Oda bulunamadı!');
            return;
        }
        if (room.password && room.password !== password) {
            socket.emit('error', 'Hatalı şifre!');
            return;
        }
        joinRoomLogic(socket, roomName, username);
    });

    // --- GÜNCELLENMİŞ JOIN MANTIĞI (Çoklu Girişi Engeller) ---
    function joinRoomLogic(socket, roomName, username) {
        const room = rooms[roomName];
        
        // Kullanıcı zaten bu odada var mı? (Socket ID'sine göre kontrol)
        const existingUserIndex = room.users.findIndex(u => u.id === socket.id);
        
        // Eğer kullanıcı zaten varsa, listeye tekrar ekleme!
        if (existingUserIndex === -1) {
            socket.join(roomName);
            room.users.push({ 
                id: socket.id, 
                username: username, 
                joinTime: Date.now() // Ne zaman katıldığını tutuyoruz
            });
        }

        // Kullanıcıya odaya girdiğini bildir
        socket.emit('joinedRoom', { roomName, users: room.users });
        
        // Odadaki herkese güncel kullanıcı listesini gönder
        io.to(roomName).emit('roomUsers', room.users);
        
        // Tüm sunucuya güncel oda listesini (kişi sayısını) duyur
        io.emit('roomList', getSafeRoomList());
    }

    // Bağlantı Kopması
    socket.on('disconnect', () => {
        for (const roomName in rooms) {
            const room = rooms[roomName];
            // Kullanıcıyı listeden çıkar
            room.users = room.users.filter(u => u.id !== socket.id);
            
            if (room.users.length === 0) {
                // Oda boşsa sil
                delete rooms[roomName];
            } else {
                // Oda boş değilse kalanlara güncel listeyi yolla
                io.to(roomName).emit('roomUsers', room.users);
            }
        }
        io.emit('roomList', getSafeRoomList());
    });
});

function getSafeRoomList() {
    return Object.keys(rooms).map(key => ({
        name: key,
        isPrivate: !!rooms[key].password,
        count: rooms[key].users.length
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