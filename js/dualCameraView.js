// Air Piano Controller for 3D Piano Model
// This class uses dual cameras to detect "air piano" playing and triggers the 3D piano model
// NO sound from the air piano itself - it acts as a silent controller for the 3D piano

class AirPianoController {
  constructor(options = {}) {
    this.options = options;
    this.onNotePress = options.onNotePress || function(){}; // callback to trigger 3D piano
    this.onNoteRelease = options.onNoteRelease || function(){};
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
    this.activeNotes = new Map(); // Track which notes are currently pressed

    // Octave selection (12 keys from C to B)
    this.octaveStart = options.octaveStart || 48; // MIDI note number (C4 = 60, so 48 = C3)
    this.numKeys = 12; // One octave

    // internal detector
    this.detector = new AirPianoPressDetector();
  }
createDOM() {
    const container = document.createElement('div');
    container.id = 'airPianoPIP';
    container.style.cssText = `
        width: 100%;
        background: transparent;
        padding: 12px;
        border: none;
        box-shadow: none;
        position: relative;
    `;

    // header
    const header = document.createElement('div');
    header.style.cssText = 'color:#60a5fa; font-weight:700; font-size:15px; margin-bottom:8px; text-align:center;';
    header.innerHTML = '🎹 Air Piano Controller <span style="color:#94a3b8; font-size:12px; font-weight:400;">(Silent - Triggers 3D Piano)</span>';
    container.appendChild(header);

    // Octave selector
    const octaveSelector = document.createElement('div');
    octaveSelector.style.cssText = 'display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:8px;';
    octaveSelector.innerHTML = `
      <label style="color:#94a3b8; font-size:13px;">Octave:</label>
      <select id="octaveSelect" style="padding:4px 8px; background:#1e293b; color:#e2e8f0; border:1px solid #475569; border-radius:4px;">
        <option value="36">C2 (Low)</option>
        <option value="48" selected>C3</option>
        <option value="60">C4 (Middle)</option>
        <option value="72">C5 (High)</option>
      </select>
    `;
    container.appendChild(octaveSelector);

    // two canvases stacked vertically
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; flex-direction:column; gap:8px;';

    const topWrap = document.createElement('div');
    topWrap.style.cssText = 'width:100%; height:200px; position:relative; background:#000; border-radius:6px; overflow:hidden; border:1px solid rgba(34, 197, 94, 0.3);';
    const topLabel = document.createElement('div'); 
    topLabel.innerText = 'TOP: Position Tracking'; 
    topLabel.style.cssText = 'position:absolute; top:6px; left:6px; background:rgba(34, 197, 94, 0.9); color:#fff; padding:4px 10px; border-radius:4px; z-index:20; font-size:11px; font-weight:600;';
    topWrap.appendChild(topLabel);
    const canvasTop = document.createElement('canvas'); 
    canvasTop.id = 'airPianoOutputTop'; 
    canvasTop.style.cssText = 'width:100%; height:100%; display:block;';
    const videoTop = document.createElement('video'); 
    videoTop.id = 'airPianoVideoTop'; 
    videoTop.style.display = 'none'; 
    videoTop.playsInline = true; 
    videoTop.autoplay = true;
    topWrap.appendChild(canvasTop); 
    topWrap.appendChild(videoTop);

    const sideWrap = document.createElement('div');
    sideWrap.style.cssText = 'width:100%; height:200px; position:relative; background:#000; border-radius:6px; overflow:hidden; border:1px solid rgba(168, 85, 247, 0.3);';
    const sideLabel = document.createElement('div'); 
    sideLabel.innerText = 'SIDE: Press Detection'; 
    sideLabel.style.cssText = 'position:absolute; top:6px; left:6px; background:rgba(168, 85, 247, 0.9); color:#fff; padding:4px 10px; border-radius:4px; z-index:20; font-size:11px; font-weight:600;';
    sideWrap.appendChild(sideLabel);
    const deskY = document.createElement('div'); 
    deskY.id = 'airPianoDeskY'; 
    deskY.innerText = 'Desk: Not set'; 
    deskY.style.cssText = 'position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.6); color:#fde68a; padding:4px 8px; border-radius:4px; z-index:20; font-size:11px;';
    sideWrap.appendChild(deskY);
    const canvasSide = document.createElement('canvas'); 
    canvasSide.id = 'airPianoOutputSide'; 
    canvasSide.style.cssText = 'width:100%; height:100%; display:block;';
    const videoSide = document.createElement('video'); 
    videoSide.id = 'airPianoVideoSide'; 
    videoSide.style.display = 'none'; 
    videoSide.playsInline = true; 
    videoSide.autoplay = true;
    sideWrap.appendChild(canvasSide); 
    sideWrap.appendChild(videoSide);

    wrapper.appendChild(topWrap); 
    wrapper.appendChild(sideWrap);
    container.appendChild(wrapper);

    // buttons row
// buttons row
const controls = document.createElement('div'); 
controls.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px;';

const calibrateBtn = document.createElement('button'); 
calibrateBtn.innerText = '📏 Calibrate'; 
calibrateBtn.style.cssText = 'padding:10px 12px; background:#059669; color:white; border-radius:6px; font-weight:600; cursor:pointer; border:none; transition:all 0.2s ease;';
calibrateBtn.addEventListener('click', ()=> this.startCalibration());

const drawBtn = document.createElement('button'); 
drawBtn.innerText = '✏️ Draw Area'; 
drawBtn.style.cssText = 'padding:10px 12px; background:#2563eb; color:white; border-radius:6px; font-weight:600; cursor:pointer; border:none; transition:all 0.2s ease;';
drawBtn.addEventListener('click', ()=> this.openDrawModal());

const stopBtn = document.createElement('button'); 
stopBtn.innerText = '❌ Close'; 
stopBtn.style.cssText = 'grid-column:1/-1; padding:10px 12px; background:#dc2626; color:white; border-radius:6px; font-weight:600; cursor:pointer; border:none; transition:all 0.2s ease;';
stopBtn.addEventListener('click', ()=> this.stop());

controls.appendChild(calibrateBtn); 
controls.appendChild(drawBtn); 
controls.appendChild(stopBtn);
container.appendChild(controls);

    // Status indicator
    const status = document.createElement('div');
    status.id = 'airPianoStatus';
    status.style.cssText = 'margin-top:8px; text-align:center; color:#94a3b8; font-size:12px;';
    status.innerText = 'Ready to calibrate...';
    container.appendChild(status);

    // hidden draw canvas overlay
  // hidden draw canvas overlay - now appends to body for proper positioning
const drawCanvas = document.createElement('canvas'); 
drawCanvas.id = 'airPianoDrawCanvas'; 
drawCanvas.style.cssText = 'position:fixed; display:none; z-index:5000; cursor:crosshair; border:3px solid #3b82f6; box-shadow:0 0 20px rgba(59,130,246,0.5); border-radius:6px;';
document.body.appendChild(drawCanvas); // Append to body instead of container

    // Append to camera-stack instead of body
    const cameraStack = document.getElementById('camera-stack');
    if (cameraStack) {
        cameraStack.appendChild(container);
    } else {
        document.body.appendChild(container);
    }

    // wire refs
    this.container = container;
    this.canvasTop = canvasTop; 
    this.canvasSide = canvasSide; 
    this.drawCanvas = drawCanvas;
    this.videoTop = videoTop; 
    this.videoSide = videoSide;
    this.ctxTop = canvasTop.getContext('2d'); 
    this.ctxSide = canvasSide.getContext('2d'); 
    this.drawCtx = drawCanvas.getContext('2d');
    this.deskYDisplay = deskY;
    this.statusDisplay = status;

    // Octave change handler
// Octave change handler
document.getElementById('octaveSelect').addEventListener('change', (e) => {
  this.octaveStart = parseInt(e.target.value);
  console.log('Air Piano octave changed to:', this.octaveStart);
  
  // Highlight the new octave on the 3D piano
  if (typeof window.highlightOctaveRange === 'function') {
    const octaveStartKey = this.octaveStart - 21; // Convert MIDI to piano key index
    window.highlightOctaveRange(octaveStartKey, 12);
  }
});
}

