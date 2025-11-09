import * as THREE from './three/three.module.js';
import { OrbitControls } from './three/OrbitControls.js';
import { GUI } from './three/dat.gui.module.js';
import { GLTFLoader } from './three/loaders/GLTFLoader.js';
import { DRACOLoader } from './three/loaders/DRACOLoader.js';
import { Lensflare, LensflareElement } from './three/Lensflare.js';
import { animateFingers } from './util/fingers.js';
import { TeacherView } from './teacherView.js';
import { DualCameraView } from './dualCameraView.js';




var camera, controls, scene, renderer, pianoKeys, player, futurBoxs = [], pianoFloor = 21, ground;
var pianistModel, skeleton, pianoModel, panel, settings, lights = [];
var t1 = Date.now(), previouscurrentTime = -1, currentTime = 0, clock = new THREE.Clock();
var mixamorig, rigHelper, headTarget = 0, futurAverage, headTargetTime, headStarty, lastBoxRefresh = 0;
var notesState = [new Array(88), new Array(88)];
let teacherView;
let dualCameraView;
// Note History Tracking
const noteHistory = [];
const MAX_HISTORY = 50;

var notesState = [new Array(88), new Array(88)];

let airPianoController = null;  // ADD THIS LINE
document.getElementById("body").addEventListener("drop", dropHandler);
document.getElementById("body").addEventListener("dragover", dragOverHandler);

// generate a piano and add it to scene if scene is specified
function generatePiano(scene = undefined, opacity = 1) {
    const piano_patern = [true, false, true, true, false, true, false, true, true, false, true, false];

    const whiteGeometry = new THREE.BoxGeometry(1, 1, 6);
    const whiteMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: opacity, side: THREE.DoubleSide });
    const whiteEdges = new THREE.EdgesGeometry(whiteGeometry);
    const blackGeometry = new THREE.BoxGeometry(0.6, 1, 4);
    const blackMaterial = new THREE.MeshPhongMaterial({ color: 0x000000, transparent: true, opacity: opacity, side: THREE.DoubleSide });
    const blackEdges = new THREE.EdgesGeometry(blackGeometry);

    let modificator = 25;
    let keys = [];
    for (let n = 0; n < 88; n++) {
        let box, line, color;
        if (piano_patern[n % 12]) { //white key
            box = new THREE.Mesh(whiteGeometry, whiteMaterial);
            color = 0x000000;
            line = new THREE.LineSegments(whiteEdges, new THREE.LineBasicMaterial({ color: color }));
            box.position.x = n - modificator;
            line.position.x = n - modificator;
            box.position.y = pianoFloor;
            line.position.y = pianoFloor;
        }
        else {
            box = new THREE.Mesh(blackGeometry, blackMaterial);
            color = 0x0000005;
            line = new THREE.LineSegments(blackEdges, new THREE.LineBasicMaterial({ color: color }));
            box.position.x = n - modificator - 0.5;
            box.position.y = 0.4 + pianoFloor;
            box.position.z = -1;
            line.position.x = n - modificator - 0.5;
            line.position.y = 0.4 + pianoFloor;
            line.position.z = -1;
            modificator += 1;
        }
        if (scene != undefined) {
            scene.add(box);
            scene.add(line);
        }
        keys[n] = { box: box, line: line, isWhite: piano_patern[n % 12], isOn: false, color: color };
    }
    return keys;
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcce0ff);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 30000);
    camera.position.set(-30, 100, 100);

    // controls

    controls = new OrbitControls(camera, renderer.domElement);

    //controls.addEventListener( 'change', render ); // call this only in static scenes (i.e., if there is no animation loop)

    controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
    controls.dampingFactor = 0.05;

    controls.screenSpacePanning = false;

    controls.minDistance = 0;
    controls.maxDistance = 500;

    controls.maxPolarAngle = Math.PI / 2;
    // ground
    let loader = new THREE.TextureLoader();
    let groundTexture = loader.load('./images/ground.png');
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(1, 1);
    groundTexture.anisotropy = 16;
    groundTexture.opacity = 0.2;
    groundTexture.encoding = THREE.sRGBEncoding;

    let groundMaterial = new THREE.MeshPhongMaterial({ map: groundTexture, transparent: true });

    ground = new THREE.Mesh(new THREE.PlaneBufferGeometry(250, 250), groundMaterial);
    ground.rotation.x = - Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.set(0, -10, -50);
    ground.visible = false;
    scene.add(ground);
    // piano Keyboard

    pianoKeys = generatePiano(scene);

    // piano model
    let dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./js/draco/gltf/');

    loader = new GLTFLoader();

    loader.setDRACOLoader(dracoLoader);
    loader.load('./model/GrandPianoRecoloredWKM.glb', function (gltf) {
        document.getElementById("pianoLoading").innerHTML = "";
        pianoModel = gltf.scene;
    // Hardcoded defaults (tweak via GUI below)
    // Updated defaults per user alignment: x=-2.1, y=-11, z=-49, rotY=-1.525, scale=40
    pianoModel.position.set(-2.1, -11, -49);
    pianoModel.scale.set(40, 40, 40);
    pianoModel.rotation.set(0, -1.525, 0);
        scene.add(pianoModel);

        let pianoFolder = panel.addFolder('Piano Model');
        pianoFolder.add(settings, 'Show piano model').onChange(showPiano);

        // Expose live alignment controls to match generated keyboard (keys around z≈0)
        // These controls do not change logic; they only let you nudge transforms at runtime.
        try {
            // Position
            pianoFolder.add(pianoModel.position, 'x', -150, 150, 0.1).name('Position X');
            pianoFolder.add(pianoModel.position, 'y', -150 + pianoFloor, 150 + pianoFloor, 0.1).name('Position Y');
            pianoFolder.add(pianoModel.position, 'z', -150, 150, 0.1).name('Position Z');

            // Rotation (Yaw)
            pianoFolder.add(pianoModel.rotation, 'y', -Math.PI, Math.PI, 0.001).name('Rotation Y');

            // Uniform scale
            const pianoScaleProxy = { scale: pianoModel.scale.x };
            pianoFolder.add(pianoScaleProxy, 'scale', 1, 100, 0.1).name('Uniform Scale').onChange(v => {
                pianoModel.scale.set(v, v, v);
            });

            // Quick helper to roughly place the piano under the generated keys
            pianoFolder.add({ alignUnderKeys: () => {
                // Generated keys live around z≈0; start with that plane
                pianoModel.position.z = 0; // bring under keys plane
                // Keep current X, but you can nudge with the GUI
                // Face keys: -90° is usually correct for many GLB pianos
                pianoModel.rotation.y = -Math.PI / 2;
                // Height: bring top around pianoFloor; Y may require small manual nudge
                // This keeps existing offset but allows quick re-application
                pianoModel.position.y = -30.8 + pianoFloor;
            } }, 'alignUnderKeys').name('↘ Align Under Keys');

            // Optional: expose for console fine-tuning
            window.pianoModel = pianoModel;
        } catch (e) { console.warn('Piano GUI controls unavailable:', e); }

        pianoModel.getObjectByName('Bench_Low001').position.y += 0.03;
        pianoModel.getObjectByName('Fallboard_Low').rotation.z = -1.7;
        pianoModel.getObjectByName('PropStickShort_Low').rotation.x = 0.95;
        pianoModel.getObjectByName('TopBoardRear_Low001').rotation.x = -0.63;

        openPiano(true);

    }, function (xhr) {
        document.getElementById("pianoLoading").innerHTML = "Grand Piano 3D Model loaded at " + (xhr.loaded / 16124588 * 100).toFixed(0) + "%"; //xhr.total is not working remotly
        if ((xhr.loaded / 16124588 * 100).toFixed(0) > 10) {
            $('#status').fadeOut('slow'); // will first fade out the loading animation
            $('#preloader').delay(350).fadeOut('slow'); // will fade out the white DIV that covers the website.
            $('body').delay(350).css({
                'overflow': 'visible'
            });
        }
        else {
            let percent = (xhr.loaded / 16124588 * 1000).toFixed(0);
            percent > 100 ? percent = 100 : percent = percent;
            document.getElementsByClassName("preloader-p")[0].innerHTML = "Loading... " + percent + "%";
        }
    }, function (e) {
        $('#status').fadeOut('slow'); // will first fade out the loading animation
        $('#preloader').delay(350).fadeOut('slow'); // will fade out the white DIV that covers the website.
        $('body').delay(350).css({
            'overflow': 'visible'
        });
        console.error(e);

    });
    //pianist model 
    loader.load('./model/Pianist.glb', function (gltf) {

        pianistModel = gltf.scene;
        pianistModel.scale.set(35, 35, 35);
        pianistModel.position.set(1, -40 + pianoFloor, 16);
        pianistModel.rotation.set(0, 3.15, 0);

        scene.add(pianistModel);

        pianistModel.traverse(function (object) {
            if (object.isMesh)
                object.castShadow = true;
        });

        skeleton = new THREE.SkeletonHelper(pianistModel);
        skeleton.visible = false;
        rigInit();
        skeleton.material.linewidth = 18;
        scene.add(skeleton);
        //panel 
        let pianistFolder = panel.addFolder('Pianist Model');
        pianistFolder.add(settings, 'Show model').onChange(showPianist);
        pianistFolder.add(settings, 'Show skeleton').onChange(showSkeleton);
        pianistFolder.add(settings, 'Animate Fingers');

    });

    // lights
    let textureLoader = new THREE.TextureLoader();

    let textureFlare0 = textureLoader.load('./images/lensflare0.png');
    let ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    lights[0] = addLight(305.73, 100, 69.8);
    lights[1] = addLight(205, 92, 59);
    lights[2] = addLight(305.73, 100, 69.8);
    lights[3] = addLight(205, 92, 59);

    function addLight(h, s, l) {

        let light = new THREE.PointLight(0xffffff, 5, 150);
        light.color.setHSL(h / 360, s / 100, l / 100);

        var lensflare = new Lensflare();
        lensflare.addElement(new LensflareElement(textureFlare0, 60, 0, light.color));

        light.add(lensflare);
        scene.add(light)
        return light;
    }

    // skybox
    let materialArray = [];
    let texture_ft = new THREE.TextureLoader().load('./images/corona_ft.png');
    let texture_bk = new THREE.TextureLoader().load('./images/corona_bk.png');
    let texture_up = new THREE.TextureLoader().load('./images/corona_up.png');
    let texture_dn = new THREE.TextureLoader().load('./images/corona_dn.png');
    let texture_rt = new THREE.TextureLoader().load('./images/corona_rt.png');
    let texture_lf = new THREE.TextureLoader().load('./images/corona_lf.png');

    materialArray.push(new THREE.MeshBasicMaterial({ map: texture_ft }));
    materialArray.push(new THREE.MeshBasicMaterial({ map: texture_bk }));
    materialArray.push(new THREE.MeshBasicMaterial({ map: texture_up }));
    materialArray.push(new THREE.MeshBasicMaterial({ map: texture_dn }));
    materialArray.push(new THREE.MeshBasicMaterial({ map: texture_rt }));
    materialArray.push(new THREE.MeshBasicMaterial({ map: texture_lf }));

    for (let i = 0; i < 6; i++)
        materialArray[i].side = THREE.BackSide;

    let skyboxGeo = new THREE.BoxGeometry(5000, 5000, 5000);
    let skybox = new THREE.Mesh(skyboxGeo, materialArray);
    scene.add(skybox);

    window.addEventListener('resize', onWindowResize, true);

}

