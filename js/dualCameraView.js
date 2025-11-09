// Full-feature DualCameraView: ports index.html's dual-camera logic into a class
// Provides UI (calibration + draw keyboard area), camera selection, MediaPipe hands,
// press detection (side camera), position tracking (top camera), and a small synth for audible feedback.

class DualCameraView {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.videoTop = null;
    this.videoSide = null;
    this.canvasTop = null;
    this.canvasSide = null;
    this.drawCanvas = null;
    this.ctxTop = null;
    this.ctxSide = null;
    this.drawCtx = null;
    this.handsTop = null;
    this.handsSide = null;
    this.streamTop = null;
    this.streamSide = null;
    this.camerasReady = false;
    this.animationId = null;
    this.cameraDeviceIds = [];
    this.captureBaselineNow = false;
    this.calibrationComplete = false;
    this.drawingComplete = false;
    this.keyboardArea = null;
    this.isDrawing = false;
    this.drawStart = null;
    this.keyPressAnimations = new Map();
    this.onCalibrated = options.onCalibrated || function(){};

    // internal detector & synth
    this.detector = new DualCameraPressDetector();
    this.synth = new PianoSynth();
  }

  createDOM() {
    // build a richer PIP container with calibration/draw modals and two camera canvases
    const container = document.createElement('div');
    container.id = 'dualCameraPIP';
    container.style.cssText = `position: fixed; bottom: 40px; right: 18px; width: 680px; height: 420px; background: rgba(6,6,6,0.95); border-radius: 10px; overflow: visible; z-index: 3000; box-shadow: 0 10px 40px rgba(0,0,0,0.7); padding: 10px;`;

    // header
    const header = document.createElement('div');
    header.style.cssText = 'color:#e6fffa; font-weight:700; font-size:14px; margin-bottom:6px';
    header.innerText = 'Dual Camera Teacher (TOP = position, SIDE = press)';
    container.appendChild(header);

    // two canvases side-by-side
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; gap:8px; height:300px;';

    const topWrap = document.createElement('div');
    topWrap.style.cssText = 'flex:1; position:relative; background:#000; border-radius:6px; overflow:hidden;';
    const topLabel = document.createElement('div'); topLabel.innerText = 'TOP CAMERA'; topLabel.style.cssText = 'position:absolute; top:6px; left:6px; background:#064e3b; color:#a7f3d0; padding:4px 8px; border-radius:4px; z-index:20; font-size:12px;';
    topWrap.appendChild(topLabel);
    const canvasTop = document.createElement('canvas'); canvasTop.id = 'pipOutputTop'; canvasTop.style.cssText = 'width:100%; height:100%; display:block;';
    const videoTop = document.createElement('video'); videoTop.id = 'pipVideoTop'; videoTop.style.display = 'none'; videoTop.playsInline = true; videoTop.autoplay = true;
    topWrap.appendChild(canvasTop); topWrap.appendChild(videoTop);

    const sideWrap = document.createElement('div');
    sideWrap.style.cssText = 'width:320px; position:relative; background:#000; border-radius:6px; overflow:hidden;';
    const sideLabel = document.createElement('div'); sideLabel.innerText = 'SIDE CAMERA'; sideLabel.style.cssText = 'position:absolute; top:6px; left:6px; background:#4c1d95; color:#f0abfc; padding:4px 8px; border-radius:4px; z-index:20; font-size:12px;';
    sideWrap.appendChild(sideLabel);
    const deskY = document.createElement('div'); deskY.id = 'pipDeskY'; deskY.innerText = 'Desk Y: Not set'; deskY.style.cssText = 'position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.5); color:#fde68a; padding:4px 6px; border-radius:4px; z-index:20; font-size:12px;';
    sideWrap.appendChild(deskY);
    const canvasSide = document.createElement('canvas'); canvasSide.id = 'pipOutputSide'; canvasSide.style.cssText = 'width:100%; height:100%; display:block;';
    const videoSide = document.createElement('video'); videoSide.id = 'pipVideoSide'; videoSide.style.display = 'none'; videoSide.playsInline = true; videoSide.autoplay = true;
    sideWrap.appendChild(canvasSide); sideWrap.appendChild(videoSide);

    wrapper.appendChild(topWrap); wrapper.appendChild(sideWrap);
    container.appendChild(wrapper);

    // buttons row
    const controls = document.createElement('div'); controls.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
    const calibrateBtn = document.createElement('button'); calibrateBtn.innerText = 'Calibrate'; calibrateBtn.style.cssText = 'flex:0 0 auto; padding:6px 12px; background:#059669; color:white; border-radius:6px;';
    calibrateBtn.addEventListener('click', ()=> this.startCalibration());
    const drawBtn = document.createElement('button'); drawBtn.innerText = 'Draw Keyboard'; drawBtn.style.cssText = 'flex:0 0 auto; padding:6px 12px; background:#2563eb; color:white; border-radius:6px;';
    drawBtn.addEventListener('click', ()=> this.openDrawModal());
    const stopBtn = document.createElement('button'); stopBtn.innerText = 'Stop'; stopBtn.style.cssText = 'flex:0 0 auto; padding:6px 12px; background:#ef4444; color:white; border-radius:6px;';
    stopBtn.addEventListener('click', ()=> this.stop());
    controls.appendChild(calibrateBtn); controls.appendChild(drawBtn); controls.appendChild(stopBtn);
    container.appendChild(controls);

    // hidden draw canvas overlay used when drawing keyboard area
    const drawCanvas = document.createElement('canvas'); drawCanvas.id = 'pipDrawCanvas'; drawCanvas.style.cssText = 'position:absolute; left:0; top:40px; width:calc(100% - 20px); height:300px; display:none; z-index:4000;';
    container.appendChild(drawCanvas);

    document.body.appendChild(container);

    // wire refs
    this.container = container;
    this.canvasTop = canvasTop; this.canvasSide = canvasSide; this.drawCanvas = drawCanvas;
    this.videoTop = videoTop; this.videoSide = videoSide;
    this.ctxTop = canvasTop.getContext('2d'); this.ctxSide = canvasSide.getContext('2d'); this.drawCtx = drawCanvas.getContext('2d');

    // attach small state displays
    this.deskYDisplay = deskY;
    this.topHandsCountEl = null; // optional
  }

  async start() {
    if (!this.container) this.createDOM();
    try {
      await this.initCameras();
      this.initMediaPipe();
      this.processFrames();
    } catch (e) {
      console.error('DualCameraView start error:', e);
    }
  }

  async stop() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.handsTop) this.handsTop.close && this.handsTop.close();
    if (this.handsSide) this.handsSide.close && this.handsSide.close();
    if (this.streamTop) this.streamTop.getTracks().forEach(t=>t.stop());
    if (this.streamSide) this.streamSide.getTracks().forEach(t=>t.stop());
    if (this.container && this.container.parentElement) this.container.remove();
    this.container = null;
    this.camerasReady = false;
  }

  async initCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      const nonFaceTime = videoInputs.filter(d => !d.label.includes('FaceTime'));
      let selected = [];
      if (nonFaceTime.length >= 2) selected = [nonFaceTime[0].deviceId, nonFaceTime[1].deviceId];
      else if (nonFaceTime.length === 1 && videoInputs.length > 1) selected = [nonFaceTime[0].deviceId, videoInputs.find(d=>d.deviceId!==nonFaceTime[0].deviceId).deviceId];
      else if (videoInputs.length >= 2) selected = [videoInputs[0].deviceId, videoInputs[1].deviceId];
      else if (videoInputs.length === 1) selected = [videoInputs[0].deviceId, videoInputs[0].deviceId];
      else throw new Error('No video inputs');

      this.cameraDeviceIds = selected;

      this.streamTop = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: this.cameraDeviceIds[0] }, width: 1280, height: 720 }, audio: false });
      this.videoTop.srcObject = this.streamTop; await this.videoTop.play();

      await new Promise(r => setTimeout(r, 250));

      this.streamSide = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: this.cameraDeviceIds[1] }, width: 1280, height: 720 }, audio: false });
      this.videoSide.srcObject = this.streamSide; await this.videoSide.play();

      this.camerasReady = true;
    } catch (err) {
      console.error('initCameras error', err);
      throw err;
    }
  }

  initMediaPipe() {
    if (typeof Hands === 'undefined') {
      console.warn('MediaPipe Hands is not loaded on page - DualCameraView requires it.');
      return;
    }

    this.handsTop = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    this.handsTop.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
    this.handsTop.onResults(this.onResultsTop.bind(this));

    this.handsSide = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    this.handsSide.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
    this.handsSide.onResults(this.onResultsSide.bind(this));
  }

  async processFrames() {
    if (this.camerasReady) {
      try {
        await this.handsTop.send({ image: this.videoTop });
        await this.handsSide.send({ image: this.videoSide });
      } catch (e) {
        // ignore
      }
    }
    this.animationId = requestAnimationFrame(() => this.processFrames());
  }

  // ------------------ Results handlers for port of index.html ------------------
  onResultsTop(results) {
    if (!results || !results.image) return;
    const width = this.canvasTop.width = results.image.width;
    const height = this.canvasTop.height = results.image.height;

    this.ctxTop.save();
    this.ctxTop.clearRect(0,0,width,height);
    // mirror top for natural feeling
    this.ctxTop.scale(-1,1);
    this.ctxTop.translate(-width,0);
    this.ctxTop.drawImage(results.image, 0, 0, width, height);
    this.ctxTop.restore();

    if (!this.drawingComplete && this.calibrationComplete && !this.isDrawing) {
      // nothing here in PIP version
    }

    if (this.drawingComplete && this.keyboardArea) {
      this.drawPianoKeys();
    }

    if (results.multiHandLandmarks && this.drawingComplete) {
      // update fingertip positions
      results.multiHandLandmarks.forEach((landmarks, handIndex) => {
        const fingerTips = [4,8,12,16,20];
        fingerTips.forEach((tipIndex, fingerNum)=>{
          const lm = landmarks[tipIndex];
          const fingerId = `hand${handIndex}_finger${fingerNum}`;
          // normalized x: 0..1 (mirror adjusted)
          this.detector.updatePosition(fingerId, 1 - lm.x, lm.y);
        });
      });
    }
  }

  onResultsSide(results) {
    if (!results || !results.image) return;
    const width = this.canvasSide.width = results.image.width;
    const height = this.canvasSide.height = results.image.height;

    this.ctxSide.save();
    this.ctxSide.clearRect(0,0,width,height);
    this.ctxSide.drawImage(results.image, 0, 0, width, height);

    // calibration live count could be shown, skipped here

    if (this.captureBaselineNow && results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      let totalY = 0; let count=0;
      results.multiHandLandmarks.forEach((landmarks, handIndex)=>{
        const fingerTips = [4,8,12,16,20];
        fingerTips.forEach((tipIndex, fingerNum)=>{
          const fingerId = `hand${handIndex}_finger${fingerNum}`;
          const yValue = landmarks[tipIndex].y;
          this.detector.setDeskSurfaceY(fingerId, yValue);
          totalY += yValue; count++;
        });
      });
      this.captureBaselineNow = false;
      const avgY = totalY / count;
      this.calibrationComplete = true;
      this.deskYDisplay.innerText = `Desk Y: ${avgY.toFixed(3)}`;
      this.onCalibrated(avgY);
    }

    const avgDeskY = this.detector.getAverageDeskY();
    if (avgDeskY !== null) {
      this.ctxSide.strokeStyle = '#00ff00'; this.ctxSide.lineWidth = 3; this.ctxSide.setLineDash([10,5]);
      const lineY = avgDeskY * height;
      this.ctxSide.beginPath(); this.ctxSide.moveTo(0,lineY); this.ctxSide.lineTo(width,lineY); this.ctxSide.stroke(); this.ctxSide.setLineDash([]);
      this.ctxSide.fillStyle = '#00ff00'; this.ctxSide.font = 'bold 16px Arial'; this.ctxSide.fillText('DESK SURFACE', 10, Math.max(16, lineY-6));
    }

    // Press detection and note playing
    if (results.multiHandLandmarks && this.drawingComplete && this.keyboardArea) {
      const timestamp = performance.now();
      results.multiHandLandmarks.forEach((landmarks, handIndex)=>{
        const fingerTips = [4,8,12,16,20];
        fingerTips.forEach((tipIndex, fingerNum)=>{
          const lm = landmarks[tipIndex];
          const fingerId = `hand${handIndex}_finger${fingerNum}`;
          const pressResult = this.detector.checkPress(fingerId, lm.y, timestamp);
          if (pressResult) {
            const normalizedX = pressResult.x;
            const keyboardStartX = this.keyboardArea.x / this.canvasTop.width;
            const keyboardEndX = (this.keyboardArea.x + this.keyboardArea.width) / this.canvasTop.width;
            if (normalizedX >= keyboardStartX && normalizedX <= keyboardEndX) {
              const relativeX = (normalizedX - keyboardStartX) / (keyboardEndX - keyboardStartX);
              const keyIndex = Math.floor(relativeX * PIANO_KEYS.length);
              if (keyIndex >=0 && keyIndex < PIANO_KEYS.length) {
                const key = PIANO_KEYS[keyIndex];
                this.synth.playNote(key.freq, keyIndex);
                this.keyPressAnimations.set(keyIndex, timestamp);
                setTimeout(()=>this.keyPressAnimations.delete(keyIndex), 150);
              }
            }
          }
        });
      });
    }

    this.ctxSide.restore();
  }

  // ------------------ UI: calibration & drawing ------------------
  startCalibration() {
    // simple countdown and set capture flag
    let countdown = 4;
    const overlay = document.createElement('div'); overlay.style.cssText = 'position:absolute; left:10px; top:10px; padding:8px 12px; background:rgba(0,0,0,0.7); color:#fef3c7; border-radius:6px; z-index:5000; font-weight:700;';
    overlay.innerText = `Calibration: ${countdown}`;
    this.container.appendChild(overlay);
    const iv = setInterval(()=>{
      countdown--; overlay.innerText = `Calibration: ${countdown}`;
      if (countdown<=0) { clearInterval(iv); overlay.innerText = 'Capturing...'; this.captureBaselineNow = true; setTimeout(()=>{ overlay.remove(); }, 1200); }
    },1000);
  }

  calibrate() { this.startCalibration(); }

  openDrawModal() {
    // show drawCanvas overlay, wire mouse events on it for user to select keyboard area
    this.drawCanvas.style.display = 'block';
    // size drawCanvas to top canvas
    const rect = this.canvasTop.getBoundingClientRect();
    this.drawCanvas.width = this.canvasTop.width; this.drawCanvas.height = this.canvasTop.height;
    this.drawCanvas.style.left = (rect.left) + 'px';
    this.drawCanvas.style.top = (rect.top + 40) + 'px';
    this.drawCanvas.style.width = rect.width + 'px';
    this.drawCanvas.style.height = rect.height + 'px';

    const onMouseDown = (e) => {
      this.isDrawing = true;
      const r = this.drawCanvas.getBoundingClientRect();
      const scaleX = this.drawCanvas.width / r.width; const scaleY = this.drawCanvas.height / r.height;
      this.drawStart = { x: (e.clientX - r.left)*scaleX, y: (e.clientY - r.top)*scaleY };
    };
    const onMouseMove = (e) => {
      if (!this.isDrawing) return;
      const r = this.drawCanvas.getBoundingClientRect(); const scaleX = this.drawCanvas.width / r.width; const scaleY = this.drawCanvas.height / r.height;
      const currentX = (e.clientX - r.left)*scaleX; const currentY = (e.clientY - r.top)*scaleY;
      this.drawCtx.drawImage(this.videoTop, 0, 0, this.drawCanvas.width, this.drawCanvas.height);
      this.drawCtx.strokeStyle = '#3b82f6'; this.drawCtx.lineWidth = 4; this.drawCtx.strokeRect(this.drawStart.x, this.drawStart.y, currentX - this.drawStart.x, currentY - this.drawStart.y);
    };
    const onMouseUp = (e) => {
      if (!this.isDrawing) return; this.isDrawing=false;
      const r = this.drawCanvas.getBoundingClientRect(); const scaleX = this.drawCanvas.width / r.width; const scaleY = this.drawCanvas.height / r.height;
      const endX = (e.clientX - r.left)*scaleX; const endY = (e.clientY - r.top)*scaleY;
      this.keyboardArea = { x: Math.min(this.drawStart.x,endX), y: Math.min(this.drawStart.y,endY), width: Math.abs(endX - this.drawStart.x), height: Math.abs(endY - this.drawStart.y) };
      this.drawCanvas.style.display = 'none'; this.drawingComplete = true;
    };

    this.drawCanvas.addEventListener('mousedown', onMouseDown);
    this.drawCanvas.addEventListener('mousemove', onMouseMove);
    this.drawCanvas.addEventListener('mouseup', onMouseUp);
  }

  drawPianoKeys() {
    if (!this.keyboardArea) return;
    const keyWidth = this.keyboardArea.width / PIANO_KEYS.length;
    for (let i=0;i<PIANO_KEYS.length;i++){
      const x = this.keyboardArea.x + (i*keyWidth); const y = this.keyboardArea.y;
      const isPressed = this.keyPressAnimations.has(i);
      this.ctxTop.fillStyle = isPressed ? '#3b82f6' : 'rgba(255,255,255,0.25)';
      this.ctxTop.fillRect(x,y,keyWidth-2,this.keyboardArea.height);
      this.ctxTop.strokeStyle = isPressed ? '#60a5fa':'rgba(255,255,255,0.6)'; this.ctxTop.lineWidth = 3; this.ctxTop.strokeRect(x,y,keyWidth-2,this.keyboardArea.height);
      this.ctxTop.fillStyle = '#fff'; this.ctxTop.font = 'bold 18px Arial'; this.ctxTop.textAlign = 'center'; this.ctxTop.fillText(PIANO_KEYS[i].label, x+keyWidth/2, y + this.keyboardArea.height/2 + 6);
    }
  }

  // ------------------ Cleanup ------------------
  dispose() { this.stop(); }
}

