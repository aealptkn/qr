// --- ELEMENTLER ---
const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const serialBtn = document.getElementById("serialBtn");
const ocrBtn = document.getElementById("ocrBtn");
const switchBtn = document.getElementById("switchBtn"); 
const flashBtn = document.getElementById("flashBtn");
const createQrBtn = document.getElementById("createQrBtn");
const clearBtn = document.getElementById("clearBtn");
const resultList = document.getElementById("resultList");
const scanArea = document.getElementById("scanArea");
const ocrInput = document.getElementById("ocrInput");
const zoomContainer = document.getElementById("zoomContainer"); 
const zoomSlider = document.getElementById("zoomSlider"); 
const miniCopyBtn = document.getElementById("miniCopyBtn");
const miniShareBtn = document.getElementById("miniShareBtn");

// --- KIRPMA ELEMENTLERİ ---
const cropContainer = document.getElementById('cropContainer');
const imageToCrop = document.getElementById('imageToCrop');
const doCropBtn = document.getElementById('doCropBtn');
const cancelCropBtn = document.getElementById('cancelCropBtn');
const rotateCropBtn = document.getElementById('rotateCropBtn');
let cropper;

// --- DEĞİŞKENLER ---
let stream, track;
let scanning = false;
let serialMode = false;
let lastScan = "";
let lastScanTime = 0;
const scanCooldown = 1000;
let torchOn = false;
let currentFacingMode = "environment"; 

const beep = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
const codeReader = new ZXing.BrowserMultiFormatReader();

// DİKKAT: Eski Canvas oluşturma (scanCanvas) bölümü senin çalışan mantığın lehine silindi.

// --- BUTON OLAYLARI ---
createQrBtn.onclick = openQrGenerator;

if (navigator.share) {
    miniShareBtn.style.display = "inline-block";
}

miniCopyBtn.onclick = async () => {
    const texts = Array.from(document.querySelectorAll('.scanned-text')).map(el => el.textContent).join('\n\n');
    if(!texts) { alert("Kopyalanacak veri yok!"); return; }
    try { await navigator.clipboard.writeText(texts); alert("Tüm liste kopyalandı!"); } 
    catch { alert("Kopyalama başarısız."); }
};

miniShareBtn.onclick = async () => {
    const texts = Array.from(document.querySelectorAll('.scanned-text')).map(el => el.textContent).join('\n\n');
    if(!texts) { alert("Paylaşılacak veri yok!"); return; }
    try { await navigator.share({ title: 'Tarama Sonuçları', text: texts }); } 
    catch (err) { console.log("Paylaşım iptal edildi:", err); }
};

startBtn.onclick = () => { 
  if (scanning && !serialMode) { stopCamera(); return; } 
  serialMode = false; 
  startScanner(); 
};

serialBtn.onclick = () => { 
  if (scanning && serialMode) { stopCamera(); return; } 
  serialMode = true; 
  startScanner(); 
};

flashBtn.onclick = toggleFlash;
clearBtn.onclick = () => { resultList.innerHTML = ""; lastScan = ""; }; 
switchBtn.onclick = () => { currentFacingMode = currentFacingMode === "environment" ? "user" : "environment"; if(scanning) startScanner(); };
ocrBtn.onclick = () => { stopCamera(); ocrInput.click(); };

// --- OCR VE KIRPMA LOGİĞİ ---
ocrInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    imageToCrop.src = event.target.result;
    cropContainer.style.display = 'flex';
    if(cropper) cropper.destroy();
    cropper = new Cropper(imageToCrop, { viewMode:1, dragMode:'move', autoCropArea:0.8 });
  };
  reader.readAsDataURL(file);
  ocrInput.value = "";
});

cancelCropBtn.addEventListener('click', () => {
  cropContainer.style.display = 'none';
  if(cropper) cropper.destroy();
});

if (rotateCropBtn) {
    rotateCropBtn.addEventListener('click', () => {
      if(cropper) cropper.rotate(90);
    });
}

doCropBtn.addEventListener('click', async () => {
  if(!cropper) return;
  cropContainer.style.display = 'none';
  //addResult("Kırpılan alan işleniyor..."); 
  const canvas = cropper.getCroppedCanvas({ maxWidth:2048, maxHeight:2048, imageSmoothingQuality:'high' });
  canvas.toBlob(async blob => {
    cropper.destroy();
    try {
      const result = await Tesseract.recognize(blob,'tur',{
        logger:m=>console.log(m),
        workerPath:'./worker.min.js',
        corePath:'./tesseract-core.wasm.js',
        langPath:'./'
      });
      const text = result.data.text.trim();
      if(text) addResult("Okunan Metin\n"+text);
      else addResult("Metin tespit edilemedi.");
      beep.play().catch(()=>{}); navigator.vibrate?.(100);
    } catch(err) {
      addResult("Metin okuma hatası: "+err.message);
    }
  },'image/jpeg',0.95);
});