function onWindowResize() {
    camera.quaternion._x = 0
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}

function animate() {

    requestAnimationFrame(animate);

    render();

}

function openPiano(init = false) {
    if (init) {
        openPiano.start = clock.getElapsedTime() + 1;
        openPiano.targetTime = openPiano.start + 4;
    }
    if (openPiano.start == undefined)
        return;
    const t = clock.getElapsedTime();
    const r1 = (t - openPiano.start) / (openPiano.targetTime - openPiano.start);
    const delay = 1.5;
    const r2 = (t - (openPiano.start + delay)) / ((openPiano.targetTime) - (openPiano.start + delay));

    if (r1 <= 1 && r1 >= 0) {
        pianoModel.getObjectByName('TopBoardRear_Low001').rotation.x = r1 * (0 - -0.63) + -0.63;
        pianoModel.getObjectByName('Fallboard_Low').rotation.z = r1 * (0.1 - -1.7) + -1.7;
    }
    if (r2 <= 1 && r2 >= 0) {
        pianoModel.getObjectByName('PropStickShort_Low').rotation.x = r2 * (0 - 0.95) + 0.95;
    }
    // fix error when the user switch tab during the loading
    if (t > openPiano.start + 4) { 
        pianoModel.getObjectByName('TopBoardRear_Low001').rotation.x = 0;
        pianoModel.getObjectByName('Fallboard_Low').rotation.z = 0.1;
        pianoModel.getObjectByName('PropStickShort_Low').rotation.x = 0;
    }
}

// Note History Functions
function logNoteToHistory(midiNoteNumber, velocity) {
    const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const octave = Math.floor((midiNoteNumber - 12) / 12);
    const noteName = noteNames[midiNoteNumber % 12] + octave;
    
    const timestamp = new Date().toLocaleTimeString();
    
    const noteItem = {
        name: noteName,
        midi: midiNoteNumber,
        velocity: velocity,
        time: timestamp
    };
    
    noteHistory.unshift(noteItem);
    if (noteHistory.length > MAX_HISTORY) noteHistory.pop();
    
    updateNoteHistoryDOM();
}

