// Sayfa açılınca yetki kontrolü
async function checkAdminAuth() {
    try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();
        if (!data.loggedIn) {
            window.location.href = 'login.html';
        } else {
            loadAdminScenes();
        }
    } catch (e) {
        console.log("Auth Hatası");
    }
}

async function loadAdminScenes() {
    const res = await fetch('/api/scenes');
    const scenes = await res.json();
    const list = document.getElementById('admin-list');
    list.innerHTML = '';

    if (scenes.length === 0) {
        list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: #888;">Henüz hiç sahne eklenmemiş.</td></tr>';
        return;
    }

    scenes.forEach((scene, index) => {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td style="color: #666;">#${index + 1}</td>
            <td style="font-weight: 600;">${scene.name}</td>
            <td>
                <span class="badge-color" style="background-color: ${scene.themeColor || '#a29bfe'};" title="${scene.themeColor}"></span>
            </td>
            <td style="font-size: 0.8rem; color: #888;">
                <i class="fa-solid fa-video"></i> ...${scene.videoUrl.slice(-15)} <br>
                <i class="fa-solid fa-music"></i> ...${scene.audioUrl.slice(-15)}
            </td>
            <td style="text-align: right;">
                <button onclick="deleteScene(${scene.id})" class="delete-btn">
                    <i class="fa-solid fa-trash"></i> Sil
                </button>
            </td>
        `;
        list.appendChild(tr);
    });
}

async function deleteScene(id) {
    if(confirm("Bu sahneyi silmek istediğine emin misin? Bu işlem geri alınamaz.")) {
        await fetch(`/api/scenes/${id}`, { method: 'DELETE' });
        loadAdminScenes();
    }
}

// Başlat
checkAdminAuth();