// --- KAMERA TARAYICI ---
async function startScanner() {
  if(scanning) stopCamera();
  scanning = true;
  lastScanTime = 0; 
  zoomContainer.style.display = "none";

  try {
    // 1. Kameradan görüntüyü (stream) alıyoruz
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:currentFacingMode } });
    
    // Zoom ayarı için track'i kenara not ediyoruz
    track = stream.getVideoTracks()[0];

    // DİKKAT: Buradaki video.srcObject = stream ve video.play() satırlarını SİLDİK.
    // Çünkü aşağıdaki kod (decodeFromStream) bunu zaten yapıyor. Çakışmayı böyle engelledik.

    // 2. Stream'i ve Video elementini ZXing kütüphanesine teslim ediyoruz
    // "Videoyu oynatmak ve okumak senin işin" diyoruz.
    codeReader.decodeFromStream(stream, video, (result, err) => {
        if (result) {
            const value = result.text;
            
            if(serialMode){
              const now = Date.now();
              if(now - lastScanTime > scanCooldown){
                addResult(value, null); 
                beep.play().catch(()=>{}); navigator.vibrate?.(100);
                lastScanTime = now;
              }
            } else {
              if(value !== lastScan){
                addResult(value, null);
                beep.play().catch(()=>{}); navigator.vibrate?.(100);
                lastScan = value;
                stopCamera(); 
              }
            }
        }
    });

    // 3. Zoom kontrolünü kamera oturduktan sonra aktif ediyoruz
    setTimeout(() => {
      const caps = track.getCapabilities();
      if(caps.zoom){
        zoomContainer.style.display="block";
        zoomSlider.min=caps.zoom.min; zoomSlider.max=caps.zoom.max; zoomSlider.step=caps.zoom.step;
        zoomSlider.value=track.getSettings().zoom||1;
        zoomSlider.oninput=async e=>await track.applyConstraints({advanced:[{zoom:parseFloat(e.target.value)}]});
      }
    }, 500);

  } catch(err){
    console.error(err);
    alert("Kamera hatası: " + err.message);
    scanning = false;
  }
}

// DİKKAT: Eski async function scanLoop() tamamen silindi.

// --- YARDIMCI FONKSİYONLAR ---
function addResult(text, imageBase64=null){
  const div = document.createElement("div");
  
  const textSpan = document.createElement("span");
  textSpan.className = "scanned-text";

  if(isValidUrl(text)){
    const a = document.createElement("a"); a.href=text; a.target="_blank"; a.textContent=text; 
    textSpan.appendChild(a);
  } else {
    textSpan.textContent=text;
  }
  div.appendChild(textSpan);

  if(imageBase64){
    const downloadBtn = document.createElement("button"); 
    downloadBtn.innerHTML = "📷 İndir"; 
    downloadBtn.className = "secondary"; 
    downloadBtn.style.padding = "4px 8px"; 
    downloadBtn.style.fontSize = "12px";
    downloadBtn.style.marginTop = "5px";
    downloadBtn.onclick = () => { 
        const link = document.createElement("a"); link.href = imageBase64; link.download = "tarama_"+Date.now()+".jpg"; link.click(); 
    };
    div.appendChild(document.createElement("br")); 
    div.appendChild(downloadBtn);
  }

  resultList.appendChild(div);
  resultList.scrollTop = resultList.scrollHeight;
}

function isValidUrl(string){ try{ new URL(string); return true; } catch{ return false; } }

async function toggleFlash(){ if(!track) return; const caps=track.getCapabilities(); if(!caps.torch){ alert("Flash desteklenmiyor."); return; } torchOn=!torchOn; await track.applyConstraints({advanced:[{torch:torchOn}]}); }

function stopCamera(){ 
  scanning=false; 
  torchOn=false; 
  zoomContainer.style.display="none"; 
  stream?.getTracks().forEach(t=>t.stop()); 
  codeReader.reset(); // Tarayıcının arkaplanda çalışmasını durdurmak için eklendi
}