  async start() {
    if (!this.container) this.createDOM();
    try {
      await this.initCameras();
      this.initMediaPipe();
      this.processFrames();
      this.statusDisplay.innerText = '✅ Cameras active - Please calibrate desk position';
    } catch (e) {
      console.error('AirPianoController start error:', e);
      this.statusDisplay.innerText = '❌ Camera error: ' + e.message;
    }
  }

  async stop() {
    // Release all active notes before stopping
    this.activeNotes.forEach((_, noteNumber) => {
      this.onNoteRelease(noteNumber);
    });
    this.activeNotes.clear();

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
      this.videoTop.srcObject = this.streamTop; 
      await this.videoTop.play();

      await new Promise(r => setTimeout(r, 250));

      this.streamSide = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: this.cameraDeviceIds[1] }, width: 1280, height: 720 }, audio: false });
      this.videoSide.srcObject = this.streamSide; 
      await this.videoSide.play();

      this.camerasReady = true;
    } catch (err) {
      console.error('initCameras error', err);
      throw err;
    }
  }

initMediaPipe() {
  if (typeof Hands === 'undefined') {
    console.warn('MediaPipe Hands is not loaded - AirPianoController requires it.');
    return;
  }

  this.handsTop = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  this.handsTop.setOptions({ 
    maxNumHands: 2, 
    modelComplexity: 0,  // REDUCED from 1 (faster processing)
    minDetectionConfidence: 0.6,  // REDUCED from 0.7
    minTrackingConfidence: 0.6  // REDUCED from 0.7
  });
  this.handsTop.onResults(this.onResultsTop.bind(this));

  this.handsSide = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  this.handsSide.setOptions({ 
    maxNumHands: 2, 
    modelComplexity: 0,  // REDUCED from 1 (faster processing)
    minDetectionConfidence: 0.6,  // REDUCED from 0.7
    minTrackingConfidence: 0.6  // REDUCED from 0.7
  });
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

  // TOP CAMERA: Track finger positions
  onResultsTop(results) {
    if (!results || !results.image) return;
    const width = this.canvasTop.width = results.image.width;
    const height = this.canvasTop.height = results.image.height;

    this.ctxTop.save();
    this.ctxTop.clearRect(0,0,width,height);
    this.ctxTop.scale(-1,1);
    this.ctxTop.translate(-width,0);
    this.ctxTop.drawImage(results.image, 0, 0, width, height);
    this.ctxTop.restore();

    if (this.drawingComplete && this.keyboardArea) {
      this.drawPianoKeys();
    }

    if (results.multiHandLandmarks && this.drawingComplete) {
      results.multiHandLandmarks.forEach((landmarks, handIndex) => {
        this.drawHandLandmarks(landmarks, width, height, this.ctxTop, '#22c55e');
        const fingerTips = [4,8,12,16,20];
        fingerTips.forEach((tipIndex, fingerNum)=>{
          const lm = landmarks[tipIndex];
          const fingerId = `hand${handIndex}_finger${fingerNum}`;
          this.detector.updatePosition(fingerId, 1 - lm.x, lm.y);
        });
      });
    }
  }

  // SIDE CAMERA: Detect press and trigger 3D piano
  onResultsSide(results) {
    if (!results || !results.image) return;
    const width = this.canvasSide.width = results.image.width;
    const height = this.canvasSide.height = results.image.height;

    this.ctxSide.save();
    this.ctxSide.clearRect(0,0,width,height);
    this.ctxSide.drawImage(results.image, 0, 0, width, height);

    // Calibration capture
    if (this.captureBaselineNow && results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      let totalY = 0; 
      let count=0;
      results.multiHandLandmarks.forEach((landmarks, handIndex)=>{
        const fingerTips = [4,8,12,16,20];
        fingerTips.forEach((tipIndex, fingerNum)=>{
          const fingerId = `hand${handIndex}_finger${fingerNum}`;
          const yValue = landmarks[tipIndex].y;
          this.detector.setDeskSurfaceY(fingerId, yValue);
          totalY += yValue; 
          count++;
        });
      });
      this.captureBaselineNow = false;
      const avgY = totalY / count;
      this.calibrationComplete = true;
      this.deskYDisplay.innerText = `Desk: ${avgY.toFixed(3)}`;
      this.statusDisplay.innerText = '✅ Calibrated! Now draw your keyboard area.';
    }

    // Draw desk surface line
    const avgDeskY = this.detector.getAverageDeskY();
    if (avgDeskY !== null) {
      this.ctxSide.strokeStyle = '#22c55e'; 
      this.ctxSide.lineWidth = 3; 
      this.ctxSide.setLineDash([10,5]);
      const lineY = avgDeskY * height;
      this.ctxSide.beginPath(); 
      this.ctxSide.moveTo(0,lineY); 
      this.ctxSide.lineTo(width,lineY); 
      this.ctxSide.stroke(); 
      this.ctxSide.setLineDash([]);
      this.ctxSide.fillStyle = '#22c55e'; 
      this.ctxSide.font = 'bold 14px Arial'; 
      this.ctxSide.fillText('DESK SURFACE', 10, Math.max(16, lineY-6));
    }

    // Press detection and 3D piano triggering
    if (results.multiHandLandmarks && this.drawingComplete && this.keyboardArea) {
      const timestamp = performance.now();
      const currentlyPressed = new Set();

      results.multiHandLandmarks.forEach((landmarks, handIndex)=>{
        this.drawHandLandmarks(landmarks, width, height, this.ctxSide, '#a855f7');
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
              const keyIndex = Math.floor(relativeX * this.numKeys);
              
              if (keyIndex >= 0 && keyIndex < this.numKeys) {
                const midiNoteNumber = this.octaveStart + keyIndex;
                currentlyPressed.add(midiNoteNumber);

                // Trigger 3D piano note ON if not already active
                if (!this.activeNotes.has(midiNoteNumber)) {
                  this.activeNotes.set(midiNoteNumber, fingerId);
                  this.onNotePress(midiNoteNumber, 100); // velocity = 100
                  this.keyPressAnimations.set(keyIndex, timestamp);
                  console.log(`🎹 AIR PIANO: Note ${midiNoteNumber} ON`);
                }
              }
            }
          }
        });
      });

      // Release notes that are no longer pressed
      this.activeNotes.forEach((fingerId, noteNumber) => {
        if (!currentlyPressed.has(noteNumber)) {
          this.onNoteRelease(noteNumber);
          this.activeNotes.delete(noteNumber);
          console.log(`🎹 AIR PIANO: Note ${noteNumber} OFF`);
        }
      });

      // Clear old animations
      this.keyPressAnimations.forEach((time, keyIndex) => {
        if (timestamp - time > 150) this.keyPressAnimations.delete(keyIndex);
      });
    }

    this.ctxSide.restore();
  }

  // Calibration
  startCalibration() {
    if (!this.camerasReady) {
      alert('Cameras not ready yet!');
      return;
    }
    let countdown = 4;
    const overlay = document.createElement('div'); 
    overlay.style.cssText = 'position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); padding:20px 30px; background:rgba(0,0,0,0.9); color:#fef3c7; border-radius:10px; z-index:5000; font-weight:700; font-size:24px; border:2px solid #fbbf24;';
    overlay.innerText = `Place hands flat on desk: ${countdown}`;
    this.container.appendChild(overlay);
    const iv = setInterval(()=>{
      countdown--; 
      overlay.innerText = `Place hands flat on desk: ${countdown}`;
      if (countdown<=0) { 
        clearInterval(iv); 
        overlay.innerText = 'Capturing...'; 
        this.captureBaselineNow = true; 
        setTimeout(()=>{ overlay.remove(); }, 1200); 
      }
    },1000);
  }

  calibrate() { this.startCalibration(); }

  // Draw keyboard area
