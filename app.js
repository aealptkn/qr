const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const serialBtn = document.getElementById("serialBtn");
const switchBtn = document.getElementById("switchBtn");
const flashBtn = document.getElementById("flashBtn");
const clearBtn = document.getElementById("clearBtn");
const resultList = document.getElementById("resultList");
const copyAllBtn = document.getElementById("copyAllBtn");
const shareBtn = document.getElementById("shareBtn");

let codeReader = new ZXing.BrowserMultiFormatReader();
let currentDeviceId = null;
let currentStream = null;
let serialMode = false;
let lastScan = "";
let lastScanTime = 0;
let torchOn = false;

const beep = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");

/* --- BAŞLAT --- */

startBtn.onclick = () => {
  serialMode = false;
  startScanner();
};

serialBtn.onclick = () => {
  serialMode = true;
  startScanner();
};

clearBtn.onclick = () => resultList.innerHTML = "";

/* --- KAMERA LİSTELE --- */

async function startScanner(){

  stopScanner();

  try{
    const devices = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();

    if(devices.length === 0){
      alert("Kamera bulunamadı");
      return;
    }

    currentDeviceId = devices[devices.length - 1].deviceId; // genelde arka kamera

    codeReader.decodeFromVideoDevice(
      currentDeviceId,
      video,
      (result, err) => {

        if(result){
          const text = result.getText();
          const now = Date.now();

          if(serialMode){
            if(now - lastScanTime > 800){
              addResult(text);
              lastScanTime = now;
            }
          } else {
            if(text !== lastScan){
              addResult(text);
              lastScan = text;
            }
          }

          beep.play().catch(()=>{});
          navigator.vibrate?.(80);
        }

      }
    );

  }catch(err){
    alert("Kamera hatası: " + err);
  }
}

/* --- DURDUR --- */

function stopScanner(){
  codeReader.reset();
}

/* --- SONUÇ EKLE --- */

function addResult(text){
  const div = document.createElement("div");
  div.textContent = text;
  resultList.appendChild(div);
  resultList.scrollTop = resultList.scrollHeight;
}

/* --- KOPYALA --- */

copyAllBtn.onclick = async () => {
  const text = [...resultList.children].map(d=>d.textContent).join("\n");
  if(!text) return alert("Liste boş");
  await navigator.clipboard.writeText(text);
  alert("Kopyalandı");
};

/* --- PAYLAŞ --- */

shareBtn.onclick = async () => {
  const text = [...resultList.children].map(d=>d.textContent).join("\n");
  if(!text) return alert("Liste boş");

  if(navigator.share){
    await navigator.share({ text });
  }else{
    alert("Paylaşım desteklenmiyor");
  }
};

/* --- FLASH --- */

flashBtn.onclick = async () => {
  const track = video.srcObject?.getVideoTracks()[0];
  if(!track) return;

  const caps = track.getCapabilities();
  if(!caps.torch){
    alert("Flash desteklenmiyor");
    return;
  }

  torchOn = !torchOn;
  await track.applyConstraints({ advanced:[{ torch: torchOn }] });
};

/* --- KAMERA ÇEVİR --- */

switchBtn.onclick = async () => {

  const devices = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
  if(devices.length < 2) return;

  currentDeviceId =
    devices.find(d => d.deviceId !== currentDeviceId)?.deviceId;

  startScanner();
};