function updateNoteHistoryDOM() {
    const listEl = document.getElementById('note-history-list');
    if (!listEl) return;
    
    // Only add new notes instead of rebuilding entire list
    const currentCount = listEl.children.length;
    const newNotes = noteHistory.slice(0, noteHistory.length - currentCount);
    
    // Insert new notes at the top
    newNotes.reverse().forEach(note => {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'note-item';
        noteDiv.innerHTML = `
            <span class="note-name">${note.name}</span>
            <span class="note-meta">MIDI ${note.midi} • ${note.time}</span>
        `;
        listEl.insertBefore(noteDiv, listEl.firstChild);
    });
    
    // Remove excess notes from bottom
    while (listEl.children.length > MAX_HISTORY) {
        listEl.removeChild(listEl.lastChild);
    }
}
// Recording & Playback System
let recordedNotes = [];
let isRecording = false;
let recordingStartTime = 0;
let isPlayingRecording = false;
let playbackTimeouts = [];

function startRecording() {
    recordedNotes = [];
    isRecording = true;
    recordingStartTime = performance.now();
    console.log('🔴 Recording started...');
    updateRecordingStatus('🔴 Recording...');
}

function stopRecording() {
    isRecording = false;
    console.log('⏹️ Recording stopped. Captured', recordedNotes.length, 'notes');
    updateRecordingStatus(`✅ Recorded ${recordedNotes.length} notes`);
    return recordedNotes;
}

function playRecording() {
    if (recordedNotes.length === 0) {
        alert('No recording to play! Record something first.');
        return;
    }
    
    if (isPlayingRecording) {
        stopPlayback();
        return;
    }
    
    isPlayingRecording = true;
    updateRecordingStatus('▶️ Playing recording...');
    console.log('▶️ Playing recording...');
    
    // Clear any existing timeouts
    playbackTimeouts.forEach(t => clearTimeout(t));
    playbackTimeouts = [];
    
    const startTime = performance.now();
    
    recordedNotes.forEach(note => {
        const noteOnTimeout = setTimeout(() => {
            const pianoKey = note.midiNote - 21;
            if (pianoKey >= 0 && pianoKey < 88) {
                // Trigger the 3D piano
                MIDI.noteOn(0, note.midiNote, note.velocity, 0);
                setKey(pianoKey, true, 0);
                
                // Animate the pianist
                if (rigHelper) {
                    rigHelper.right.average = pianoKey;
                }
                if (settings["Animate Fingers"] && notesState && mixamorig) {
                    notesState[0][pianoKey] = true;
                    animateFingers(notesState, rigHelper, mixamorig, 0, true);
                }
            }
        }, note.timestamp);
        
        const noteOffTimeout = setTimeout(() => {
            const pianoKey = note.midiNote - 21;
            if (pianoKey >= 0 && pianoKey < 88) {
                MIDI.noteOff(0, note.midiNote, 0);
                setKey(pianoKey, false, 0);
                
                if (settings["Animate Fingers"] && notesState && mixamorig) {
                    notesState[0][pianoKey] = false;
                    animateFingers(notesState, rigHelper, mixamorig, 0, true);
                }
            }
        }, note.timestamp + note.duration);
        
        playbackTimeouts.push(noteOnTimeout, noteOffTimeout);
    });
    
    // Mark playback as complete
    const totalDuration = recordedNotes[recordedNotes.length - 1].timestamp + 
                         recordedNotes[recordedNotes.length - 1].duration + 500;
    const endTimeout = setTimeout(() => {
        isPlayingRecording = false;
        updateRecordingStatus(`✅ Recorded ${recordedNotes.length} notes`);
        console.log('✅ Playback complete');
    }, totalDuration);
    
    playbackTimeouts.push(endTimeout);
}

function stopPlayback() {
    playbackTimeouts.forEach(t => clearTimeout(t));
    playbackTimeouts = [];
    isPlayingRecording = false;
    updateRecordingStatus(`✅ Recorded ${recordedNotes.length} notes`);
    console.log('⏹️ Playback stopped');
}

function clearRecording() {
    recordedNotes = [];
    isRecording = false;
    isPlayingRecording = false;
    playbackTimeouts.forEach(t => clearTimeout(t));
    playbackTimeouts = [];
    updateRecordingStatus('Ready to record');
    console.log('🗑️ Recording cleared');
}