// ------------------ Helper classes & constants ------------------
class PianoSynth {
  constructor(){ this.audioContext = new (window.AudioContext||window.webkitAudioContext)(); this.activeNotes=new Map(); }
  playNote(frequency, keyIndex){ if(this.activeNotes.has(keyIndex)) return; const now = this.audioContext.currentTime; const duration = 1.8; this.createOscillator(frequency,0.5,now,duration); this.createOscillator(frequency*2,0.25,now,duration); this.activeNotes.set(keyIndex,true); setTimeout(()=>this.activeNotes.delete(keyIndex),duration*1000); }
  createOscillator(freq,volume,startTime,duration){ const osc=this.audioContext.createOscillator(); const gain=this.audioContext.createGain(); osc.connect(gain); gain.connect(this.audioContext.destination); osc.frequency.value = freq; osc.type='triangle'; gain.gain.setValueAtTime(0,startTime); gain.gain.linearRampToValueAtTime(volume,startTime+0.01); gain.gain.exponentialRampToValueAtTime(volume*0.001,startTime+duration); osc.start(startTime); osc.stop(startTime+duration); }
}

const PIANO_KEYS = [ {note:'C4',freq:261.63,label:'C'}, {note:'D4',freq:293.66,label:'D'}, {note:'E4',freq:329.63,label:'E'}, {note:'F4',freq:349.23,label:'F'}, {note:'G4',freq:392.00,label:'G'}, {note:'A4',freq:440.00,label:'A'}, {note:'B4',freq:493.88,label:'B'}, {note:'C5',freq:523.25,label:'C5'} ];

