// --- ELEMENTLER ---
const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const serialBtn = document.getElementById("serialBtn");
const ocrBtn = document.getElementById("ocrBtn");
const switchBtn = document.getElementById("switchBtn"); 
const flashBtn = document.getElementById("flashBtn");
const clearBtn = document.getElementById("clearBtn"); // YENİ: Temizle butonu tanımlandı
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
let cropper;

// --- DEĞİŞKENLER ---
let stream, track;
let scanning = false;
let serialMode = false;
let lastScan = "";
let lastScanTime = 0;
const scanCooldown = 1000; // 1 saniye
let torchOn = false;
let currentFacingMode = "environment"; 

let scanCanvas = document.createElement("canvas");
let scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });

const beep = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
const codeReader = new ZXing.BrowserMultiFormatReader();

// --- BUTON OLAYLARI ---
startBtn.onclick = () => { serialMode = false; startScanner(); };
serialBtn.onclick = () => { serialMode = true; startScanner(); };
flashBtn.onclick = toggleFlash;

// YENİ: Listeyi Temizleme İşlemi
clearBtn.onclick = () => {
  resultList.innerHTML = "";
  lastScan = ""; // Temizleyince aynı barkodu tekrar okuyabilmesi için sıfırlandı
};

switchBtn.onclick = () => {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  if (scanning) startScanner();
};

ocrBtn.onclick = () => {
  stopCamera();
  ocrInput.click();
};

// --- OCR VE KIRPMA LOGİĞİ ---
ocrInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    imageToCrop.src = event.target.result;
    cropContainer.style.display = 'flex';

    if (cropper) cropper.destroy();

    cropper = new Cropper(imageToCrop, {
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 0.8,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
    });
  };
  reader.readAsDataURL(file);
  ocrInput.value = ""; 
});

cancelCropBtn.addEventListener('click', () => {
  cropContainer.style.display = 'none';
  if (cropper) cropper.destroy();
});

doCropBtn.addEventListener('click', () => {
  if (!cropper) return;

  cropContainer.style.display = 'none';
  addResult("Kırpılan alan işleniyor... (Maksimum kalite)");

  const croppedCanvas = cropper.getCroppedCanvas({
    maxWidth: 2048,
    maxHeight: 2048,
    imageSmoothingQuality: 'high'
  });
  
  const base64ImageToSave = croppedCanvas.toDataURL('image/jpeg', 0.95);

  croppedCanvas.toBlob(async (blob) => {
    cropper.destroy();

    try {
      const result = await Tesseract.recognize(blob, 'tur', {
          logger: m => console.log(m),
          workerPath: './worker.min.js',
          corePath: './tesseract-core.wasm.js',
          langPath: './'
      });

      const extractedText = result.data.text.trim();
      if (extractedText) {
        addResult("--- OCR SONUCU ---\n" + extractedText, base64ImageToSave); 
        beep.play().catch(() => {});
        navigator.vibrate?.(100);
      } else {
        addResult("Metin tespit edilemedi veya resim çok bulanık.");
      }
    } catch (err) {
      addResult("OCR Hatası: " + err.message);
    }
  }, 'image/jpeg', 0.95);
});

// --- KAMERA TARAYICI --- 
async function startScanner() {
  if (scanning) stopCamera(); 

  lastScan = "";
  lastScanTime = 0;
  zoomContainer.style.display = "none"; 

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: currentFacingMode, 
        advanced: [{ focusMode: "continuous" }],
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    video.srcObject = stream;
    track = stream.getVideoTracks()[0];
    scanning = true;

    setTimeout(() => {
        const capabilities = track.getCapabilities();
        if (capabilities.zoom) {
            zoomContainer.style.display = "block";
            zoomSlider.min = capabilities.zoom.min;
            zoomSlider.max = capabilities.zoom.max;
            zoomSlider.step = capabilities.zoom.step;
            zoomSlider.value = track.getSettings().zoom || 1;
            
            zoomSlider.oninput = async (e) => {
                await track.applyConstraints({ advanced: [{ zoom: parseFloat(e.target.value) }] });
            };
        }
    }, 500); 

    video.onloadedmetadata = () => {
      video.play();
      scanLoop();
    };
  } catch (err) {
    alert("Kamera açılamadı: " + err.message);
  }
}

