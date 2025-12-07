document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    
    try {
        const res = await fetch('/api/scenes', {
            method: 'POST',
            body: formData // JSON değil, FormData gönderiyoruz (Multer için)
        });
        
        const data = await res.json();
        if (data.success) {
            alert('Sahne başarıyla eklendi!');
            window.location.href = '/';
        } else {
            alert('Hata: ' + data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Yükleme sırasında bir hata oluştu.');
    }
});