function updateRecordingStatus(message) {
    const statusEl = document.getElementById('recording-status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

// Hook into DualCameraView to record notes
let lastNoteOnTime = new Map(); // Track when notes started

function recordNote(midiNote, velocity, isNoteOn) {
    if (!isRecording) return;
    
    const currentTime = performance.now() - recordingStartTime;
    
    if (isNoteOn) {
        // Record note start time
        lastNoteOnTime.set(midiNote, currentTime);
    } else {
        // Calculate duration and save the note
        const startTime = lastNoteOnTime.get(midiNote);
        if (startTime !== undefined) {
            const duration = currentTime - startTime;
            recordedNotes.push({
                midiNote: midiNote,
                velocity: velocity,
                timestamp: startTime,
                duration: duration
            });
            lastNoteOnTime.delete(midiNote);
        }
    }
}

// Expose globally
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.playRecording = playRecording;
window.clearRecording = clearRecording;
window.recordNote = recordNote;
function rigInit() {
    pianistModel.getObjectByName('mixamorigLeftUpLeg').rotation.x = -1.1;
    pianistModel.getObjectByName('mixamorigRightUpLeg').rotation.x = -1.1;
    pianistModel.getObjectByName('mixamorigRightLeg').rotation.x = 1.2;
    pianistModel.getObjectByName('mixamorigLeftLeg').rotation.x = 1.2;
    pianistModel.getObjectByName('mixamorigSpine2').rotation.x = 0.4;
    pianistModel.getObjectByName('mixamorigLeftHandThumb1').rotation.z = +0.4;
    pianistModel.getObjectByName('mixamorigRightHandThumb1').rotation.z = -0.4;
    pianistModel.getObjectByName('mixamorigRightArm').rotation.x = 0;
    pianistModel.getObjectByName('mixamorigRightArm').rotation.z = 0;
    pianistModel.getObjectByName('mixamorigRightArm').rotation.y = 1.5;
    pianistModel.getObjectByName('mixamorigRightForeArm').rotation.y = 2;
    pianistModel.getObjectByName('mixamorigRightForeArm').rotation.z = 0.3;
    pianistModel.getObjectByName('mixamorigRightForeArm').rotation.x = 0;
    pianistModel.getObjectByName('mixamorigRightHand').rotation.x = -1.2;
    pianistModel.getObjectByName('mixamorigRightHand').rotation.z = 0.2;
    pianistModel.getObjectByName('mixamorigLeftArm').rotation.x = 0;
    pianistModel.getObjectByName('mixamorigLeftArm').rotation.z = 0;
    pianistModel.getObjectByName('mixamorigLeftArm').rotation.y = -1.5;
    pianistModel.getObjectByName('mixamorigLeftForeArm').rotation.y = -2;
    pianistModel.getObjectByName('mixamorigLeftForeArm').rotation.z = 0;
    pianistModel.getObjectByName('mixamorigLeftHand').rotation.z = -0.5;
    pianistModel.getObjectByName('mixamorigLeftHand').rotation.x = -0.3;
    pianistModel.getObjectByName('mixamorigRightFoot').rotation.x = -0.5;
    pianistModel.getObjectByName('mixamorigRightFoot').rotation.y = -0.2;

    mixamorig = {
        mixamorigRightArm: pianistModel.getObjectByName('mixamorigRightArm'),
        mixamorigRightForeArm: pianistModel.getObjectByName('mixamorigRightForeArm'),
        mixamorigRightHand: pianistModel.getObjectByName('mixamorigRightHand'),
        mixamorigLeftArm: pianistModel.getObjectByName('mixamorigLeftArm'),
        mixamorigLeftForeArm: pianistModel.getObjectByName('mixamorigLeftForeArm'),
        mixamorigLeftHand: pianistModel.getObjectByName('mixamorigLeftHand'),
        mixamorigHead: pianistModel.getObjectByName('mixamorigHead'),
        mixamorigHandThumb: [pianistModel.getObjectByName('mixamorigRightHandThumb1'), pianistModel.getObjectByName('mixamorigLeftHandThumb1')],
        mixamorigHandIndex: [pianistModel.getObjectByName('mixamorigRightHandIndex1'), pianistModel.getObjectByName('mixamorigLeftHandIndex1')],
        mixamorigHandMiddle: [pianistModel.getObjectByName('mixamorigRightHandMiddle1'), pianistModel.getObjectByName('mixamorigLeftHandMiddle1')],
        mixamorigHandRing: [pianistModel.getObjectByName('mixamorigRightHandRing1'), pianistModel.getObjectByName('mixamorigLeftHandRing1')],
        mixamorigHandPinky: [pianistModel.getObjectByName('mixamorigRightHandPinky1'), pianistModel.getObjectByName('mixamorigLeftHandPinky1')]
    }

    rigHelper = {
        mixamorigRightArm: { x: 0, y: 0, z: 0 },
        mixamorigRightForeArm: { x: 0, y: 0, z: 0 },
        mixamorigRightHand: { x: 0, y: 0, z: 0 },
        mixamorigLeftArm: { x: 0, y: 0, z: 0 },
        mixamorigLeftForeArm: { x: 0, y: 0, z: 0 },
        mixamorigLeftHand: { x: 0, y: 0, z: 0 },
        mixamorigHead: { x: 0, y: 0, z: 0 },
        right: {
            startTime: 0,
            targetTime: 0,
            mixamorigRightArm: 0,
            mixamorigRightForeArm: 0,
            mixamorigRightHand: 0,
            average: 0,
        },
        left: {
            startTime: 0,
            targetTime: 0,
            mixamorigLeftArm: 0,
            mixamorigLeftForeArm: 0,
            mixamorigLeftHand: 0,
            average: 0,
        }
    }
}

function transitionHead() {
    if (mixamorig == undefined || currentTime / 1000 < 1.5)
        return;
    if (headTarget == mixamorig.mixamorigHead.rotation.y || headTargetTime < currentTime / 1000) {
        if (Math.floor(Math.random() * 10) == 0 && MIDI.Player.playing) {
            if (futurAverage < 20)
                headTarget = 0.7;
            else if (futurAverage < 30)
                headTarget = 0.5;
            else if (futurAverage < 40)
                headTarget = 0.1;
            else if (futurAverage < 50)
                headTarget = -0.1;
            else if (futurAverage < 70)
                headTarget = -0.5;
            else
                headTarget = -0.7;
            headTargetTime = currentTime / 1000 + 0.5
            headStarty = mixamorig.mixamorigHead.rotation.y
        }
        else
            return;
    }
    if (headTargetTime < currentTime / 1000)
        return;
    if (!MIDI.Player.playing)
        return;
    const range = ((currentTime / 1000) - (headTargetTime - 0.5)) / 0.5;
    mixamorig.mixamorigHead.rotation.y = range * (headTarget - headStarty) + headStarty
    if (mixamorig.mixamorigHead.rotation.y > 0.7)
        mixamorig.mixamorigHead.rotation.y = 0.7;
    if (mixamorig.mixamorigHead.rotation.y < -0.7)
        mixamorig.mixamorigHead.rotation.y = -0.7;
}


function transitionHands(track) {
    if (mididata == undefined || rigHelper == undefined)
        return;
    let nextEvents = [];
    let futurEvents = mididata.filter(data => data.time > currentTime / 1000 && data.track == track && data.msg.subtype == "noteOn")
    let average = 0;
    let helper = track == 0 ? rigHelper.right : rigHelper.left;

    if (futurEvents.length > 0) {
        const timeReference = futurEvents[0].time
        nextEvents = futurEvents.filter(data => data.time >= timeReference && data.time <= timeReference + 0.3)
    }
    if (nextEvents.length <= 0 || nextEvents[0].time > currentTime / 1000 + 0.3)
        return;
    for (let i = 0; i < nextEvents.length; i++) {
        average += nextEvents[i].msg.noteNumber - 21
    }
    average = Math.floor(average / nextEvents.length);
    if (helper.average != average) {
        helper.startTime = currentTime / 1000
        helper.targetTime = nextEvents[0].time;
        if (track == 0) {
            helper.mixamorigRightArm = { x: mixamorig.mixamorigRightArm.rotation.x, y: mixamorig.mixamorigRightArm.rotation.y, z: mixamorig.mixamorigRightArm.rotation.z }
            helper.mixamorigRightForeArm = { x: mixamorig.mixamorigRightForeArm.rotation.x, y: mixamorig.mixamorigRightForeArm.rotation.y, z: mixamorig.mixamorigRightForeArm.rotation.z }
            helper.mixamorigRightHand = { x: mixamorig.mixamorigRightHand.rotation.x, y: mixamorig.mixamorigRightHand.rotation.y, z: mixamorig.mixamorigRightHand.rotation.z }

        }
        else {
            helper.mixamorigLeftArm = { x: mixamorig.mixamorigLeftArm.rotation.x, y: mixamorig.mixamorigLeftArm.rotation.y, z: mixamorig.mixamorigLeftArm.rotation.z }
            helper.mixamorigLeftForeArm = { x: mixamorig.mixamorigLeftForeArm.rotation.x, y: mixamorig.mixamorigLeftForeArm.rotation.y, z: mixamorig.mixamorigLeftForeArm.rotation.z }
            helper.mixamorigLeftHand = { x: mixamorig.mixamorigLeftHand.rotation.x, y: mixamorig.mixamorigLeftHand.rotation.y, z: mixamorig.mixamorigLeftHand.rotation.z }
        }
        helper.average = average;
    }
    futurAverage = average;
    setHandById(average, track)
}

function setHandById(id, track) {
    if (pianistModel == undefined)
        return;
    const modificator = track == 0 ? 1 : -1;
    let helper = track == 0 ? rigHelper.right : rigHelper.left;
    id = track == 0 ? (id - 88 + 1) * -1 : id + 1;
    const position = track == 0 ? "Right" : "Left";
    if (id > pianistPosition.length - 1)
        return;
    const posture = pianistPosition[id];
    const ctime = currentTime / 1000
    const r = (ctime - helper.startTime) / (helper.targetTime - helper.startTime);
    if (r > 1 || r < 0) {
        return;
    }
    for (const [key, value] of Object.entries(posture)) {
        const modifiedKey = key.replace("Position", position);
        let x, y, z;
        x = helper[modifiedKey].x;
        y = helper[modifiedKey].y;
        z = helper[modifiedKey].z;
        mixamorig[modifiedKey].rotation.x = r * (value.x - x) + x
        mixamorig[modifiedKey].rotation.y = r * (value.y * modificator - y) + y;
        mixamorig[modifiedKey].rotation.z = r * (value.z * modificator - z) + z;
    }
}

function render() {
    const t = clock.getElapsedTime();

    if (currentTime / 1000 > 3)
        document.getElementById("info").style.visibility = "hidden"
    else
        document.getElementById("info").style.visibility = "visible"

    lights[0].position.x = Math.sin(t * 0.7) * 30;
    lights[0].position.y = Math.cos(t * 0.5) * 40 + 30;
    lights[0].position.z = Math.cos(t * 0.3) * 30;

    lights[1].position.x = Math.cos(t * 0.3) * 30;
    lights[1].position.y = Math.sin(t * 0.5) * 40 + 30;
    lights[1].position.z = Math.sin(t * 0.7) * 30;

    lights[2].position.x = Math.sin(t * 0.7) * 30;
    lights[2].position.y = Math.cos(t * 0.3) * 40 + 30;
    lights[2].position.z = Math.sin(t * 0.5) * 30;

    lights[3].position.x = Math.sin(t * 0.3) * 30;
    lights[3].position.y = Math.cos(t * 0.7) * 40 + 30;
    lights[3].position.z = Math.sin(t * 0.5) * 30;

    if (player != undefined) {
        currentTime = player.currentTime;
        if (!MIDI.Player.playing)
            currentTime = previouscurrentTime;
        if (previouscurrentTime == player.currentTime && MIDI.Player.playing) {
            currentTime = Date.now() - t1 + player.currentTime;
        }
        else {
            t1 = Date.now();
            previouscurrentTime = currentTime;
        }
    }
    if (currentTime == 0 && lastBoxRefresh != currentTime) {
        lastBoxRefresh = currentTime;
        headTarget = 0;
        headTargetTime = 0;
        createFuturBox();
    }
    for (let [i, box] of futurBoxs.entries()) {
        box.box.position.y = box.baseY - currentTime / 100;
        box.line.position.y = box.baseY - currentTime / 100;
        if (box.box.position.y < pianoFloor + box.box.scale.y / 2) {
            let positionDiff = (pianoFloor - box.box.position.y + box.box.scale.y / 2)
            let scaleDiff = box.velocity - (pianoFloor + box.velocity / 2 - box.box.position.y)
            box.box.position.y += positionDiff
            box.line.position.y += positionDiff
            box.box.scale.y = scaleDiff
            box.line.scale.y = scaleDiff
        }
        if (box.box.position.y < pianoFloor - box.box.scale.y / 2) {
            scene.remove(box.box);
            scene.remove(box.line);
            futurBoxs.splice(i, 1);
            lastBoxRefresh = currentTime;
            createFuturBox(false);
        }
        if (box.box.position.y > pianoFloor) {
            box.box.visible = settings["Show notes"];
            box.line.visible = settings["Show notes"];
        }
    }
    transitionHands(0);
    transitionHands(1);
    transitionHead();
    openPiano();
    controls.update(); // only required if controls.enableDamping = true, or if controls.autoRotate = true
    renderer.render(scene, camera);

}


let colorNote_w = [0x37a6f7, 0xd237c3];
let colorNote_b = [0x2786ca, 0xa92b9d];
let createBox = function (pianoKey, width, data) {
    data.drawn = "true";
    let color = colorNote_b[data.track % 2];
    if (pianoKey.isWhite)
        color = colorNote_w[data.track % 2];
    const velocity = data.velocity * 10;
    const datatime = data.time * 10;
    const geometry = new THREE.BoxGeometry(width, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1, side: THREE.DoubleSide });
    const edges = new THREE.EdgesGeometry(geometry);

    let box = new THREE.Mesh(geometry, material);
    let line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));

    box.scale.y = velocity;
    line.scale.y = velocity;
    box.position.y = datatime + velocity / 2;
    box.position.x = pianoKey.box.position.x;
    line.position.y = datatime + velocity / 2;
    line.position.x = pianoKey.box.position.x;
    if (pianoKey.isWhite) {
        box.position.z = 2;
        line.position.z = 2;
    }
    box.castShadow = true;
    scene.add(line)
    scene.add(box)
    futurBoxs.push({ box: box, line: line, baseY: datatime + velocity / 2 + pianoFloor, velocity: velocity });
}

