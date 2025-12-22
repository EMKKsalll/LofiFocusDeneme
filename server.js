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

// --- SOCKET.IO (ONLINE SAYAÇ) ---
let onlineUsers = 0;
io.on('connection', (socket) => {
    onlineUsers++;
    io.emit('userCount', onlineUsers);
    socket.on('disconnect', () => {
        onlineUsers--;
        io.emit('userCount', onlineUsers);
    });
});

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'lofi-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Multer Ayarları
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Veri Dosyaları
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
const scenesFile = path.join(dataDir, 'scenes.json');

const readJSON = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(usersFile)) writeJSON(usersFile, []);
if (!fs.existsSync(scenesFile)) writeJSON(scenesFile, []);

// --- API ROTALARI ---

// Auth İşlemleri
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    const users = readJSON(usersFile);
    if (users.find(u => u.email === email)) return res.json({ success: false, message: 'Mail kayıtlı!' });
    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ id: Date.now(), email, password: hashedPassword, favorites: [], presets: [] });
    writeJSON(usersFile, users);
    res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const users = readJSON(usersFile);
    const user = users.find(u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password))) return res.json({ success: false, message: 'Hata!' });
    req.session.user = { id: user.id, email: user.email };
    res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
    if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
    else res.json({ loggedIn: false });
});

// Sahne İşlemleri
app.get('/api/scenes', (req, res) => {
    res.json(readJSON(scenesFile));
});

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

app.delete('/api/scenes/:id', (req, res) => {
    let scenes = readJSON(scenesFile);
    scenes = scenes.filter(s => s.id !== parseInt(req.params.id));
    writeJSON(scenesFile, scenes);
    res.json({ success: true });
});

// Preset (Kayıtlı Ayar) İşlemleri
app.post('/api/presets', (req, res) => {
    if (!req.session.user) return res.json({ success: false });
    const { name, videoUrl, audioUrl, themeColor } = req.body;
    const users = readJSON(usersFile);
    const userIndex = users.findIndex(u => u.id === req.session.user.id);
    
    if(!users[userIndex].presets) users[userIndex].presets = [];
    
    const newPreset = { id: Date.now(), name, videoUrl, audioUrl, themeColor };
    users[userIndex].presets.push(newPreset);
    writeJSON(usersFile, users);
    res.json({ success: true, preset: newPreset });
});

app.get('/api/presets', (req, res) => {
    if (!req.session.user) return res.json([]);
    const users = readJSON(usersFile);
    const user = users.find(u => u.id === req.session.user.id);
    res.json(user.presets || []);
});

server.listen(PORT, () => console.log(`http://localhost:${PORT} çalışıyor...`));