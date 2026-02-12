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
        './qrcode.min.js',
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
// saveMode: true ise hafızaya kaydeder, false ise sadece QR üretir
function generateQr(saveMode) {
    const qrContainer = document.getElementById("generatedQrCode");
    const shareContainer = document.getElementById("shareQrContainer");
    
    // Eski QR objesini temizle
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

    if (!nameInput) { 
        alert("Lütfen en azından bir isim girin."); 
        return; 
    }

    // --- KAYIT MODU ---
    if (saveMode) {
        if (localStorage.getItem("myCardData")) {
            const onay = confirm("⚠️ DİKKAT!\n\nEski kartvizit bilgilerinizin üzerine yazılacak.\nBunu onaylıyor musunuz?");
            if (!onay) return; 
        }
        const cardData = { name: nameInput, title, org, phone, workPhone, email, website, address, note };
        localStorage.setItem("myCardData", JSON.stringify(cardData));
    }

    // --- vCARD OLUŞTURMA (UTF-8 Destekli) ---
    let vCard = `BEGIN:VCARD\nVERSION:3.0\n`;
    vCard += `N;CHARSET=UTF-8:${nameInput};;;\n`;
    vCard += `FN;CHARSET=UTF-8:${nameInput}\n`;
    if (org) vCard += `ORG;CHARSET=UTF-8:${org}\n`;
    if (title) vCard += `TITLE;CHARSET=UTF-8:${title}\n`;
    if (phone) vCard += `TEL;TYPE=CELL,VOICE:${phone}\n`;
    if (workPhone) vCard += `TEL;TYPE=WORK,VOICE:${workPhone}\n`; 
    if (email) vCard += `EMAIL:${email}\n`;
    if (website) vCard += `URL;CHARSET=UTF-8:${website}\n`; 
    if (address) vCard += `ADR;CHARSET=UTF-8:;;${address};;;;\n`;
    if (note) vCard += `NOTE;CHARSET=UTF-8:${note}\n`; 
    vCard += `END:VCARD`;

    // --- YARDIMCI FONKSİYONLAR ---
    function getInitials(fullName) {
        if (!fullName) return "";
        const names = fullName.split(" ").filter(n => n.length > 0);
        let initials = names[0].charAt(0).toLowerCase(); // İlk harf küçük
        if (names.length > 1) {
            initials += names[names.length - 1].charAt(0).toUpperCase(); // Soyad büyük
        } else {
             initials = initials.toUpperCase(); // Tek isimse büyük olsun
        }
        return initials;
    }

    // UTF-8 Dönüşüm Fonksiyonu (Kritik Nokta)
    function toUtf8(str) {
        try {
            return unescape(encodeURIComponent(str));
        } catch (e) {
            console.error("UTF-8 dönüşüm hatası:", e);
            return str; // Hata olursa ham halini dene
        }
    }

    // QR Kalite Seviyeleri (Yüksekten Düşüğe)
    const levels = [QRCode.CorrectLevel.H, QRCode.CorrectLevel.Q, QRCode.CorrectLevel.M, QRCode.CorrectLevel.L];

    // --- RECURSIVE QR OLUŞTURMA ---
    function tryGenerateLevel(index) {
        // Eğer tüm seviyeleri denedik ve olmadıysa dur.
        if (index >= levels.length) {
            console.error("Tüm seviyeler denendi, başarısız.");
            alert("QR Kod oluşturulamadı! İçerik çok uzun veya desteklenmeyen karakter var.");
            qrContainer.innerHTML = "<p style='color:red'>Hata!</p>";
            return;
        }

        try {
            // Önce temizle
            qrContainer.innerHTML = "";

            // QR Oluştur (Try-Catch içinde olması çok önemli)
            new QRCode(qrContainer, {
                text: toUtf8(vCard), // "ı" harfi burada işleniyor
                width: 256, 
                height: 256,
                colorDark: "#000000", 
                colorLight: "#ffffff",
                correctLevel: levels[index]
            });

            // Başarılı olup olmadığını kontrol etmek için kısa bir gecikme
            setTimeout(() => {
                const img = qrContainer.querySelector("img");
                
                // Eğer resim oluştuysa ve src'si varsa (base64 dolduysa)
                if (img && img.src && img.src.length > 100) {
                    img.style.width = "100%"; 
                    img.style.height = "100%";
                    
                    // -- GÖRSEL SÜSLEMELER --
                    // 1. İmza
                    const signature = document.createElement("div");
                    signature.className = "qr-signature";
                    signature.innerText = "Alptekin";
                    qrContainer.appendChild(signature);

                    // 2. Logo (Sadece H seviyesinde ve yer varsa)
                    if (levels[index] === QRCode.CorrectLevel.H) {
                        const initials = getInitials(nameInput);
                        if (initials) {
                            const overlay = document.createElement("div");
                            overlay.className = "qr-initials-overlay";
                            overlay.innerText = initials;
                            qrContainer.appendChild(overlay);
                        }
                    }

                    // Paylaş butonunu göster
                    shareContainer.style.display = "flex";
                } else {
                    // Resim etiketi var ama içi boşsa, bir alt seviyeye geç
                    console.warn(`Seviye ${index} görsel oluşturamadı, düşürülüyor...`);
                    tryGenerateLevel(index + 1);
                }
            }, 50);

        } catch (e) {
            // Kütüphane hata fırlatırsa yakala ve seviye düşür
            console.warn(`Seviye ${index} hatası:`, e);
            tryGenerateLevel(index + 1);
        }
    }

    // Başlat
    tryGenerateLevel(0);
}

async function shareQrImage() {
    const qrContainer = document.getElementById("generatedQrCode");
    const img = qrContainer.querySelector("img"); 

    if (!img || !img.src) { alert("QR kodu henüz oluşmadı."); return; }

    try {
        const blob = await (await fetch(img.src)).blob();
        const file = new File([blob], "kartvizit_qr.png", { type: "image/png" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: 'QR Kartvizit',
                text: 'İletişim bilgilerim ektedir.',
                files: [file]
            });
        } else {
            alert("Cihazınız görsel paylaşımını desteklemiyor.");
        }
    } catch (error) {
        console.log("Paylaşım hatası:", error);
    }
}