// Tarama döngüsü
async function scanLoop() {
  if (!scanning) return;

  await new Promise(r => setTimeout(r, 1000 / 12)); 

  const rect = scanArea.getBoundingClientRect();
  const vRect = video.getBoundingClientRect();

  if (!video.videoWidth || !video.videoHeight) {
    requestAnimationFrame(scanLoop);
    return;
  }

  const scaleX = video.videoWidth / vRect.width;
  const scaleY = video.videoHeight / vRect.height;
  const sx = (rect.left - vRect.left) * scaleX;
  const sy = (rect.top - vRect.top) * scaleY;
  const sw = rect.width * scaleX;
  const sh = rect.height * scaleY;

  scanCanvas.width = sw;
  scanCanvas.height = sh;

  scanCtx.filter = "contrast(150%) brightness(120%) grayscale(100%)";
  scanCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
  scanCtx.filter = "none"; 

  try {
    const result = await codeReader.decodeFromCanvas(scanCanvas);
    if (result) {
      const value = result.text || result.getText();
      const currentImageBase64 = scanCanvas.toDataURL("image/jpeg", 0.9); 

      if (serialMode) {
        const now = Date.now();
        if (now - lastScanTime > scanCooldown) {
          addResult(value, currentImageBase64);
          beep.play().catch(() => {});
          navigator.vibrate?.(100);
          lastScanTime = now;
        }
      } else {
        if (value !== lastScan) {
          addResult(value, currentImageBase64);
          beep.play().catch(() => {});
          navigator.vibrate?.(100);
          lastScan = value;
          // YENİ: Okuyup okuyup listeye atmaya devam etmesi için stopCamera() kaldırıldı
        }
      }
    }
  } catch (e) {
    // NotFoundException ignore
  }

  requestAnimationFrame(scanLoop);
}

// --- YARDIMCI FONKSİYONLAR ---
function addResult(text, imageBase64 = null) {
  const div = document.createElement("div");

  if (isValidUrl(text)) {
    const a = document.createElement("a");
    a.href = text;
    a.target = "_blank";
    a.textContent = text;
    div.appendChild(a);
  } else {
    div.textContent = text;
  }

  const btnGroup = document.createElement("div");
  btnGroup.style.display = "flex";
  btnGroup.style.gap = "8px"; 
  btnGroup.style.marginTop = "10px";
  btnGroup.style.flexWrap = "wrap"; 

  if (imageBase64) {
      const downloadBtn = document.createElement("button");
      downloadBtn.innerHTML = "📷 İndir";
      downloadBtn.className = "secondary";
      downloadBtn.style.padding = "8px 12px";
      downloadBtn.style.fontSize = "13px";
      downloadBtn.style.flex = "1";
      
      downloadBtn.onclick = () => {
          const link = document.createElement("a");
          link.href = imageBase64;
          link.download = "tarama_" + Date.now() + ".jpg";
          link.click();
      };
      btnGroup.appendChild(downloadBtn);
  }

  const copyBtn = document.createElement("button");
  copyBtn.innerHTML = "📋 Kopyala";
  copyBtn.className = "secondary";
  copyBtn.style.padding = "8px 12px";
  copyBtn.style.fontSize = "13px";
  copyBtn.style.flex = "1";
  
  copyBtn.onclick = async () => {
      try {
          await navigator.clipboard.writeText(text);
          alert("Metin panoya kopyalandı!");
      } catch (err) {
          alert("Kopyalama başarısız oldu.");
      }
  };
  btnGroup.appendChild(copyBtn);

  if (navigator.share) { 
      const shareBtn = document.createElement("button");
      shareBtn.innerHTML = "📤 Paylaş";
      shareBtn.className = "secondary";
      shareBtn.style.padding = "8px 12px";
      shareBtn.style.fontSize = "13px";
      shareBtn.style.flex = "1";
      
      shareBtn.onclick = async () => {
          try {
              await navigator.share({
                  title: 'Tarama Sonucu',
                  text: text
              });
          } catch (err) {
              console.log("Paylaşım iptal edildi veya hata:", err);
          }
      };
      btnGroup.appendChild(shareBtn);
  }

  div.appendChild(document.createElement("br"));
  div.appendChild(btnGroup);

  resultList.appendChild(div);
  resultList.scrollTop = resultList.scrollHeight; 
}

function isValidUrl(string) {
  try { new URL(string); return true; }
  catch (_) { return false; }
}

async function toggleFlash() {
  if (!track) return;

  const capabilities = track.getCapabilities();
  if (!capabilities.torch) {
    alert("Flash desteklenmiyor.");
    return;
  }

  torchOn = !torchOn;
  await track.applyConstraints({ advanced: [{ torch: torchOn }] });
}

function stopCamera() {
  scanning = false;
  torchOn = false;
  zoomContainer.style.display = "none"; 
  stream?.getTracks().forEach(t => t.stop());
}