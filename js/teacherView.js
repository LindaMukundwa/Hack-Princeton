// This file expects TensorFlow.js and the Handpose model to be loaded via
// <script> tags in the HTML (CDN globals: `tf` and `handpose`).
// See `MIDIPlayer3D.html` which includes these scripts.

class TeacherView {
    constructor() {
        this.video = document.createElement('video');
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.handModel = null;
        this.hands = { left: null, right: null };
        this.keyMapping = new Array(88).fill(null);
        this.calibrated = false;
        // runtime housekeeping
        this.animationFrameId = null;
        this.stream = null;
        this.surface = { leftX: 0, rightX: this.canvas.width, keyCount: 88 };
        this.calibrationClicks = [];
        this.calibrationMode = false;

        this.setupUI();
        this.initializeWebcam();
        this.initializeHandTracking();
    }

    async setupUI() {
        // Create PIP container
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 320px;
            height: 240px;
            border: 2px solid #fff;
            border-radius: 8px;
            overflow: hidden;
            z-index: 1000;
        `;

        // Setup canvas
        this.canvas.width = 320;
        this.canvas.height = 240;
        container.appendChild(this.canvas);

        // Add feedback overlay
        this.feedbackOverlay = document.createElement('div');
        this.feedbackOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            padding: 5px;
            background: rgba(0,0,0,0.5);
            color: white;
            font-size: 14px;
            text-align: center;
        `;
        container.appendChild(this.feedbackOverlay);

        document.body.appendChild(container);
    }

    async initializeWebcam() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 320,
                    height: 240,
                    facingMode: 'user'
                }
            });
            this.stream = stream;
            this.video.srcObject = stream;
            this.video.play();
        } catch (error) {
            console.error('Error accessing webcam:', error);
            this.feedbackOverlay.textContent = 'Error: Cannot access webcam';
        }
    }

    async initializeHandTracking() {
        try {
            // Use global tf / handpose loaded via <script> tags in the HTML.
            if (typeof tf === 'undefined' || typeof handpose === 'undefined') {
                throw new Error('tf or handpose not found on window. Ensure scripts are loaded in HTML.');
            }
            await (tf.setBackend ? tf.setBackend('webgl') : Promise.resolve());
            this.handModel = await handpose.load();
            this.startTracking();
        } catch (error) {
            console.error('Error loading hand tracking model:', error);
            this.feedbackOverlay.textContent = 'Error: Cannot load hand tracking';
        }
    }

    async startTracking() {
        const detectHands = async () => {
            // Detect hands
            const predictions = await this.handModel.estimateHands(this.video, true);
            
            // Clear canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

            // Process each detected hand
            for (const hand of predictions) {
                const handedness = this.determineHandedness(hand);
                this.hands[handedness] = hand;
                this.visualizeHand(hand);
                this.detectKeyPresses(hand);
            }

            // Continue tracking
            this.animationFrameId = requestAnimationFrame(detectHands);
        };

        detectHands();
    }

    determineHandedness(hand) {
        // Determine handedness by bounding box center when available, otherwise landmarks average
        if (hand.boundingBox && hand.boundingBox.topLeft && hand.boundingBox.bottomRight) {
            const topLeft = hand.boundingBox.topLeft;
            const bottomRight = hand.boundingBox.bottomRight;
            const centerX = (topLeft[0] + bottomRight[0]) / 2;
            return centerX < this.canvas.width / 2 ? 'left' : 'right';
        }
        const avgX = hand.landmarks.reduce((s, p) => s + p[0], 0) / hand.landmarks.length;
        return avgX < this.canvas.width / 2 ? 'left' : 'right';
    }

    visualizeHand(hand) {
        // draw hand landmarks
        const landmarks = hand.landmarks;
        
        // Draw connections
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 2;
        
        // Draw a simple polyline through landmarks to indicate shape
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#00ff00';
        for (let i = 0; i < landmarks.length; i++) {
            const p = landmarks[i];
            if (i === 0) this.ctx.moveTo(p[0], p[1]); else this.ctx.lineTo(p[0], p[1]);
        }
        this.ctx.stroke();
        
        // Draw points
        landmarks.forEach(point => {
            this.ctx.beginPath();
            this.ctx.arc(point[0], point[1], 3, 0, 2 * Math.PI);
            this.ctx.fillStyle = '#ff0000';
            this.ctx.fill();
        });
    }

    detectKeyPresses(hand) {
        // Robust index fingertip lookup
        let tip = null;
        if (hand.annotations && hand.annotations.indexFinger && hand.annotations.indexFinger.length > 0) {
            tip = hand.annotations.indexFinger[3]; // tip usually last element
        }
        // fallback to landmark 8 which is index fingertip in handpose
        if (!tip && hand.landmarks && hand.landmarks[8]) {
            tip = hand.landmarks[8];
        }
        if (!tip) return;

        const keyPressed = this.mapToKey(tip[0], tip[1], tip[2] || 0);
        if (keyPressed !== null) {
            const velocity = this.calculatePressVelocity(tip[2] || 0);
            this.triggerKeyPress(keyPressed, velocity);
        }
    }

    mapToKey(x, y, z) {
        // If not calibrated, do not trigger presses by default
        if (!this.calibrated) return null;

        // Linear mapping from calibrated left/right surface X to key index
        const left = this.surface.leftX;
        const right = this.surface.rightX || this.canvas.width;
        const clampedX = Math.max(Math.min(x, Math.max(left, right)), Math.min(left, right));
        const t = (clampedX - left) / (right - left);
        const idx = Math.floor(t * this.surface.keyCount);
        return idx >= 0 && idx < this.surface.keyCount ? idx : null;
    }

    calculatePressVelocity(z) {
        // Convert z-depth to MIDI velocity
        // z is typically in the range of -0.5 to 0.5
        const normalizedZ = (z + 0.5) / 1.0;
        return Math.floor(normalizedZ * 127);
    }

    triggerKeyPress(keyIndex, velocity) {
        // Trigger MIDI event
        if (MIDI && MIDI.Player) {
            MIDI.noteOn(0, keyIndex + 21, velocity, 0);
        }
    }

    calibrate() {
        // Start a two-click calibration: left edge, then right edge of the playing surface
        this.calibrationClicks = [];
        this.calibrationMode = true;
        this.feedbackOverlay.textContent = 'Calibration: Click LEFT edge of your surface';

        const onClick = (ev) => {
            const rect = this.canvas.getBoundingClientRect();
            const cx = ev.clientX - rect.left;
            this.calibrationClicks.push({ x: cx });
            if (this.calibrationClicks.length === 1) {
                this.feedbackOverlay.textContent = 'Calibration: Click RIGHT edge of your surface';
            }
            if (this.calibrationClicks.length === 2) {
                const a = this.calibrationClicks[0];
                const b = this.calibrationClicks[1];
                this.surface.leftX = a.x;
                this.surface.rightX = b.x;
                this.surface.keyCount = 88; // default; change if you want a different mapping
                this.calibrated = true;
                this.calibrationMode = false;
                this.feedbackOverlay.textContent = 'Calibration complete';
                this.canvas.removeEventListener('click', onClick);
            }
        };

        this.canvas.addEventListener('click', onClick);
    }

    dispose() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.canvas && this.canvas.parentElement) {
            const container = this.canvas.parentElement;
            container.remove();
        }
        this.handModel = null;
    }
}

export { TeacherView };