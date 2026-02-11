// --- ELEMENTLER ---
const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const serialBtn = document.getElementById("serialBtn");
const ocrBtn = document.getElementById("ocrBtn");
const switchBtn = document.getElementById("switchBtn"); 
const flashBtn = document.getElementById("flashBtn");
const clearBtn = document.getElementById("clearBtn");
const resultList = document.getElementById("resultList");
const scanArea = document.getElementById("scanArea");
const ocrInput = document.getElementById("ocrInput");
const zoomContainer = document.getElementById("zoomContainer"); 
const zoomSlider = document.getElementById("zoomSlider"); 

// --- KIRPMA ELEMENTLERİ ---
const cropContainer = document.getElementById('cropContainer');
const imageToCrop = document.getElementById('imageToCrop');
const doCropBtn = document.getElementById('doCropBtn');
const cancelCropBtn = document.getElementById('cancelCropBtn');
const rotateCropBtn = document.getElementById('rotateCropBtn'); // YENİ EKLENEN BUTON
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

// --- CANVAS TARAMA ---
const scanCanvas = document.createElement("canvas");
const scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });

// --- BUTON OLAYLARI (Aç/Kapat Toggle Mantığı) ---
startBtn.onclick = () => { 
  if (scanning && !serialMode) { stopCamera(); return; } // Açıksa Kapatır
  serialMode = false; 
  startScanner(); 
};

serialBtn.onclick = () => { 
  if (scanning && serialMode) { stopCamera(); return; } // Açıksa Kapatır
  serialMode = true; 
  startScanner(); 
};

flashBtn.onclick = toggleFlash;
// LİSTEYİ SADECE TEMİZLE BUTONU SİLER
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

// Resim Döndürme
if (rotateCropBtn) {
    rotateCropBtn.addEventListener('click', () => {
      if(cropper) cropper.rotate(90);
    });
}

doCropBtn.addEventListener('click', async () => {
  if(!cropper) return;
  cropContainer.style.display = 'none';
  addResult("Kırpılan alan işleniyor..."); 
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
      if(text) addResult("--- OCR SONUCU ---\n"+text);
      else addResult("Metin tespit edilemedi.");
      beep.play().catch(()=>{}); navigator.vibrate?.(100);
    } catch(err) {
      addResult("OCR Hatası: "+err.message);
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
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:currentFacingMode } });
    video.srcObject = stream; track = stream.getVideoTracks()[0]; video.play();

    setTimeout(() => {
      const caps = track.getCapabilities();
      if(caps.zoom){
        zoomContainer.style.display="block";
        zoomSlider.min=caps.zoom.min; zoomSlider.max=caps.zoom.max; zoomSlider.step=caps.zoom.step;
        zoomSlider.value=track.getSettings().zoom||1;
        zoomSlider.oninput=async e=>await track.applyConstraints({advanced:[{zoom:parseFloat(e.target.value)}]});
      }
    },500);

    scanLoop(); 

  } catch(err){
    alert("Kamera açılamadı: "+err.message);
  }
}

// --- TARAMA DÖNGÜSÜ (Senin Çalışan Formülün) ---
async function scanLoop() {
  if(!scanning) return;
  requestAnimationFrame(scanLoop);

  if(!video.videoWidth || !video.videoHeight) return;

  const rect = scanArea.getBoundingClientRect();
  const vRect = video.getBoundingClientRect();

  const scale = Math.max(vRect.width / video.videoWidth, vRect.height / video.videoHeight);
  const offsetX = (vRect.width - video.videoWidth * scale)/2;
  const offsetY = (vRect.height - video.videoHeight * scale)/2;

  const boxX = rect.left - vRect.left;
  const boxY = rect.top - vRect.top;

  const nativeX = (boxX - offsetX)/scale;
  const nativeY = (boxY - offsetY)/scale;
  const nativeWidth = rect.width/scale;
  const nativeHeight = rect.height/scale;

  scanCanvas.width = nativeWidth;
  scanCanvas.height = nativeHeight;

  scanCtx.drawImage(video, nativeX, nativeY, nativeWidth, nativeHeight, 0, 0, nativeWidth, nativeHeight);

  try {
    const result = await codeReader.decodeFromCanvas(scanCanvas);
    if(result){
      const value = result.text || result.getText();
      const currentImageBase64 = scanCanvas.toDataURL("image/jpeg",0.9);

      if(serialMode){
        const now = Date.now();
        if(now - lastScanTime > scanCooldown){
          addResult(value, currentImageBase64);
          beep.play().catch(()=>{}); navigator.vibrate?.(100);
          lastScanTime = now;
        }
      } else {
        if(value !== lastScan){
          addResult(value, currentImageBase64);
          beep.play().catch(()=>{}); navigator.vibrate?.(100);
          lastScan = value;
          stopCamera(); // Tekli taramada kodu bulduğunda hemen kamerayı kapatır
        }
      }
    }
  } catch(e){
    // Okuyamazsa sessiz geç
  }
}

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

  // Kopyala ve Paylaş Butonları En Sona İtiliyor
  let globalControls = document.getElementById("globalControls");
  if (!globalControls) {
      globalControls = document.createElement("div");
      globalControls.id = "globalControls";
      globalControls.style.display = "flex";
      globalControls.style.gap = "10px";
      globalControls.style.marginTop = "15px";
      globalControls.style.padding = "10px 0";

      const copyBtn = document.createElement("button");
      copyBtn.innerHTML = "📋 Tümünü Kopyala";
      copyBtn.style.flex = "1";
      copyBtn.style.padding = "12px";
      copyBtn.style.backgroundColor = "#3a3a3c";
      copyBtn.style.color = "white";
      copyBtn.style.border = "none";
      copyBtn.style.borderRadius = "8px";
      copyBtn.onclick = async () => {
          const texts = Array.from(document.querySelectorAll('.scanned-text')).map(el => el.textContent).join('\n\n');
          if(!texts) return;
          try { await navigator.clipboard.writeText(texts); alert("Tüm liste kopyalandı!"); } 
          catch { alert("Kopyalama başarısız."); }
      };
      globalControls.appendChild(copyBtn);

      if (navigator.share) {
          const shareBtn = document.createElement("button");
          shareBtn.innerHTML = "📤 Tümünü Paylaş";
          shareBtn.style.flex = "1";
          shareBtn.style.padding = "12px";
          shareBtn.style.backgroundColor = "#0a84ff";
          shareBtn.style.color = "white";
          shareBtn.style.border = "none";
          shareBtn.style.borderRadius = "8px";
          shareBtn.onclick = async () => {
              const texts = Array.from(document.querySelectorAll('.scanned-text')).map(el => el.textContent).join('\n\n');
              if(!texts) return;
              try { await navigator.share({ title: 'Tarama Sonuçları', text: texts }); } 
              catch (err) { console.log("Paylaşım iptal edildi:", err); }
          };
          globalControls.appendChild(shareBtn);
      }
  }
  
  resultList.appendChild(globalControls);
  resultList.scrollTop = resultList.scrollHeight;
}

function isValidUrl(string){ try{ new URL(string); return true; } catch{ return false; } }

async function toggleFlash(){ if(!track) return; const caps=track.getCapabilities(); if(!caps.torch){ alert("Flash desteklenmiyor."); return; } torchOn=!torchOn; await track.applyConstraints({advanced:[{torch:torchOn}]}); }

function stopCamera(){ scanning=false; torchOn=false; zoomContainer.style.display="none"; stream?.getTracks().forEach(t=>t.stop()); }