let createFuturBox = function (clearBox = true) {
    if (clearBox) {
        for (const box of futurBoxs) {
            scene.remove(box.box);
            scene.remove(box.line);
        }
        futurBoxs = [];
        for (let i = 0; i < mididata.length; i++) {
            mididata[i].drawn = false;
        }
    }
    if (mididata == undefined)
        return;
    for (let data of mididata) {
        if (data.msg.subtype == "noteOn") {
            if (futurBoxs.length > 350)
                return;
            if (data.time < player.currentTime / 1000 - 0.05 || data.drawn)
                continue;
            let n = data.msg.noteNumber - 21;
            let width;
            let pianoKey = pianoKeys[n];
            if (pianoKey.isWhite)
                width = 0.8;
            else
                width = 0.4;
            if (data.velocity <= 0.05) {
                data.velocity = 0.05;
            }
            createBox(pianoKey, width, data);
        }
    }
};

let createGui = function () {
    panel = new GUI({ width: 310 });
    let playerFolder = panel.addFolder('Player');

    settings = {
        'Volume': 20,
        'Pause/Play': pausePlayStop,
        'Next Song': () => player.getNextSong(+1),
        'Previous Song': () => player.getNextSong(-1),
        'Show Ground': false,
        'Open Midi File': openMidiFile,
        'Show notes': true,
        'Show model': true,
        'Show skeleton': false,
        'Animate Fingers': true,
        'Show piano model': true,
        'Show sheet music': true,
        'Enable Teacher Mode': false,
        'Enable Dual Cameras': true,
        'Enable Air Piano': false,
        // Recording controls
        '🔴 Start Recording': startRecording,
        '⏹️ Stop Recording': stopRecording,
        '▶️ Play Recording': playRecording,
        '🗑️ Clear Recording': clearRecording,
        'Calibrate Teacher': () => {
            if (teacherView) {
                teacherView.calibrate();
            } else {
                alert('Enable Teacher Mode first');
            }
        },
        'Calibrate Dual Cameras': () => {
            if (dualCameraView) {
                dualCameraView.calibrate();
            } else {
                alert('Enable Dual Cameras first');
            }
        }
    }
    
    playerFolder.add(settings, "Volume", 0, 100, 1).onChange(SetVolume);
    playerFolder.add(settings, "Pause/Play");
    playerFolder.add(settings, "Next Song");
    playerFolder.add(settings, "Previous Song");
    playerFolder.add(settings, "Show notes").onChange(showNotes);
    playerFolder.add(settings, "Show Ground").onChange(showGround);
    playerFolder.add(settings, "Show sheet music").onChange(function(visible) {
        const container = document.getElementById('sheet-music-container');
        if (visible) {
            container.style.display = 'block';
            if (songname && songname[songid % songname.length]) {
                showSheetMusic(songname[songid % songname.length] + '.mid');
            }
        } else {
            hideSheetMusic();
        }
    });
    playerFolder.add(settings, "Open Midi File");
    
    // ADD RECORDING FOLDER HERE
    let recordingFolder = panel.addFolder('🎙️ Recording');
    recordingFolder.add(settings, '🔴 Start Recording');
    recordingFolder.add(settings, '⏹️ Stop Recording');
    recordingFolder.add(settings, '▶️ Play Recording');
    recordingFolder.add(settings, '🗑️ Clear Recording');
    
    let teacherFolder = panel.addFolder('Teacher Mode');
    teacherFolder.add(settings, "Enable Teacher Mode").onChange(toggleTeacherMode);
    teacherFolder.add(settings, "Calibrate Teacher");

    let dualFolder = panel.addFolder('Dual Cameras');
    dualFolder.add(settings, "Enable Dual Cameras").onChange(toggleDualCameras);
    dualFolder.add(settings, "Calibrate Dual Cameras");

    const elements = document.getElementsByClassName("closed");
    for (let el of elements) {
        el.className = "open";
    }
    
    // MAKE GUI DRAGGABLE
    setTimeout(() => {
        const guiContainer = panel.domElement.parentElement;
        if (guiContainer) {
            guiContainer.style.position = 'fixed';
            guiContainer.style.top = '10px';
            guiContainer.style.right = '10px';
            guiContainer.style.zIndex = '9999';
            guiContainer.style.display = 'block';
            guiContainer.style.cursor = 'move';
            
            // Make it draggable
            let isDragging = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;
            let xOffset = 0;
            let yOffset = 0;

            // Get the title bar (first child is usually the close button container)
            const dragHandle = guiContainer.querySelector('.dg');
            
            if (dragHandle) {
                dragHandle.addEventListener('mousedown', dragStart);
                document.addEventListener('mousemove', drag);
                document.addEventListener('mouseup', dragEnd);
            }

            function dragStart(e) {
                // Only drag from the title area, not from controls
                if (e.target.classList.contains('title') || 
                    e.target.parentElement.classList.contains('dg') ||
                    e.target.classList.contains('dg')) {
                    initialX = e.clientX - xOffset;
                    initialY = e.clientY - yOffset;
                    isDragging = true;
                }
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                    xOffset = currentX;
                    yOffset = currentY;
                    
                    setTranslate(currentX, currentY, guiContainer);
                }
            }

            function dragEnd(e) {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;
            }

            function setTranslate(xPos, yPos, el) {
                el.style.transform = `translate(${xPos}px, ${yPos}px)`;
            }
            
            console.log('✅ GUI panel positioned, visible, and draggable');
        }
    }, 100);
}