// --- OFFLINE BAĞIMLILIK KONTROLÜ (Sadece İlk Açılışta Çalışır) ---
async function bagimliliklariKontrolEt() {
    if (localStorage.getItem("offlineKontrolOnaylandi") === "true") {
        return;
    }

    const dosyalar = [
        './zxing.min.js',
        './tesseract.min.js',
        './cropper.min.css',
        './cropper.min.js',
        './worker.min.js',
        './tesseract-core.wasm.js',
        './tesseract-core.wasm', // EKSİK OLAN KRİTİK DOSYA EKLENDİ
        './qrcode.min.js',
        './tur.traineddata.gz'
    ];

    let eksikDosyalar = [];
    let bulunanDosyalar = [];

    for (let dosya of dosyalar) {
        try {
            const yanit = await fetch(dosya, { method: 'HEAD', cache: 'no-store' });
            if (yanit.ok) {
                bulunanDosyalar.push(dosya);
            } else {
                eksikDosyalar.push(dosya);
            }
        } catch (hata) {
            eksikDosyalar.push(dosya);
        }
    }

    let mesaj = "Offline Kullanım Kontrol Raporu\n\n";

    if (eksikDosyalar.length === 0) {
        mesaj += "✅ Harika! Tüm gerekli dosyalar cihazında mevcut.\nUygulama %100 internetsiz çalışmaya hazır.\n";
    } else {
        mesaj += "⚠️ DİKKAT! Uygulamanın internetsiz çalışmasını engelleyecek EKSİK dosyalar var:\n";
        eksikDosyalar.forEach(d => mesaj += " - " + d + "\n");
        mesaj += "\nLütfen bu dosyaların proje klasöründe olduğundan emin ol.\n";
    }

    mesaj += "\nBu mesajı onayladığınızda bir daha gösterilmeyecektir. Onaylıyor musunuz?";

    const onay = confirm(mesaj);
    if (onay) {
        localStorage.setItem("offlineKontrolOnaylandi", "true");
    }
}

// Sayfa yüklendiğinde kontrolü otomatik başlat
window.addEventListener('load', () => {
    // Kameranın açılışını engellememesi için 1.5 saniye gecikmeli çalıştırıyoruz
    setTimeout(bagimliliklariKontrolEt, 1500);
});

// --- KARTVİZİT (QR GENERATOR) LOGİĞİ ---
let qrCodeObj = null;

function openQrGenerator() {
    stopCamera(); // Kamera arkada çalışmasın
    document.getElementById("qrGeneratorContainer").style.display = "flex";
    
    // Hafızadan eski bilgileri getir
    const savedData = JSON.parse(localStorage.getItem("myCardData") || "{}");
    document.getElementById("vName").value = savedData.name || "";
    document.getElementById("vTitle").value = savedData.title || "";
    document.getElementById("vOrg").value = savedData.org || "";
    document.getElementById("vPhone").value = savedData.phone || "";
    document.getElementById("vEmail").value = savedData.email || "";
    document.getElementById("vAddress").value = savedData.address || "";

    // Eğer veri varsa açılışta direkt QR göster
    if(savedData.name) {
        generateAndSaveQr();
    }
}

function closeQrGenerator() {
    document.getElementById("qrGeneratorContainer").style.display = "none";
}

function generateAndSaveQr() {
    const name = document.getElementById("vName").value.trim();
    const title = document.getElementById("vTitle").value.trim();
    const org = document.getElementById("vOrg").value.trim();
    const phone = document.getElementById("vPhone").value.trim();
    const email = document.getElementById("vEmail").value.trim();
    const address = document.getElementById("vAddress").value.trim();

    console.log("Container:", qrContainer);
    console.log("QRCode:", QRCode);

    if (!name) { alert("Lütfen en azından bir isim girin."); return; }

    // Verileri tarayıcı hafızasına kaydet
    const cardData = { name, title, org, phone, email, address };
    localStorage.setItem("myCardData", JSON.stringify(cardData));

    // vCard (VCF) Formatını Oluştur
    // Bu format sayesinde tarayan kişi "Rehbere Ekle" diyebilir
    let vCard = `BEGIN:VCARD\nVERSION:3.0\n`;
    vCard += `N:${name};;;\n`;
    vCard += `FN:${name}\n`;
    if(org) vCard += `ORG:${org}\n`;
    if(title) vCard += `TITLE:${title}\n`;
    if(phone) vCard += `TEL:${phone}\n`;
    if(email) vCard += `EMAIL:${email}\n`;
    if(address) vCard += `ADR:;;${address};;;;\n`;
    vCard += `END:VCARD`;

    // Önceki QR varsa temizle
    const qrContainer = document.getElementById("generatedQrCode");
    qrContainer.innerHTML = "";

    // Yeni QR oluştur (qrcode.js kütüphanesini kullanır)
    try {
        qrCodeObj = new QRCode(qrContainer, {
            text: vCard,
            width: 180,
            height: 180,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.M
        });
    } catch(e) {
        alert("QR Kütüphanesi (qrcode.min.js) eksik! Lütfen klasöre ekleyin.");
    }
}