openDrawModal() {
    if (!this.calibrationComplete) {
      alert('Please calibrate desk position first!');
      return;
    }
    
    this.statusDisplay.innerText = '✏️ Draw your keyboard area on the TOP camera...';
    
    // Get the actual position and size of the top camera canvas
    const topCanvasRect = this.canvasTop.getBoundingClientRect();
    
    // Position draw canvas exactly over the top camera canvas
    this.drawCanvas.style.display = 'block';
    this.drawCanvas.style.position = 'absolute';
    this.drawCanvas.style.left = topCanvasRect.left + 'px';
    this.drawCanvas.style.top = topCanvasRect.top + 'px';
    this.drawCanvas.style.width = topCanvasRect.width + 'px';
    this.drawCanvas.style.height = topCanvasRect.height + 'px';
    this.drawCanvas.width = this.canvasTop.width;
    this.drawCanvas.height = this.canvasTop.height;

    const onMouseDown = (e) => {
      this.isDrawing = true;
      const r = this.drawCanvas.getBoundingClientRect();
      const scaleX = this.drawCanvas.width / r.width; 
      const scaleY = this.drawCanvas.height / r.height;
      this.drawStart = { x: (e.clientX - r.left)*scaleX, y: (e.clientY - r.top)*scaleY };
    };
    
    const onMouseMove = (e) => {
      if (!this.isDrawing) return;
      const r = this.drawCanvas.getBoundingClientRect(); 
      const scaleX = this.drawCanvas.width / r.width; 
      const scaleY = this.drawCanvas.height / r.height;
      const currentX = (e.clientX - r.left)*scaleX; 
      const currentY = (e.clientY - r.top)*scaleY;
      this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
      this.drawCtx.strokeStyle = '#3b82f6'; 
      this.drawCtx.lineWidth = 4; 
      this.drawCtx.strokeRect(this.drawStart.x, this.drawStart.y, currentX - this.drawStart.x, currentY - this.drawStart.y);
    };
    
    const onMouseUp = (e) => {
      if (!this.isDrawing) return; 
      this.isDrawing=false;
      const r = this.drawCanvas.getBoundingClientRect(); 
      const scaleX = this.drawCanvas.width / r.width; 
      const scaleY = this.drawCanvas.height / r.height;
      const endX = (e.clientX - r.left)*scaleX; 
      const endY = (e.clientY - r.top)*scaleY;
      this.keyboardArea = { 
        x: Math.min(this.drawStart.x,endX), 
        y: Math.min(this.drawStart.y,endY), 
        width: Math.abs(endX - this.drawStart.x), 
        height: Math.abs(endY - this.drawStart.y) 
      };
      this.drawCanvas.style.display = 'none'; 
      this.drawingComplete = true;
      this.statusDisplay.innerText = '🎹 Ready to play! Touch the desk to trigger notes.';
    };

    this.drawCanvas.addEventListener('mousedown', onMouseDown);
    this.drawCanvas.addEventListener('mousemove', onMouseMove);
    this.drawCanvas.addEventListener('mouseup', onMouseUp);
}

  // Draw piano key overlay
  drawPianoKeys() {
    if (!this.keyboardArea) return;
    const keyWidth = this.keyboardArea.width / this.numKeys;
    
    for (let i=0; i<this.numKeys; i++){
      const x = this.keyboardArea.x + (i*keyWidth); 
      const y = this.keyboardArea.y;
      const isPressed = this.keyPressAnimations.has(i);
      
      this.ctxTop.fillStyle = isPressed ? '#3b82f6' : 'rgba(255,255,255,0.2)';
      this.ctxTop.fillRect(x,y,keyWidth-2,this.keyboardArea.height);
      this.ctxTop.strokeStyle = isPressed ? '#60a5fa':'rgba(255,255,255,0.5)'; 
      this.ctxTop.lineWidth = 2; 
      this.ctxTop.strokeRect(x,y,keyWidth-2,this.keyboardArea.height);
      
      // Draw note labels
      const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      this.ctxTop.fillStyle = '#fff'; 
      this.ctxTop.font = 'bold 14px Arial'; 
      this.ctxTop.textAlign = 'center'; 
      this.ctxTop.fillText(noteNames[i], x+keyWidth/2, y + this.keyboardArea.height/2 + 5);
    }
  }

  // Draw hand landmarks
  drawHandLandmarks(landmarks, width, height, ctx, color = '#22c55e') {
    const connections = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],
      [0,17]
    ];

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    connections.forEach(([start, end]) => {
      const s = landmarks[start];
      const e = landmarks[end];
      ctx.beginPath();
      ctx.moveTo(s.x * width, s.y * height);
      ctx.lineTo(e.x * width, e.y * height);
      ctx.stroke();
    });

    landmarks.forEach((lm, i) => {
      const x = lm.x * width;
      const y = lm.y * height;
      const isTip = [4, 8, 12, 16, 20].includes(i);
      
      ctx.beginPath();
      ctx.arc(x, y, isTip ? 7 : 4, 0, 2 * Math.PI);
      ctx.fillStyle = isTip ? '#ef4444' : color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  dispose() { this.stop(); }
}

// Press detector class
class AirPianoPressDetector {
  constructor(){ 
    this.deskSurfaceY = new Map(); 
    this.fingerPositions = new Map(); 
    this.pressThreshold = 0.040;  // INCREASED from 0.035 (less sensitive)
    this.cooldownTime = 100;  // REDUCED from 150ms (faster repeat)
    this.lastPressTime = new Map();
    this.isPressed = new Map();
  }
  // ... rest of the class stays the same
  
  setDeskSurfaceY(fingerId,y){ this.deskSurfaceY.set(fingerId,y); }
  
  getAverageDeskY(){ 
    if(this.deskSurfaceY.size===0) return null; 
    const vals=Array.from(this.deskSurfaceY.values()); 
    return vals.reduce((a,b)=>a+b,0)/vals.length; 
  }
  
  updatePosition(fingerId,x,y){ 
    this.fingerPositions.set(fingerId,{x,y,timestamp:performance.now()}); 
  }
  
  checkPress(fingerId,currentY,timestamp){ 
    if(!this.deskSurfaceY.has(fingerId)) return null; 
    const deskY=this.deskSurfaceY.get(fingerId); 
    const distanceFromDesk = currentY - deskY; 
    const last = this.lastPressTime.get(fingerId)||0; 
    const timeSinceLastPress = timestamp - last;
    
    const isTouchingDesk = distanceFromDesk >= -this.pressThreshold;
    const wasPressed = this.isPressed.get(fingerId) || false;
    
    // Only trigger on new press (not already pressed) and cooldown passed
    if(isTouchingDesk && !wasPressed && timeSinceLastPress > this.cooldownTime){ 
      this.lastPressTime.set(fingerId,timestamp); 
      this.isPressed.set(fingerId, true);
      const pos = this.fingerPositions.get(fingerId); 
      if(pos && (timestamp - pos.timestamp) < 150){ 
        return {pressed:true, x:pos.x, y:pos.y, fingerId, sideY:currentY, deskY}; 
      } 
      return null; 
    }
    
    // Update press state
    if (!isTouchingDesk) {
      this.isPressed.set(fingerId, false);
    }
    
    return null; 
  }
}

// Export for use in main.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AirPianoController };
} else if (typeof window !== 'undefined') {
  window.AirPianoController = AirPianoController;
}