let openMidiFile = function() {
    let input = document.createElement('input');
    input.type = 'file';

    input.onchange = e => { 
        let place;
        let file = e.target.files[0]; 
        let reader = new FileReader();
        let name = file.name.replace(".mid", " ");
        name = name.replace(/_/g, " ");
        // Show sheet music for this MIDI file
        if (typeof showSheetMusic === 'function') {
            showSheetMusic(file.name);
        }
        reader.onload = function (event) {
            if (event.target.result.startsWith("data:audio/mid;base64") || event.target.result.startsWith("data:audio/midi;base64")) {
                if (songid % songname.length != songname.length - 1) {
                    place = (songid + 1) % songname.length;
                }
                else {
                    place = songname.length;
                }
                songid = songid % songname.length;
                songname.splice(place, 0, name);
                song.splice(place, 0, event.target.result);
                player.getNextSong(+1);
            }
        };
        reader.readAsDataURL(file);
    }
    input.click();
}

let showGround = function (visible) {
    ground.visible = visible;
}

let showNotes = function (visible) {
    for (const box of futurBoxs) {
        box.box.visible = visible;
        box.line.visible = visible;
    }
}

let showSkeleton = function (visible) {
    skeleton.visible = visible;
}

let showPianist = function (visible) {
    pianistModel.visible = visible;
}

let showPiano = function (visible) {
    pianoModel.visible = visible;
}

let mididata;
let addTimecode = function () {
    let t = 0;
    mididata = [];
    document.getElementById("songname").innerHTML = "Currently playing : " + songname[songid % songname.length]
    for (let data of player.data) {
        t += data[1];
        let newdata = {
            time: t / 1000,
            msg: data[0].event,
            velocity: data[0].event.velocity / 10,
            track: data[0].track,
            drawn: false,
        };
        mididata.push(newdata);
    }
    for (let data of mididata) {
        if (data.msg.subtype != "noteOn") continue;
        for (let dt of mididata) {
            if (dt.time < data.time) continue;
            if (data.time + data.velocity < dt.time) break;
            if (dt.msg.subtype == "noteOff" && data.msg.noteNumber == dt.msg.noteNumber) {
                data.velocity = dt.time - data.time;
            }
        }
    }
    currentTime = 0;
    createFuturBox();
}


function SetVolume(value) {
    MIDI.setVolume(0, value);
    if (MIDI.Player.playing) {
        MIDI.Player.resume();
    }
}

function dragOverHandler(ev) {
    ev.preventDefault();
}

function dropHandler(ev) {
    ev.preventDefault();

    let place;
    let file = ev.dataTransfer.files[0]
    let reader = new FileReader();
    let name = file.name.replace(".mid", " ");
    name = name.replace(/_/g, " ");
    // Show sheet music for this MIDI file
    if (typeof showSheetMusic === 'function') {
        showSheetMusic(file.name);
    }
    reader.onload = function (event) {
        if (event.target.result.startsWith("data:audio/mid;base64") || event.target.result.startsWith("data:audio/midi;base64")) {
            if (songid % songname.length != songname.length - 1) {
                place = (songid + 1) % songname.length;
            }
            else {
                place = songname.length;
            }
            songid = songid % songname.length;
            songname.splice(place, 0, name);
            song.splice(place, 0, event.target.result);
            player.getNextSong(+1);
        }
    };
    reader.readAsDataURL(file);
}

let pausePlayStop = function (stop) {
    if (stop) {
        MIDI.Player.stop();
    } else if (MIDI.Player.playing) {
        MIDI.Player.pause(true);
        createFuturBox(true);
    } else {
        MIDI.Player.resume();
    }
}

let toggleTeacherMode = function(enabled) {
    if (enabled && !teacherView) {
        teacherView = new TeacherView();
    } else if (!enabled && teacherView) {
        teacherView.dispose();
        teacherView = null;
    }
}

