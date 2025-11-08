// Enhanced TeacherView with complete pianist animation
// Creates falling note boxes and animates both fingers AND arms of the pianist model
// Independent from MIDI player - works with live pose estimation

import { animateFingers } from './util/fingers.js';

class TeacherView {
    constructor() {
        this.video = document.createElement('video');
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.handsDetector = null;
        this.activeNotes = new Set();
        this.lastFingerPositions = { left: {}, right: {} };
        this.teacherBoxes = []; // Boxes created by teacher mode
        this.noteStartTimes = new Map(); // Track when each note started
        this.currentArmPositions = { left: null, right: null }; // Track current arm positions
        
        // Air piano configuration
        this.config = {
            octaveStart: 3, // Middle C octave
            octaveRange: 2, // 2 octaves (24 keys)
            zThreshold: -0.15, // Z-depth threshold for key press
            debounceTime: 50, // ms between note triggers
            velocity: 80, // Default MIDI velocity
            boxFallSpeed: 10, // Speed multiplier for falling boxes
            minNoteDuration: 0.3, // Minimum note duration in seconds
            armTransitionSpeed: 0.2 // Smooth arm movement (increased for better visibility)
        };
        
        this.calibrated = false;
        this.surface = { 
            leftEdge: 0, 
            rightEdge: 0, 
            topEdge: 0, 
            bottomEdge: 0 
        };
        
        // Runtime state
        this.animationFrameId = null;
        this.stream = null;
        this.lastNoteTime = {};
        this.teacherModeStartTime = Date.now();
        
        this.setupUI();
        this.initializeWebcam();
        this.initializeHandTracking();
    }