class DualCameraPressDetector {
  constructor(){ this.deskSurfaceY = new Map(); this.fingerPositions = new Map(); this.pressThreshold=0.03; this.cooldownTime=200; this.lastPressTime = new Map(); }
  setDeskSurfaceY(fingerId,y){ this.deskSurfaceY.set(fingerId,y); }
  getAverageDeskY(){ if(this.deskSurfaceY.size===0) return null; const vals=Array.from(this.deskSurfaceY.values()); return vals.reduce((a,b)=>a+b,0)/vals.length; }
  updatePosition(fingerId,x,y){ this.fingerPositions.set(fingerId,{x,y,timestamp:performance.now()}); }
  checkPress(fingerId,currentY,timestamp){ if(!this.deskSurfaceY.has(fingerId)) return null; const deskY=this.deskSurfaceY.get(fingerId); const distanceFromDesk = currentY - deskY; const last = this.lastPressTime.get(fingerId)||0; if((timestamp-last) < this.cooldownTime) return null; const isTouchingDesk = distanceFromDesk >= -this.pressThreshold; if(isTouchingDesk){ this.lastPressTime.set(fingerId,timestamp); const pos = this.fingerPositions.get(fingerId); if(pos && (timestamp - pos.timestamp) < 150){ return {pressed:true, x:pos.x, y:pos.y, fingerId, sideY:currentY, deskY}; } return null; } return null; }
}

export { DualCameraView };
