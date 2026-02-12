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
let globalVCardData = ""; // Oluşturulan vCard verisini burada tutacağız

const beep = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
const codeReader = new ZXing.BrowserMultiFormatReader();

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

// --- KAMERA TARAYICI (S25 ve Yüksek Çözünürlük Fixli) ---
async function startScanner() {
  if(scanning) stopCamera();
  scanning = true;
  lastScanTime = 0; 
  zoomContainer.style.display = "none";

  try {
    // BURASI GÜNCELLENDİ: ideal: 4096 diyerek S25'i ana lense zorluyoruz
    const constraints = {
        video: {
            facingMode: currentFacingMode,
            width: { ideal: 4096 }, 
            height: { ideal: 2160 }, 
            advanced: [{ focusMode: "continuous" }] 
        }
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    track = stream.getVideoTracks()[0];

    // Kamera açıldıktan sonra özellikleri kontrol et (Debug için konsola yaz)
    const settings = track.getSettings();
    console.log(`Kamera Açıldı: ${settings.width}x${settings.height}`);

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

// --- YARDIMCI FONKSİYONLAR ---
function addResult(text, imageBase64=null){
  const div = document.createElement("div");
  const textSpan = document.createElement("span");
  textSpan.className = "scanned-text";

  // --- KARTVİZİT ALGILAMA (Rehbere Kaydet) ---
  if (text.startsWith("BEGIN:VCARD")) {
      // İsmi çekmeye çalışalım
      let nameMatch = text.match(/FN:(.*)/) || text.match(/N:(.*)/);
      let contactName = nameMatch ? nameMatch[1].split(';')[0].replace("CHARSET=UTF-8:", "") : "Yeni Kişi";
      
      textSpan.innerHTML = `📇 <b>Kişi Kartı Algılandı:</b><br>${contactName}`;
      
      const saveContactBtn = document.createElement("button");
      saveContactBtn.innerHTML = "📥 Rehbere Kaydet";
      saveContactBtn.className = "secondary"; 
      saveContactBtn.style.cssText = "display:block; width:100%; margin-top:8px; padding:10px; background:#34c759; color:white; border:none; border-radius:8px;";
      
      saveContactBtn.onclick = () => {
          // vCard verisini bir dosya (blob) haline getir
          const blob = new Blob([text], { type: "text/vcard" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${contactName}.vcf`; // Dosya adı
          a.click();
          URL.revokeObjectURL(url);
      };
      
      div.appendChild(textSpan);
      div.appendChild(saveContactBtn);

  } else if(isValidUrl(text)){
    const a = document.createElement("a"); a.href=text; a.target="_blank"; a.textContent=text; 
    textSpan.appendChild(a);
    div.appendChild(textSpan);
  } else {
    textSpan.textContent=text;
    div.appendChild(textSpan);
  }

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
  codeReader.reset(); 
}

// --- OFFLINE BAĞIMLILIK KONTROLÜ ---
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
        './tesseract-core.wasm', 
        './easy.qrcode.min.js',
        './tur.traineddata.gz'
    ];

    let eksikDosyalar = [];
    for (let dosya of dosyalar) {
        try {
            const yanit = await fetch(dosya, { method: 'HEAD', cache: 'no-store' });
            if (!yanit.ok) eksikDosyalar.push(dosya);
        } catch (hata) {
            eksikDosyalar.push(dosya);
        }
    }

    if (eksikDosyalar.length > 0) {
        let mesaj = "⚠️ EKSİK DOSYALAR VAR (Offline Çalışmaz):\n";
        eksikDosyalar.forEach(d => mesaj += " - " + d + "\n");
        alert(mesaj);
    } else {
        const onay = confirm("✅ Tüm dosyalar tam! Uygulama internetsiz çalışmaya hazır.\nBu mesajı bir daha görmek istemiyorsanız Tamam'a basın.");
        if (onay) localStorage.setItem("offlineKontrolOnaylandi", "true");
    }
}

window.addEventListener('load', () => {
    setTimeout(bagimliliklariKontrolEt, 1500);
});

// --- KARTVİZİT (QR GENERATOR) LOGİĞİ ---
let qrCodeObj = null;

function openQrGenerator() {
    stopCamera(); 
    document.getElementById("qrGeneratorContainer").style.display = "flex";
    
    // Açılır açılmaz eski QR'ı temizle (Hayalet görüntüyü engeller)
    document.getElementById("generatedQrCode").innerHTML = ""; 
    document.getElementById("shareQrContainer").style.display = "none";
    
    // Hafızadan bilgileri getir
    const savedData = JSON.parse(localStorage.getItem("myCardData") || "{}");
    document.getElementById("vName").value = savedData.name || "";
    document.getElementById("vTitle").value = savedData.title || "";
    document.getElementById("vOrg").value = savedData.org || "";
    document.getElementById("vPhone").value = savedData.phone || "";
    document.getElementById("vWorkPhone").value = savedData.workPhone || ""; 
    document.getElementById("vEmail").value = savedData.email || "";
    document.getElementById("vWebsite").value = savedData.website || ""; 
    document.getElementById("vAddress").value = savedData.address || "";
    document.getElementById("vNote").value = savedData.note || ""; 

    if(savedData.name) {
      // DÜZELTME BURADA: 'true' yerine 'false' yaptık.
      // false = "Hafızaya dokunma, soru sorma, sadece sessizce QR'ı üret ve göster."
      setTimeout(() => generateQr(false), 100); 
    }
}

function closeQrGenerator() {
    document.getElementById("qrGeneratorContainer").style.display = "none";
}

// --- AKILLI QR OLUŞTURMA VE PAYLAŞMA ---
// --- MODERN ve GÜÇLÜ QR OLUŞTURMA (EasyQRCodeJS) ---
function generateQr(saveMode) {
    const qrContainer = document.getElementById("generatedQrCode");
    const shareContainer = document.getElementById("shareQrContainer");
    
    qrContainer.innerHTML = "";
    shareContainer.style.display = "none";
    
    // --- VERİ OKUMA ---
    const nameInput = document.getElementById("vName").value.trim();
    const title = document.getElementById("vTitle").value.trim();
    const org = document.getElementById("vOrg").value.trim();
    const phone = document.getElementById("vPhone").value.trim();
    const workPhone = document.getElementById("vWorkPhone").value.trim(); 
    const email = document.getElementById("vEmail").value.trim();
    const website = document.getElementById("vWebsite").value.trim(); 
    const address = document.getElementById("vAddress").value.trim();
    const note = document.getElementById("vNote").value.trim(); 

    if (!nameInput) { alert("Lütfen en azından bir isim girin."); return; }

    if (saveMode) {
        if (localStorage.getItem("myCardData")) {
            if (!confirm("⚠️ Eski kartvizit bilgilerinin üzerine yazılacak. Onaylıyor musun?")) return; 
        }
        const cardData = { name: nameInput, title, org, phone, workPhone, email, website, address, note };
        localStorage.setItem("myCardData", JSON.stringify(cardData));
    }

    // --- vCARD OLUŞTURMA (CRLF \r\n DESTEKLİ) ---
    // Samsung/Android için satır sonlarına \r ekledik.
    let vCard = `BEGIN:VCARD\r\nVERSION:3.0\r\n`;
    vCard += `N;CHARSET=UTF-8:${nameInput};;;\r\n`;
    vCard += `FN;CHARSET=UTF-8:${nameInput}\r\n`;
    
    if (org) vCard += `ORG;CHARSET=UTF-8:${org}\r\n`;
    if (title) vCard += `TITLE;CHARSET=UTF-8:${title}\r\n`;
    if (phone) vCard += `TEL;TYPE=CELL,VOICE:${phone}\r\n`;
    if (workPhone) vCard += `TEL;TYPE=WORK,VOICE:${workPhone}\r\n`; 
    if (email) vCard += `EMAIL:${email}\r\n`;
    if (website) vCard += `URL;CHARSET=UTF-8:${website}\r\n`; 
    if (address) vCard += `ADR;CHARSET=UTF-8:;;${address};;;;\r\n`;
    if (note) vCard += `NOTE;CHARSET=UTF-8:${note}\r\n`; 
    vCard += `END:VCARD\r\n`;

    // Global değişkene atıyoruz
    globalVCardData = vCard; 

    // --- QR AYARLARI ---
    try {
        const options = {
            text: vCard, 
            width: 256, height: 256,
            colorDark: "#000000", colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M,
            title: "Alptekin",
            titleFont: "bold 16px Arial",
            titleColor: "#000000",
            titleBackgroundColor: "#ffffff",
            titleHeight: 40, titleTop: 10,
            quietZone: 10, quietZoneColor: "rgba(0,0,0,0)"
        };

        new QRCode(qrContainer, options);

        setTimeout(() => {
            const img = qrContainer.querySelector("canvas") || qrContainer.querySelector("img");
            if (img) {
                img.style.width = "100%"; img.style.height = "auto";
                shareContainer.style.display = "flex"; 
            }
        }, 100);

    } catch (err) {
        console.error(err);
        alert("QR oluşturma hatası!");
    }
}

// --- YENİ: vCARD DOSYASI PAYLAŞMA FONKSİYONU ---
async function shareVCardFile() {
    if (!globalVCardData) { 
        showToast("⚠️ Henüz kartvizit oluşturulmadı."); 
        return; 
    }

    // 1. Dosya İsmi Hazırla
    let fileName = "kartvizit.vcf";
    const nameInput = document.getElementById("vName")?.value;
    if(nameInput) fileName = nameInput.replace(/[^a-zA-Z0-9]/g, "_") + ".vcf";

    // 2. Blob Oluştur (BOM YOK - iPhone bunu sever)
    // Standart UTF-8 vCard
    const blob = new Blob([globalVCardData], { type: "text/vcard" });
    
    // 3. Dosya Objesi
    const file = new File([blob], fileName, { type: "text/vcard" });

    // 4. Paylaşım Denemesi
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                title: 'Kartvizit',
                text: 'İletişim bilgilerim ektedir.',
                files: [file]
            });
            // Başarılı olursa buradan çıkar
        } catch (error) {
            // Kullanıcı bilerek iptal ettiyse (X'e bastıysa) dur.
            if (error.name === 'AbortError') return;

            // Hata aldıysa (S25 vb.) konsola yaz ve İNDİRMEYE GEÇ
            console.warn("Paylaşım başarısız, indirme deneniyor:", error);
            forceDownload(blob, fileName);
            showToast("⚠️ Paylaşım menüsü açılmadı, dosya indiriliyor...");
        }
    } else {
        // Tarayıcı paylaşımı hiç desteklemiyorsa direkt indir
        forceDownload(blob, fileName);
        showToast("📥 Dosya indirildi.");
    }
}

// --- ZORLA İNDİRME FONKSİYONU (En Basit ve Güvenli Yöntem) ---
function forceDownload(blob, fileName) {
    // Blob URL oluştur
    const url = window.URL.createObjectURL(blob);
    
    // Sanal link oluştur
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = fileName;
    
    // Mutlaka body'e ekle (Firefox ve Android için şart)
    document.body.appendChild(a);
    
    // Tıkla
    a.click();
    
    // Temizlik (Android'in dosyayı kapması için 2 saniye bekle)
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 2000);
}

// --- QR GÖRSELİ PAYLAŞMA ---
async function shareQrImage() {
    const qrContainer = document.getElementById("generatedQrCode");
    
    // EasyQRCodeJS genelde CANVAS üretir, eski kütüphane IMG üretirdi.
    const canvas = qrContainer.querySelector("canvas");
    const img = qrContainer.querySelector("img");
    
    let blob = null;

    if (canvas) {
        // Canvas varsa Blob'a çevir
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    } else if (img && img.src) {
        // Resim varsa (base64) Blob'a çevir
        try {
            const response = await fetch(img.src);
            blob = await response.blob();
        } catch (e) {
            console.error("Görsel dönüştürme hatası:", e);
        }
    }

    if (!blob) { 
        showToast("⚠️ QR kodu bulunamadı.");
        return; 
    }

    // Dosyayı hazırla
    const file = new File([blob], "kartvizit_qr.png", { type: "image/png" });

    // Paylaşmayı Dene
    try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: 'QR Kartvizit',
                text: 'QR kodum ektedir.',
                files: [file]
            });
        } else {
            // Desteklemiyorsa indir
            downloadFile(blob, "kartvizit_qr.png");
            showToast("📥 Görsel indirildi.");
        }
    } catch (error) {
        // Kullanıcı vazgeçtiyse (AbortError) hata verme, sessiz kal.
        if (error.name !== 'AbortError') {
             console.warn("Paylaşım hatası, indirme deneniyor...", error);
             downloadFile(blob, "kartvizit_qr.png");
             showToast("📥 Görsel indirildi.");
        }
    }
}

// --- GÜÇLENDİRİLMİŞ İNDİRME FONKSİYONU (Android Fix) ---
function downloadFile(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = fileName;
    
    document.body.appendChild(a);
    a.click();
    
    // ÇÖZÜM BURADA: Temizliği 100ms yerine 5000ms (5 saniye) sonra yapıyoruz.
    // Samsung'un indirme yöneticisinin dosyayı yakalaması için ona süre tanıyoruz.
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 5000);
}

// --- PROFESYONEL BİLDİRİM (TOAST) ---
function showToast(message) {
    const toast = document.getElementById("toast-notification");
    if (!toast) return; // Eğer HTML'e eklemediysen hata vermesin
    
    toast.textContent = message;
    toast.className = "show";
    
    // 3 saniye sonra kaybolsun
    setTimeout(() => { 
        toast.className = toast.className.replace("show", ""); 
    }, 3000);
}