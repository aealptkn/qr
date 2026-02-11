const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const serialBtn = document.getElementById("serialBtn");
const ocrBtn = document.getElementById("ocrBtn");
const switchBtn = document.getElementById("switchBtn");
const flashBtn = document.getElementById("flashBtn");
const clearBtn = document.getElementById("clearBtn");
const resultList = document.getElementById("resultList");
const copyAllBtn = document.getElementById("copyAllBtn");
const shareBtn = document.getElementById("shareBtn");
const ocrInput = document.getElementById("ocrInput");

let stream, track;
let scanning = false;
let serialMode = false;
let lastScan = "";
let lastScanTime = 0;
let torchOn = false;
let currentFacingMode = "environment";

const codeReader = new ZXing.BrowserMultiFormatReader();
const beep = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");

/* ---- BUTONLAR ---- */

startBtn.onclick = () => { serialMode=false; startScanner(); };
serialBtn.onclick = () => { serialMode=true; startScanner(); };
switchBtn.onclick = () => { currentFacingMode = currentFacingMode==="environment"?"user":"environment"; startScanner(); };
clearBtn.onclick = () => resultList.innerHTML="";
flashBtn.onclick = toggleFlash;
ocrBtn.onclick = ()=> ocrInput.click();

/* ---- TARAMA ---- */

async function startScanner(){

  stopCamera();
  scanning=true;
  lastScan="";
  lastScanTime=0;

  try{
    stream = await navigator.mediaDevices.getUserMedia({
      video:{
        facingMode:currentFacingMode,
        width:{ideal:1280},
        height:{ideal:720}
      }
    });

    video.srcObject=stream;
    track=stream.getVideoTracks()[0];
    await video.play();

    codeReader.reset();

    codeReader.decodeFromVideoElementContinuously(video,(result,err)=>{

      if(!scanning) return;

      if(result){
        const text=result.getText();
        const now=Date.now();

        if(serialMode){
          if(now-lastScanTime>800){
            addResult(text);
            beep.play().catch(()=>{});
            navigator.vibrate?.(80);
            lastScanTime=now;
          }
        }else{
          if(text!==lastScan){
            addResult(text);
            beep.play().catch(()=>{});
            navigator.vibrate?.(80);
            lastScan=text;
          }
        }
      }

    });

  }catch(e){
    alert("Kamera açılamadı: "+e.message);
  }
}

function stopCamera(){
  scanning=false;
  codeReader.reset();
  stream?.getTracks().forEach(t=>t.stop());
}

/* ---- SONUÇ EKLE ---- */

function addResult(text){
  const div=document.createElement("div");
  div.textContent=text;
  resultList.appendChild(div);
  resultList.scrollTop=resultList.scrollHeight;
}

/* ---- FLASH ---- */

async function toggleFlash(){
  if(!track) return;
  const caps=track.getCapabilities();
  if(!caps.torch){ alert("Flash desteklenmiyor"); return;}
  torchOn=!torchOn;
  await track.applyConstraints({advanced:[{torch:torchOn}]});
}

/* ---- TÜMÜNÜ KOPYALA ---- */

copyAllBtn.onclick=async ()=>{
  const text=[...resultList.children].map(d=>d.textContent).join("\n");
  if(!text) return alert("Liste boş");
  await navigator.clipboard.writeText(text);
  alert("Liste kopyalandı");
};

/* ---- PAYLAŞ ---- */

shareBtn.onclick=async ()=>{
  const text=[...resultList.children].map(d=>d.textContent).join("\n");
  if(!text) return alert("Liste boş");

  if(navigator.share){
    await navigator.share({text});
  }else{
    alert("Paylaşım desteklenmiyor");
  }
};

/* ---- OCR ---- */

ocrInput.addEventListener("change",async e=>{
  const file=e.target.files[0];
  if(!file) return;

  const { data:{ text } } = await Tesseract.recognize(file,"tur");
  if(text.trim()){
    addResult(text.trim());
  }else{
    alert("Metin bulunamadı");
  }
});