let toggleDualCameras = function(enabled) {
    if (enabled && !dualCameraView) {
        if (teacherView) {
            teacherView.dispose();
            teacherView = null;
        }
        
        window.notesState = notesState;
        window.rigHelper = rigHelper;
        window.mixamorig = mixamorig;
        window.setKey = setKey;
        window.animateFingers = animateFingers;
        window.settings = settings;
        
        console.log('🎹 Initializing DualCameraView with 3D piano integration...');
        
        dualCameraView = new DualCameraView({ 
            octaveStart: 60,
            onCalibrated: (baseline) => {
                console.log('✅ DualCameraView calibrated baseline:', baseline);
            }
        });
        dualCameraView.start();
        
        // AUTO-POSITION CAMERA TO TOP-DOWN VIEW OF PLAYING AREA
        setTimeout(() => {
          const octaveStart = 60; // Middle C octave
          const centerKey = octaveStart + 6 - 21; // Center of octave in piano key coordinates
          
          camera.position.set(centerKey - 25, 85, 15); // Above and slightly in front
          camera.lookAt(centerKey - 25, pianoFloor, 0);
          controls.target.set(centerKey - 25, pianoFloor, 0);
          controls.update();
          
          console.log('📸 Camera auto-positioned above playing area');
        }, 500); // Small delay to let everything initialize
        
    } else if (!enabled && dualCameraView) {
        dualCameraView.stop();
        dualCameraView = null;
    }
}

document.addEventListener('keydown', function (event) {
    if (event.code == "Space") {
        pausePlayStop();
    }
});

// set keyOn of keyOff 
let setKey = function (pianoKey, keyOn, track) {
    // Add note to history
    if (keyOn) logNoteToHistory(pianoKey + 21, 100);
    
    if (track != undefined)
        notesState[track % 2][pianoKey] = keyOn
    
    if ((keyOn && pianoKeys[pianoKey].isOn) || (!keyOn && !pianoKeys[pianoKey].isOn))
        return
    
    let modifier = keyOn ? 1 : -1;
    
    // ANIMATION: Move the key
    if (pianoKeys[pianoKey].isWhite) {
        pianoKeys[pianoKey].box.rotation.x += 0.1 * modifier
        pianoKeys[pianoKey].line.rotation.x += 0.1 * modifier
        pianoKeys[pianoKey].box.position.y -= 0.3 * modifier
        pianoKeys[pianoKey].line.position.y -= 0.3 * modifier
    }
    else {
        pianoKeys[pianoKey].box.rotation.x += 0.07 * modifier
        pianoKeys[pianoKey].line.rotation.x += 0.07 * modifier
        pianoKeys[pianoKey].box.position.y -= 0.15 * modifier
        pianoKeys[pianoKey].line.position.y -= 0.15 * modifier
    }
    
    // COLOR CHANGE: Make pressed key flash bright color
    if (keyOn) {
        // Store original color
        if (!pianoKeys[pianoKey].originalColor) {
            pianoKeys[pianoKey].originalColor = pianoKeys[pianoKey].box.material.color.getHex();
        }
        
        // Flash bright cyan/yellow when pressed
        const flashColor = pianoKeys[pianoKey].isWhite ? 0x00ffff : 0xffff00;
        pianoKeys[pianoKey].box.material.color.setHex(flashColor);
        pianoKeys[pianoKey].box.material.emissive = new THREE.Color(flashColor);
        pianoKeys[pianoKey].box.material.emissiveIntensity = 0.5;
        
        // Fade back to original color after 200ms
        setTimeout(() => {
            if (pianoKeys[pianoKey].originalColor) {
                pianoKeys[pianoKey].box.material.color.setHex(pianoKeys[pianoKey].originalColor);
                pianoKeys[pianoKey].box.material.emissive = new THREE.Color(0x000000);
                pianoKeys[pianoKey].box.material.emissiveIntensity = 0;
            }
        }, 200);
    }
    
    pianoKeys[pianoKey].isOn = keyOn;
}
// Highlight the octave range being played
let highlightOctaveRange = function(startKey, numKeys = 12) {
    // Reset all keys to default color first
    for (let i = 0; i < 88; i++) {
        if (pianoKeys[i].box.material.color.getHex() === 0xff69b4 || 
            pianoKeys[i].box.material.color.getHex() === 0xff1493) {
            // Reset highlighted keys back to white/black
            const defaultColor = pianoKeys[i].isWhite ? 0xffffff : 0x000000;
            pianoKeys[i].box.material.color.setHex(defaultColor);
            pianoKeys[i].box.material.emissive = new THREE.Color(0x000000);
            pianoKeys[i].box.material.emissiveIntensity = 0;
        }
    }
    
    // Highlight the active octave range
    for (let i = 0; i < numKeys; i++) {
        const keyIndex = startKey + i;
        if (keyIndex >= 0 && keyIndex < 88) {
            // Pink highlight for active octave
            const highlightColor = pianoKeys[keyIndex].isWhite ? 0xff69b4 : 0xff1493;
            pianoKeys[keyIndex].box.material.color.setHex(highlightColor);
            pianoKeys[keyIndex].box.material.emissive = new THREE.Color(highlightColor);
            pianoKeys[keyIndex].box.material.emissiveIntensity = 0.3;
            
            // Store original color for flash-back
            pianoKeys[keyIndex].originalColor = highlightColor;
        }
    }
}

// Expose globally
window.highlightOctaveRange = highlightOctaveRange;
eventjs.add(window, "load", function (event) {
    MIDI.loader = new sketch.ui.Timer;
    MIDI.loadPlugin({
        soundfontUrl: static_url + 'soundfont/',
        onprogress: function (state, progress) {
            MIDI.loader.setValue(progress * 100);
        },
        onsuccess: function () {
            createGui();
            init();
            player = MIDI.Player;
            MIDI.setVolume(0, 20);
            // Make settings globally accessible
            window.settings = settings;
            // Auto-start dual cameras if enabled
            if (settings['Enable Dual Cameras']) {
                try { toggleDualCameras(true); } catch(e) { console.warn('Failed to start DualCameraView', e); }
            }
            player.loadFile(song[songid % song.length]);
            addTimecode();
            player.addListener(function (data) {
                let pianoKey = data.note - 21;
                if (data.message === 144) {
                    setKey(pianoKey, true, data.track);
                }
                else {
                    setKey(pianoKey, false, data.track);
                }
                if (data.track != undefined)
                    animateFingers(notesState, rigHelper, mixamorig, data.track % 2, settings["Animate Fingers"]);
            });

            ///
            MIDIPlayerPercentage(player);
            animate();
        }
    });
});