// At the END of your current dualCameraView.js file, add the OLD DualCameraView class
// and update the exports:

// Keep your AirPianoController class as is...

// Add back the original DualCameraView class (simplified version for backwards compatibility)
// REPLACE the DualCameraView class at the end of the file with this:

// REPLACE the DualCameraView class at the end of dualCameraView.js with this optimized version:

class DualCameraView {
  constructor(options = {}) {
    // Transform old DualCameraView into new AirPianoController with 3D piano integration
    this.airPiano = new AirPianoController({
      ...options,
     onNotePress: (midiNoteNumber, velocity) => {
  console.log('🎹 DualCameraView: Note ON', midiNoteNumber, velocity);
  
  try {
        if (typeof window.recordNote === 'function') {
      window.recordNote(midiNoteNumber, velocity, true);
    }
    const pianoKey = midiNoteNumber - 21;
    
    if (pianoKey >= 0 && pianoKey < 88) {
      // Play the note through MIDI
      if (typeof MIDI !== 'undefined' && MIDI.noteOn) {
        try {
          MIDI.noteOn(0, midiNoteNumber, velocity, 0);
          console.log('✅ MIDI noteOn called:', midiNoteNumber);
        } catch (e) {
          console.error('❌ MIDI.noteOn error:', e);
        }
      }
      
      // Animate the 3D piano key
      if (typeof window.setKey === 'function') {
        try {
          window.setKey(pianoKey, true, 0);
          console.log('✅ setKey ON called:', pianoKey);
        } catch (e) {
          console.error('❌ setKey error:', e);
        }
      }
      
      // **NEW: Position hands/arms before animating fingers**
      if (window.mixamorig && window.rigHelper && typeof window.setHandById === 'function') {
        try {
          // Position the right hand to the correct key location
          const keyId = (pianoKey - 88 + 1) * -1; // Right hand formula
          window.setHandById(keyId, 0); // track 0 = right hand
          console.log('✅ Hand positioned for key:', pianoKey);
        } catch (e) {
          console.error('❌ setHandById error:', e);
        }
      }
      
      // Visual feedback for fingers
      if (window.notesState && window.settings && window.settings["Animate Fingers"]) {
        try {
          window.notesState[0][pianoKey] = true;
          if (typeof window.animateFingers === 'function') {
            window.animateFingers(window.notesState, window.rigHelper, window.mixamorig, 0, true);
            console.log('✅ animateFingers called for note:', pianoKey);
          }
        } catch (e) {
          console.error('❌ animateFingers error:', e);
        }
      }
    }
  } catch (e) {
    console.error('❌ onNotePress error:', e);
  }
  
  if (options.onNotePress) {
    try {
      options.onNotePress(midiNoteNumber, velocity);
    } catch (e) {
      console.error('❌ options.onNotePress error:', e);
    }
  }
},
      onNoteRelease: (midiNoteNumber) => {
        console.log('🎹 DualCameraView: Note OFF', midiNoteNumber);
        
        try {
              if (typeof window.recordNote === 'function') {
      window.recordNote(midiNoteNumber, 100, false);
    }
          const pianoKey = midiNoteNumber - 21;
          
          if (pianoKey >= 0 && pianoKey < 88) {
            // Stop the note
            if (typeof MIDI !== 'undefined' && MIDI.noteOff) {
              try {
                MIDI.noteOff(0, midiNoteNumber, 0);
                console.log('✅ MIDI noteOff called:', midiNoteNumber);
              } catch (e) {
                console.error('❌ MIDI.noteOff error:', e);
              }
            }
            
            // Animate the 3D piano key release
            if (typeof window.setKey === 'function') {
              try {
                window.setKey(pianoKey, false, 0);
                console.log('✅ setKey OFF called:', pianoKey);
              } catch (e) {
                console.error('❌ setKey OFF error:', e);
              }
            }
            
            // Visual feedback for fingers
            if (window.notesState && window.settings && window.settings["Animate Fingers"]) {
              try {
                window.notesState[0][pianoKey] = false;
                if (typeof window.animateFingers === 'function') {
                  window.animateFingers(window.notesState, window.rigHelper, window.mixamorig, 0, true);
                }
              } catch (e) {
                console.error('❌ animateFingers OFF error:', e);
              }
            }
          }
        } catch (e) {
          console.error('❌ onNoteRelease error:', e);
        }
        
        // Call the original callback if provided
        if (options.onNoteRelease) {
          try {
            options.onNoteRelease(midiNoteNumber);
          } catch (e) {
            console.error('❌ options.onNoteRelease error:', e);
          }
        }
      }
    });
  }
  
  start() { return this.airPiano.start(); }
  stop() { return this.airPiano.stop(); }
  calibrate() { return this.airPiano.calibrate(); }
  dispose() { return this.airPiano.dispose(); }
}

// Export both for compatibility
export { AirPianoController, DualCameraView };