    setupUI() {
        // Create PIP container in bottom right
        const container = document.createElement('div');
        container.id = 'teacherViewContainer';
        container.style.cssText = `
            position: fixed;
            bottom: 70px;
            right: 20px;
            width: 400px;
            height: 300px;
            border: 3px solid #00ff00;
            border-radius: 12px;
            overflow: hidden;
            z-index: 1000;
            box-shadow: 0 4px 20px rgba(0,255,0,0.3);
            background: #000;
        `;

        // Setup canvas
        this.canvas.width = 640;
        this.canvas.height = 480;
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.objectFit = 'cover';
        container.appendChild(this.canvas);

        // Feedback overlay
        this.feedbackOverlay = document.createElement('div');
        this.feedbackOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            padding: 10px;
            background: linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%);
            color: #00ff00;
            font-size: 14px;
            font-family: monospace;
            text-align: center;
            pointer-events: none;
        `;
        this.feedbackOverlay.textContent = 'Initializing Air Piano...';
        container.appendChild(this.feedbackOverlay);

        // Status indicator
        this.statusIndicator = document.createElement('div');
        this.statusIndicator.style.cssText = `
            position: absolute;
            bottom: 10px;
            left: 10px;
            right: 10px;
            padding: 5px;
            background: rgba(0,0,0,0.7);
            color: #fff;
            font-size: 12px;
            font-family: monospace;
            border-radius: 4px;
            pointer-events: none;
        `;
        container.appendChild(this.statusIndicator);

        document.body.appendChild(container);
        this.container = container;
    }

    async initializeWebcam() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            });
            this.stream = stream;
            this.video.srcObject = stream;
            this.video.addEventListener('loadeddata', () => {
                this.video.play();
            });
        } catch (error) {
            console.error('Error accessing webcam:', error);
            this.feedbackOverlay.textContent = '❌ Cannot access webcam';
            this.feedbackOverlay.style.color = '#ff0000';
        }
    }

    async initializeHandTracking() {
        try {
            // Check if MediaPipe Hands is loaded
            if (typeof Hands === 'undefined') {
                throw new Error('MediaPipe Hands not loaded. Add script to HTML.');
            }

            // Initialize MediaPipe Hands
            this.handsDetector = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            this.handsDetector.setOptions({
                maxNumHands: 2,
                modelComplexity: 1,
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.5
            });

            this.handsDetector.onResults((results) => this.onHandsDetected(results));

            this.feedbackOverlay.textContent = '✓ Ready! Please calibrate';
            this.startTracking();
        } catch (error) {
            console.error('Error loading hand tracking:', error);
            this.feedbackOverlay.textContent = '❌ Hand tracking failed. Using TensorFlow fallback...';
            this.feedbackOverlay.style.color = '#ffaa00';
            // Fallback to TensorFlow Handpose if MediaPipe fails
            this.initializeTensorFlowHandpose();
        }
    }

    async initializeTensorFlowHandpose() {
        // Fallback for systems without MediaPipe
        try {
            if (typeof handpose === 'undefined') {
                throw new Error('Neither MediaPipe nor TensorFlow Handpose available');
            }
            
            await tf.setBackend('webgl');
            this.handModel = await handpose.load();
            this.feedbackOverlay.textContent = '✓ TensorFlow Ready! Please calibrate';
            this.startTrackingTF();
        } catch (error) {
            console.error('Fallback also failed:', error);
            this.feedbackOverlay.textContent = '❌ No hand tracking available';
            this.feedbackOverlay.style.color = '#ff0000';
        }
    }

    startTracking() {
        // MediaPipe Hands tracking loop
        const detectFrame = async () => {
            if (this.video.readyState === 4) {
                await this.handsDetector.send({ image: this.video });
            }
            this.animationFrameId = requestAnimationFrame(detectFrame);
        };
        detectFrame();
    }

    async startTrackingTF() {
        // TensorFlow Handpose tracking loop (fallback)
        const detectHands = async () => {
            const predictions = await this.handModel.estimateHands(this.video, true);
            
            // Convert TF format to MediaPipe-like format
            const results = {
                multiHandLandmarks: predictions.map(p => p.landmarks.map(lm => ({x: lm[0]/640, y: lm[1]/480, z: lm[2]}))),
                multiHandedness: predictions.map((p, i) => ({
                    label: i === 0 ? 'Right' : 'Left'
                })),
                image: this.video
            };
            
            this.onHandsDetected(results);
            this.animationFrameId = requestAnimationFrame(detectHands);
        };
        detectHands();
    }

    onHandsDetected(results) {
        // Clear canvas and draw video
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(results.image, -this.canvas.width, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        if (!this.calibrated) {
            this.drawCalibrationHints();
            return;
        }

        // Draw calibration zone
        this.drawPlayingSurface();

        // Process detected hands
        if (results.multiHandLandmarks && results.multiHandedness) {
            const currentNotes = new Set();
            const handPositions = { left: [], right: [] };
            
            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                const handedness = results.multiHandedness[i].label;
                const hand = handedness === 'Right' ? 'left' : 'right'; // Video is mirrored
                
                this.drawHand(landmarks, hand);
                
                // Detect finger presses and map to notes
                const notes = this.detectFingerPresses(landmarks, hand);
                notes.forEach(note => {
                    currentNotes.add(note);
                    handPositions[hand].push(note.note - 21); // Store key indices
                });
            }

            // Update arm positions based on average hand position
            this.updateArmPositions(handPositions);
            
            // Update playing notes
            this.updatePlayingNotes(currentNotes);
        } else {
            // No hands detected - reset arm positions smoothly
            this.resetArmPositions();
        }

        // Update falling boxes
        this.updateTeacherBoxes();

        this.updateStatus(results);
    }

    drawHand(landmarks, handLabel) {
        // Draw hand skeleton
        const connections = [
            [0,1],[1,2],[2,3],[3,4], // Thumb
            [0,5],[5,6],[6,7],[7,8], // Index
            [0,9],[9,10],[10,11],[11,12], // Middle
            [0,13],[13,14],[14,15],[15,16], // Ring
            [0,17],[17,18],[18,19],[19,20], // Pinky
            [5,9],[9,13],[13,17] // Palm
        ];

        this.ctx.strokeStyle = handLabel === 'left' ? '#00ffff' : '#ff00ff';
        this.ctx.lineWidth = 2;

        // Draw connections
        connections.forEach(([start, end]) => {
            const startPoint = this.landmarkToCanvas(landmarks[start]);
            const endPoint = this.landmarkToCanvas(landmarks[end]);
            this.ctx.beginPath();
            this.ctx.moveTo(startPoint.x, startPoint.y);
            this.ctx.lineTo(endPoint.x, endPoint.y);
            this.ctx.stroke();
        });

        // Draw landmarks
        landmarks.forEach((landmark, index) => {
            const point = this.landmarkToCanvas(landmark);
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
            
            // Fingertips get special highlight
            if ([4,8,12,16,20].includes(index)) {
                this.ctx.fillStyle = '#ffff00';
                this.ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
            } else {
                this.ctx.fillStyle = handLabel === 'left' ? '#00ffff' : '#ff00ff';
            }
            this.ctx.fill();
        });
    }

    landmarkToCanvas(landmark) {
        return {
            x: this.canvas.width - (landmark.x * this.canvas.width),
            y: landmark.y * this.canvas.height,
            z: landmark.z || 0
        };
    }

    detectFingerPresses(landmarks, hand) {
        const notes = [];
        const fingerTips = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky
        const fingerNames = ['index', 'middle', 'ring', 'pinky'];
        
        fingerTips.forEach((tipIndex, i) => {
            const tip = this.landmarkToCanvas(landmarks[tipIndex]);
            const pip = this.landmarkToCanvas(landmarks[tipIndex - 2]); // Proximal joint
            
            // Check if finger is in playing zone
            if (!this.isInPlayingZone(tip)) return;
            
            // Check if finger is pressing down (z-axis and relative to PIP)
            const isPressingDown = tip.z < this.config.zThreshold && tip.y > pip.y;
            
            if (isPressingDown) {
                const keyIndex = this.mapPositionToKey(tip.x, hand);
                if (keyIndex !== null) {
                    const midiNote = this.keyIndexToMidiNote(keyIndex);
                    const velocity = this.calculateVelocity(tip.z);
                    notes.push({ note: midiNote, velocity, finger: fingerNames[i], hand });
                }
            }
        });
        
        return notes;
    }

    isInPlayingZone(point) {
        const margin = 20;
        return point.x >= this.surface.leftEdge - margin &&
               point.x <= this.surface.rightEdge + margin &&
               point.y >= this.surface.topEdge - margin &&
               point.y <= this.surface.bottomEdge + margin;
    }

    mapPositionToKey(x, hand) {
        // Map X position to key within octave range
        const totalWidth = this.surface.rightEdge - this.surface.leftEdge;
        const keysPerHand = 12; // One octave per hand
        
        let normalizedX;
        if (hand === 'left') {
            // Left hand plays lower octave (left side)
            normalizedX = (x - this.surface.leftEdge) / (totalWidth / 2);
            if (normalizedX < 0 || normalizedX > 1) return null;
            return Math.floor(normalizedX * keysPerHand);
        } else {
            // Right hand plays higher octave (right side)
            const midPoint = this.surface.leftEdge + totalWidth / 2;
            normalizedX = (x - midPoint) / (totalWidth / 2);
            if (normalizedX < 0 || normalizedX > 1) return null;
            return Math.floor(normalizedX * keysPerHand) + keysPerHand;
        }
    }

    keyIndexToMidiNote(keyIndex) {
        // Convert key index (0-23 for 2 octaves) to MIDI note number
        const baseNote = 21 + (this.config.octaveStart * 12); // Piano starts at MIDI 21 (A0)
        return baseNote + keyIndex;
    }

    calculateVelocity(z) {
        // Map Z-depth to MIDI velocity (0-127)
        // More negative Z = harder press
        const normalized = Math.max(0, Math.min(1, (this.config.zThreshold - z) / 0.3));
        return Math.floor(normalized * 100) + 27; // Range: 27-127
    }

    updateArmPositions(handPositions) {
        // Check if required globals are available
        if (typeof mixamorig === 'undefined' || typeof rigHelper === 'undefined' || 
            typeof pianistPosition === 'undefined' || typeof setHandById !== 'function') {
            return;
        }

        // Update arm positions for each hand based on average key position
        ['left', 'right'].forEach(hand => {
            const track = hand === 'left' ? 1 : 0;
            
            if (handPositions[hand].length > 0) {
                // Calculate average position
                const avgKeyIndex = Math.floor(
                    handPositions[hand].reduce((sum, k) => sum + k, 0) / handPositions[hand].length
                );
                
                // Update rigHelper.average for finger animations
                const helper = track === 0 ? rigHelper.right : rigHelper.left;
                helper.average = avgKeyIndex;
                
                // Smoothly animate arm position (LIKE PLAYER MODE)
                this.animateArmPositionSmooth(avgKeyIndex, track);
                
                // Store current position
                this.currentArmPositions[hand] = avgKeyIndex;
            }
        });
    }

    animateArmPositionSmooth(keyIndex, track) {
        // Replicate the exact logic from player mode's setHandById function
        if (typeof mixamorig === 'undefined' || typeof rigHelper === 'undefined' || 
            typeof pianistPosition === 'undefined') {
            return;
        }
        
        const modificator = track === 0 ? 1 : -1;
        const helper = track === 0 ? rigHelper.right : rigHelper.left;
        
        // Convert keyIndex to position ID (EXACT SAME AS PLAYER MODE)
        let positionId = track === 0 ? (keyIndex - 88 + 1) * -1 : keyIndex + 1;
        
        if (positionId < 0 || positionId >= pianistPosition.length) {
            return;
        }
        
        const position = track === 0 ? "Right" : "Left";
        
        // Get target posture from pianistPosition array
        const posture = pianistPosition[positionId];
        
        // Smooth transition to target position (INCREASED SPEED FOR TEACHER MODE)
        const speed = this.config.armTransitionSpeed; // Use config value
        
        for (const [key, value] of Object.entries(posture)) {
            const modifiedKey = key.replace("Position", position);
            if (mixamorig[modifiedKey]) {
                const current = mixamorig[modifiedKey].rotation;
                const targetX = value.x;
                const targetY = value.y * modificator;
                const targetZ = value.z * modificator;
                
                // Smooth interpolation (EXACT SAME AS PLAYER MODE BUT WITH CONFIGURABLE SPEED)
                current.x += (targetX - current.x) * speed;
                current.y += (targetY - current.y) * speed;
                current.z += (targetZ - current.z) * speed;
            }
        }
    }

    resetArmPositions() {
        // Smoothly return arms to rest position when no hands detected
        if (typeof mixamorig === 'undefined' || typeof rigHelper === 'undefined') {
            return;
        }

        const speed = this.config.armTransitionSpeed * 0.5; // Slower return
        
        // Reset to initial rig positions
        const resetTargets = {
            mixamorigRightArm: { x: 0, y: 1.5, z: 0 },
            mixamorigRightForeArm: { x: 0, y: 2, z: 0.3 },
            mixamorigRightHand: { x: -1.2, y: 0, z: 0.2 },
            mixamorigLeftArm: { x: 0, y: -1.5, z: 0 },
            mixamorigLeftForeArm: { x: 0, y: -2, z: 0 },
            mixamorigLeftHand: { x: -0.3, y: 0, z: -0.5 }
        };

        for (const [key, target] of Object.entries(resetTargets)) {
            if (mixamorig[key]) {
                const current = mixamorig[key].rotation;
                current.x += (target.x - current.x) * speed;
                current.y += (target.y - current.y) * speed;
                current.z += (target.z - current.z) * speed;
            }
        }
    }

    updatePlayingNotes(currentNotes) {
        const now = Date.now();
        
        // Start new notes
        currentNotes.forEach(noteData => {
            const noteKey = `${noteData.note}_${noteData.hand}_${noteData.finger}`;
            const lastTime = this.lastNoteTime[noteKey] || 0;
            
            if (!this.activeNotes.has(noteKey) && now - lastTime > this.config.debounceTime) {
                this.playNote(noteData.note, noteData.velocity, noteData.hand);
                this.activeNotes.add(noteKey);
                this.lastNoteTime[noteKey] = now;
                this.noteStartTimes.set(noteKey, now);
            }
        });
        
        // Stop old notes
        const currentNoteKeys = new Set(Array.from(currentNotes).map(n => 
            `${n.note}_${n.hand}_${n.finger}`
        ));
        
        this.activeNotes.forEach(noteKey => {
            if (!currentNoteKeys.has(noteKey)) {
                const note = parseInt(noteKey.split('_')[0]);
                const startTime = this.noteStartTimes.get(noteKey) || now;
                const duration = (now - startTime) / 1000; // seconds
                
                this.stopNote(note, duration);
                this.activeNotes.delete(noteKey);
                this.noteStartTimes.delete(noteKey);
            }
        });
    }

    playNote(midiNote, velocity, hand) {
        // Trigger MIDI note
        const track = hand === 'left' ? 1 : 0; // Left hand = track 1, Right = track 0
        
        if (typeof MIDI !== 'undefined' && MIDI.noteOn) {
            MIDI.noteOn(0, midiNote, velocity, 0);
        }
        
        // Trigger visual feedback on piano
        const keyIndex = midiNote - 21;
        if (keyIndex >= 0 && keyIndex < 88) {
            if (typeof setKey === 'function' && typeof pianoKeys !== 'undefined') {
                setKey(keyIndex, true, track);
            }
            
            // Create falling box (SAME AS PLAYER MODE)
            this.createTeacherBox(keyIndex, velocity / 127, track);
            
            // Update notesState for finger animation (CRITICAL FOR FINGER ANIMATION)
            if (typeof notesState !== 'undefined') {
                notesState[track][keyIndex] = true;
                
                // Animate the 3D model fingers (CALL THE SAME FUNCTION AS PLAYER MODE)
                if (typeof animateFingers === 'function' && typeof rigHelper !== 'undefined' && 
                    typeof mixamorig !== 'undefined' && typeof settings !== 'undefined') {
                    animateFingers(notesState, rigHelper, mixamorig, track, settings["Animate Fingers"]);
                }
            }
        }
    }

    stopNote(midiNote, duration) {
        // Release MIDI note
        if (typeof MIDI !== 'undefined' && MIDI.noteOff) {
            MIDI.noteOff(0, midiNote, 0);
        }
        
        // Release visual feedback
        const keyIndex = midiNote - 21;
        if (keyIndex >= 0 && keyIndex < 88) {
            if (typeof setKey === 'function') {
                setKey(keyIndex, false, 0);
                setKey(keyIndex, false, 1);
            }
            
            // Update notesState to release fingers
            if (typeof notesState !== 'undefined') {
                notesState[0][keyIndex] = false;
                notesState[1][keyIndex] = false;
                
                // Re-animate fingers to show release
                if (typeof animateFingers === 'function' && typeof rigHelper !== 'undefined' && 
                    typeof mixamorig !== 'undefined' && typeof settings !== 'undefined') {
                    animateFingers(notesState, rigHelper, 0, settings["Animate Fingers"]);
                    animateFingers(notesState, rigHelper, 1, settings["Animate Fingers"]);
                }
            }
        }
    }

    createTeacherBox(keyIndex, velocityNormalized, track) {
        // Create falling note box EXACTLY like player mode
        if (typeof pianoKeys === 'undefined' || typeof scene === 'undefined' || typeof pianoFloor === 'undefined') {
            return;
        }

        const pianoKey = pianoKeys[keyIndex];
        if (!pianoKey) return;

        // Colors matching player mode EXACTLY
        const colorNote_w = [0x37a6f7, 0xd237c3];
        const colorNote_b = [0x2786ca, 0xa92b9d];
        
        let color = colorNote_b[track % 2];
        if (pianoKey.isWhite) {
            color = colorNote_w[track % 2];
        }

        const width = pianoKey.isWhite ? 0.8 : 0.4;
        const velocity = Math.max(velocityNormalized * 10, 0.5); // Box height based on velocity
        
        const geometry = new THREE.BoxGeometry(width, 1, 1);
        const material = new THREE.MeshBasicMaterial({ 
            color: color, 
            transparent: true, 
            opacity: 1, 
            side: THREE.DoubleSide 
        });
        const edges = new THREE.EdgesGeometry(geometry);

        let box = new THREE.Mesh(geometry, material);
        let line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));

        box.scale.y = velocity;
        line.scale.y = velocity;
        
        // Start position above the piano
        const startHeight = 50; // Height above piano
        box.position.y = pianoFloor + startHeight;
        box.position.x = pianoKey.box.position.x;
        line.position.y = pianoFloor + startHeight;
        line.position.x = pianoKey.box.position.x;
        
        if (pianoKey.isWhite) {
            box.position.z = 2;
            line.position.z = 2;
        } else {
            box.position.z = pianoKey.box.position.z;
            line.position.z = pianoKey.box.position.z;
        }
        
        box.castShadow = true;
        scene.add(line);
        scene.add(box);
        
        this.teacherBoxes.push({ 
            box: box, 
            line: line, 
            velocity: velocity,
            startY: pianoFloor + startHeight,
            targetY: pianoFloor,
            createdAt: Date.now()
        });
    }

    updateTeacherBoxes() {
        // Animate falling boxes EXACTLY like player mode
        if (typeof scene === 'undefined' || typeof pianoFloor === 'undefined') return;

        for (let i = this.teacherBoxes.length - 1; i >= 0; i--) {
            const boxData = this.teacherBoxes[i];
            const elapsed = (Date.now() - boxData.createdAt) / 1000; // seconds
            
            // Fall animation - matching player mode speed
            const fallDuration = 0.6; // seconds to fall
            const progress = Math.min(elapsed / fallDuration, 1);
            
            const currentY = boxData.startY - (boxData.startY - boxData.targetY) * progress;
            boxData.box.position.y = currentY;
            boxData.line.position.y = currentY;
            
            // Compression effect when reaching piano (like player mode)
            if (currentY < pianoFloor + boxData.velocity / 2) {
                let positionDiff = (pianoFloor - currentY + boxData.velocity / 2);
                let scaleDiff = boxData.velocity - (pianoFloor + boxData.velocity / 2 - currentY);
                
                boxData.box.position.y += positionDiff;
                boxData.line.position.y += positionDiff;
                boxData.box.scale.y = Math.max(scaleDiff, 0.1);
                boxData.line.scale.y = Math.max(scaleDiff, 0.1);
            }
            
            // Remove box after it's compressed or falls below piano
            if (elapsed > fallDuration + 0.2 || currentY < pianoFloor - boxData.velocity) {
                scene.remove(boxData.box);
                scene.remove(boxData.line);
                this.teacherBoxes.splice(i, 1);
            }
            
            // Show/hide based on settings (like player mode)
            if (typeof settings !== 'undefined') {
                const shouldShow = settings["Show notes"];
                boxData.box.visible = shouldShow;
                boxData.line.visible = shouldShow;
            }
        }
    }

    drawPlayingSurface() {
        if (!this.calibrated) return;
        
        // Draw playing zone rectangle
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([10, 5]);
        this.ctx.strokeRect(
            this.surface.leftEdge,
            this.surface.topEdge,
            this.surface.rightEdge - this.surface.leftEdge,
            this.surface.bottomEdge - this.surface.topEdge
        );
        
        // Draw center divider
        const centerX = (this.surface.leftEdge + this.surface.rightEdge) / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, this.surface.topEdge);
        this.ctx.lineTo(centerX, this.surface.bottomEdge);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Labels
        this.ctx.fillStyle = '#00ff00';
        this.ctx.font = '16px monospace';
        this.ctx.fillText('LEFT HAND', this.surface.leftEdge + 10, this.surface.topEdge + 20);
        this.ctx.fillText('RIGHT HAND', centerX + 10, this.surface.topEdge + 20);
    }

    drawCalibrationHints() {
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        this.ctx.fillRect(50, 50, this.canvas.width - 100, this.canvas.height - 100);
        
        this.ctx.fillStyle = '#ffff00';
        this.ctx.font = 'bold 20px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Click "Calibrate Teacher"', this.canvas.width / 2, this.canvas.height / 2 - 20);
        this.ctx.fillText('to define playing area', this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    calibrate() {
        let clicks = [];
        this.feedbackOverlay.textContent = '📍 Click TOP-LEFT corner of playing surface';
        this.feedbackOverlay.style.color = '#ffff00';
        
        const handleClick = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
            
            clicks.push({ x, y });
            
            // Draw click marker
            this.ctx.fillStyle = '#ff0000';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 8, 0, 2 * Math.PI);
            this.ctx.fill();
            
            if (clicks.length === 1) {
                this.feedbackOverlay.textContent = '📍 Click BOTTOM-RIGHT corner of playing surface';
            } else if (clicks.length === 2) {
                this.surface.leftEdge = Math.min(clicks[0].x, clicks[1].x);
                this.surface.rightEdge = Math.max(clicks[0].x, clicks[1].x);
                this.surface.topEdge = Math.min(clicks[0].y, clicks[1].y);
                this.surface.bottomEdge = Math.max(clicks[0].y, clicks[1].y);
                
                this.calibrated = true;
                this.feedbackOverlay.textContent = '✓ Calibrated! Play air piano!';
                this.feedbackOverlay.style.color = '#00ff00';
                
                this.canvas.removeEventListener('click', handleClick);
            }
        };
        
        this.canvas.addEventListener('click', handleClick);
    }

    updateStatus(results) {
        const handsDetected = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
        const activeNotesCount = this.activeNotes.size;
        const boxesCount = this.teacherBoxes.length;
        const status = `Hands: ${handsDetected} | Notes: ${activeNotesCount} | Boxes: ${boxesCount} | ${this.calibrated ? '✓ Calibrated' : '⚠ Not Calibrated'}`;
        this.statusIndicator.textContent = status;
    }

    dispose() {
        // Clean up resources
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        
        if (this.handsDetector) {
            this.handsDetector.close();
        }
        
        // Remove all teacher boxes from scene
        if (typeof scene !== 'undefined') {
            this.teacherBoxes.forEach(boxData => {
                scene.remove(boxData.box);
                scene.remove(boxData.line);
            });
        }
        this.teacherBoxes = [];
        
        if (this.container && this.container.parentElement) {
            this.container.remove();
        }
        
        // Release all active notes
        this.activeNotes.forEach(noteKey => {
            const note = parseInt(noteKey.split('_')[0]);
            this.stopNote(note, 0);
        });
        
        // Reset notesState
        if (typeof notesState !== 'undefined') {
            for (let i = 0; i < 88; i++) {
                notesState[0][i] = false;
                notesState[1][i] = false;
            }
        }
    }
}

export { TeacherView };