let MIDIPlayerPercentage = function (player) {
    let time1 = document.getElementById("time1");
    let time2 = document.getElementById("time2");
    let capsule = document.getElementById("capsule");
    let timeCursor = document.getElementById("cursor");
    //
    eventjs.add(capsule, "drag", function (event, self) {
        eventjs.cancel(event);
        player.currentTime = (self.x) / capsule.offsetWidth * player.endTime;
        if (player.currentTime < 0) player.currentTime = 0;
        if (player.currentTime > player.endTime) player.currentTime = player.endTime;
        if (self.state === "down") {
            player.pause(true);
        } else if (self.state === "up") {
            currentTime = player.currentTime;
            createFuturBox();
            player.resume();
            headTargetTime = 0;
        }
    });
    //
    function timeFormatting(n) {
        let minutes = n / 60 >> 0;
        let seconds = String(n - (minutes * 60) >> 0);
        if (seconds.length == 1) seconds = "0" + seconds;
        return minutes + ":" + seconds;
    };
    player.getNextSong = function (n) {
        songid += n;
        let id = Math.abs((songid) % song.length);
        previouscurrentTime = 1.5;
        player.loadFile(song[id]); // load MIDI
        addTimecode();
            // Show sheet music for this MIDI file
            if (typeof showSheetMusic === 'function') {
                // Try to get the file name from songname array if available
                let midiName = songname[id] || '';
                showSheetMusic(midiName.trim() + '.mid');
            }
        player.start();
    };
    player.setAnimation(function (data, element) {
        let percent = data.now / data.end;
        let now = data.now >> 0; // where we are now
        let end = data.end >> 0; // end of song
        if (now === end) { // go to next song
            let id = ++songid % song.length;
            player.loadFile(song[id], player.start); // load MIDI
            addTimecode();
                // Show sheet music for this MIDI file
                if (typeof showSheetMusic === 'function') {
                    let midiName = songname[id] || '';
                    showSheetMusic(midiName.trim() + '.mid');
                }
        }
        // display the information to the user
        timeCursor.style.width = (percent * 100) + "%";
        time1.innerHTML = timeFormatting(now);
        time2.innerHTML = "-" + timeFormatting(end - now);

            // Sheet music cursor sync (stub):
            // If OSMD and osmd.cursor exist, sync to playback position
            if (window.osmd && osmd.cursor) {
                // Example: osmd.cursor.show(); osmd.cursor.next();
                // maybe map MIDI time to MusicXML position here
            }
    });

    // Hide sheet music when playback stops (optional)
    if (typeof hideSheetMusic === 'function') {
        player.onStop = hideSheetMusic;
    }
    window.player = player;
};
// ============================================
// AIR PIANO INTEGRATION
// ============================================

function toggleAirPiano(enabled) {
    if (enabled && !airPianoController) {
        // Disable dual cameras and teacher mode if active
        if (dualCameraView) {
            settings['Enable Dual Cameras'] = false;
            toggleDualCameras(false);
        }
        if (teacherView) {
            settings['Enable Teacher Mode'] = false;
            toggleTeacherMode(false);
        }
        
        // Create air piano controller with callbacks to 3D piano
        airPianoController = new AirPianoController({
            octaveStart: 60, // C4 (middle C)
onNotePress: (midiNoteNumber, velocity) => {
  console.log('🎹 DualCameraView: Note ON', midiNoteNumber, velocity);
    // RECORD THE NOTE
  if (typeof window.recordNote === 'function') {
    window.recordNote(midiNoteNumber, velocity, true);
  }
  try {
    const pianoKey = midiNoteNumber - 21;
    
    if (pianoKey >= 0 && pianoKey < 88) {
      // Highlight the current octave being played
      if (typeof window.highlightOctaveRange === 'function' && this.airPiano) {
        const octaveStart = this.airPiano.octaveStart - 21; // Convert MIDI to piano key
        window.highlightOctaveRange(octaveStart, 12);
      }
      
      // Play the note through MIDI
      if (typeof MIDI !== 'undefined' && MIDI.noteOn) {
        MIDI.noteOn(0, midiNoteNumber, velocity, 0);
      }
      
      // Animate the 3D piano key
      if (typeof window.setKey === 'function') {
        window.setKey(pianoKey, true, 0);
      }
      
      // UPDATE rigHelper.right.average to current playing position
      if (window.rigHelper) {
        window.rigHelper.right.average = pianoKey;
      }
      
      // Update notesState and animate fingers
      if (window.notesState) {
        window.notesState[0][pianoKey] = true;
        
        if (typeof window.animateFingers === 'function' && window.rigHelper && window.mixamorig) {
          window.animateFingers(window.notesState, window.rigHelper, window.mixamorig, 0, true);
        }
      }
    }
  } catch (e) {
    console.error('❌ onNotePress error:', e);
  }
  
  if (options.onNotePress) {
    options.onNotePress(midiNoteNumber, velocity);
  }
},
            onNoteRelease: (midiNoteNumber) => {
    console.log('🎹 DualCameraView: Note OFF', midiNoteNumber);

      // RECORD THE NOTE RELEASE
  if (typeof window.recordNote === 'function') {
    window.recordNote(midiNoteNumber, 100, false);
  }
                // Release the 3D piano key
                const pianoKey = midiNoteNumber - 21;
                if (pianoKey >= 0 && pianoKey < 88) {
                    // Stop the note
                    MIDI.noteOff(0, midiNoteNumber, 0);
                    
                    // Animate the 3D piano key release
                    setKey(pianoKey, false, 0);
                    
                    // Visual feedback for fingers
                    if (settings["Animate Fingers"]) {
                        notesState[0][pianoKey] = false;
                        animateFingers(notesState, rigHelper, mixamorig, 0, true);
                    }
                }
            }
        });
        
        airPianoController.start();

        // After Air Piano UI is created, attach hover behavior to the Close button
        // without changing Air Piano logic. This toggles a body class that our CSS
        // uses to disable pointer-events on the sidebar/cameras so the GUI is usable.
        const attachGuiHover = () => {
            const pip = document.getElementById('airPianoPIP');
            if (!pip) { setTimeout(attachGuiHover, 150); return; }
            const closeBtn = pip.querySelector('div:nth-of-type(4) button:nth-child(3)');
            if (!closeBtn) { setTimeout(attachGuiHover, 150); return; }

            const panelEl = (panel && panel.domElement) ? panel.domElement : null;
            if (panelEl) {
                // Ensure GUI is visible and positioned sanely when shown
                panelEl.style.zIndex = '10000';
                if (!panelEl.style.position) panelEl.style.position = 'fixed';
                if (!panelEl.style.top) panelEl.style.top = '10px';
                if (!panelEl.style.right) panelEl.style.right = '10px';
            }

            const showGui = () => {
                document.body.classList.add('gui-panel-active');
                if (panelEl) panelEl.style.display = 'block';
            };
            const maybeHideGui = () => {
                // Only hide if mouse is not over the Close button nor the panel
                const overBtn = closeBtn.matches(':hover');
                const overPanel = panelEl ? panelEl.matches(':hover') : false;
                if (!overBtn && !overPanel) {
                    document.body.classList.remove('gui-panel-active');
                }
            };

            // Hover in/out behavior
            closeBtn.addEventListener('mouseenter', showGui);
            closeBtn.addEventListener('mouseleave', maybeHideGui);
            if (panelEl) {
                panelEl.addEventListener('mouseenter', showGui);
                panelEl.addEventListener('mouseleave', maybeHideGui);
            }

            // Prevent the close button from stopping the Air Piano when clicked
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showGui();
            });
        };
        setTimeout(attachGuiHover, 300);
    } else if (!enabled && airPianoController) {
        airPianoController.stop();
        airPianoController = null;
    }
}

// Expose globally for GUI access
window.toggleAirPiano = toggleAirPiano;
window.setHandById = setHandById;