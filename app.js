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

// --- BUTON OLAYLARI ---
startBtn.onclick = () => { serialMode = false; startScanner(); };
serialBtn.onclick = () => { serialMode = true; startScanner(); };
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
  lastScan = ""; lastScanTime = 0;
  zoomContainer.style.display = "none";

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:currentFacingMode } });
    video.srcObject = stream; track = stream.getVideoTracks()[0]; video.play();

    // Zoom
    setTimeout(() => {
      const caps = track.getCapabilities();
      if(caps.zoom){
        zoomContainer.style.display="block";
        zoomSlider.min=caps.zoom.min; zoomSlider.max=caps.zoom.max; zoomSlider.step=caps.zoom.step;
        zoomSlider.value=track.getSettings().zoom||1;
        zoomSlider.oninput=async e=>await track.applyConstraints({advanced:[{zoom:parseFloat(e.target.value)}]});
      }
    },500);

    scanLoop(); // Döngüyü başlat

  } catch(err){
    alert("Kamera açılamadı: "+err.message);
  }
}

// --- TARAMA DÖNGÜSÜ (scanArea bazlı) ---
async function scanLoop() {
  if(!scanning) return;
  requestAnimationFrame(scanLoop);

  if(!video.videoWidth || !video.videoHeight) return;

  const rect = scanArea.getBoundingClientRect();
  const vRect = video.getBoundingClientRect();

  // Videonun ölçek ve offset değerleri
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
        }
      }
    }
  } catch(e){
    // Okuyamazsa sessiz geç
  }
}

// --- YARDIMCI FONKSİYONLAR ---
function addResult(text,imageBase64=null){
  const div=document.createElement("div");
  if(isValidUrl(text)){
    const a=document.createElement("a"); a.href=text; a.target="_blank"; a.textContent=text; div.appendChild(a);
  } else div.textContent=text;

  const btnGroup=document.createElement("div"); btnGroup.style.display="flex"; btnGroup.style.gap="8px"; btnGroup.style.marginTop="10px"; btnGroup.style.flexWrap="wrap";

  if(imageBase64){
    const downloadBtn=document.createElement("button"); downloadBtn.innerHTML="📷 İndir"; downloadBtn.style.flex="1";
    downloadBtn.onclick=()=>{ const link=document.createElement("a"); link.href=imageBase64; link.download="tarama_"+Date.now()+".jpg"; link.click(); };
    btnGroup.appendChild(downloadBtn);
  }

  const copyBtn=document.createElement("button"); copyBtn.innerHTML="📋 Kopyala"; copyBtn.style.flex="1";
  copyBtn.onclick=async()=>{ try{ await navigator.clipboard.writeText(text); alert("Metin panoya kopyalandı!"); } catch{ alert("Kopyalama başarısız."); } };
  btnGroup.appendChild(copyBtn);

  div.appendChild(document.createElement("br")); div.appendChild(btnGroup);
  resultList.appendChild(div); resultList.scrollTop=resultList.scrollHeight;
}

function isValidUrl(string){ try{ new URL(string); return true; } catch{ return false; } }

async function toggleFlash(){ if(!track) return; const caps=track.getCapabilities(); if(!caps.torch){ alert("Flash desteklenmiyor."); return; } torchOn=!torchOn; await track.applyConstraints({advanced:[{torch:torchOn}]}); }

function stopCamera(){ scanning=false; torchOn=false; zoomContainer.style.display="none"; stream?.getTracks().forEach(t=>t.stop()); }
