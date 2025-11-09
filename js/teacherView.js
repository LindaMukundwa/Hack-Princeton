// TeacherView - Simple teaching mode that validates notes against C-major scale
// Uses DualCameraView for all hand tracking/calibration - no redundancy

class TeacherView {
    constructor() {
        // Teaching-specific state only
        this.currentExercise = null;
        this.currentNoteIndex = 0;
        this.expectedNotes = [];
        this.mistakes = [];
        this.playedNotes = [];
        this.feedbackBanner = null;
        
        // Add missing properties that are used in the code
        this.activeNotes = new Set();
        this.lastNoteTime = {};
        this.noteStartTimes = new Map();
        this.calibrated = false;
        this.config = {
            zThreshold: -0.1,
            octaveStart: 0,
            debounceTime: 100
        };
        this.surface = {
            leftEdge: 0,
            rightEdge: 0,
            topEdge: 0,
            bottomEdge: 0
        };
        
        this.setupUI();
        this.loadDefaultExercise();
    }

    setupUI() {
        // Simple feedback banner that overlays the main screen
        this.feedbackBanner = document.createElement('div');
        this.feedbackBanner.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 20px 40px;
            background: rgba(0,0,0,0.9);
            color: #00ff00;
            font-size: 24px;
            font-weight: bold;
            font-family: Candara, "Segoe UI", Arial, sans-serif;
            text-align: center;
            pointer-events: none;
            border-radius: 12px;
            border: 3px solid #00ff00;
            z-index: 2000;
            opacity: 0;
            transition: opacity 0.5s ease-out;
        `;
        document.body.appendChild(this.feedbackBanner);
        
        console.log('✅ Teacher Mode UI initialized');
    }

    loadDefaultExercise() {
        // C-major scale exercise (C4 to C5 and back down)
        this.currentExercise = {
            name: 'C Major Scale',
            notes: [
                { midi: 60, name: 'C4' },  // C
                { midi: 62, name: 'D4' },  // D
                { midi: 64, name: 'E4' },  // E
                { midi: 65, name: 'F4' },  // F
                { midi: 67, name: 'G4' },  // G
                { midi: 69, name: 'A4' },  // A
                { midi: 71, name: 'B4' },  // B
                { midi: 72, name: 'C5' },  // C (octave)
                { midi: 71, name: 'B4' },  // Back down
                { midi: 69, name: 'A4' },
                { midi: 67, name: 'G4' },
                { midi: 65, name: 'F4' },
                { midi: 64, name: 'E4' },
                { midi: 62, name: 'D4' },
                { midi: 60, name: 'C4' }
            ]
        };
        
        this.expectedNotes = [...this.currentExercise.notes];
        this.currentNoteIndex = 0;
        this.mistakes = [];
        this.playedNotes = [];
        
        this.renderExerciseOnStaff();
        console.log('✓ C-Major Scale loaded for teaching mode');
    }
    
    renderExerciseOnStaff() {
        // Render the C-major scale on the live staff using OSMD
        if (typeof window.liveOsmd === 'undefined' || !window.liveOsmd) {
            // Silently retry after a short delay until OSMD is ready
            setTimeout(() => this.renderExerciseOnStaff(), 200);
            return;
        }
        
        const musicXML = this.buildExerciseMusicXML();
        
        window.liveOsmd.load(musicXML)
            .then(() => {
                window.liveOsmd.render();
                console.log('✅ C-Major Scale rendered on staff');
                this.showFeedback('Ready! Play C4 to start', 'success');
            })
            .catch(e => console.error('❌ Failed to render exercise:', e));
    }
    
    buildExerciseMusicXML() {
        // Build MusicXML for C-major scale (4/4 time, 4 measures)
        const header = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>C Major Scale</part-name>
    </score-part>
  </part-list>
  <part id="P1">`;

        // Split into 4 measures (4 notes each for first 3 measures, 3 notes for last)
        const measures = [
            this.currentExercise.notes.slice(0, 4),   // Measure 1: C D E F
            this.currentExercise.notes.slice(4, 8),   // Measure 2: G A B C
            this.currentExercise.notes.slice(8, 12),  // Measure 3: B A G F
            this.currentExercise.notes.slice(12, 15)  // Measure 4: E D C
        ];

        let measuresXML = '';
        measures.forEach((measureNotes, idx) => {
            const measureNum = idx + 1;
            let attributes = '';
            
            if (measureNum === 1) {
                attributes = `
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>`;
            }

            measuresXML += `
    <measure number="${measureNum}">${attributes}`;

            measureNotes.forEach(note => {
                const pitch = this.midiToPitch(note.midi);
                measuresXML += `
      <note>
        <pitch>
          <step>${pitch.step}</step>
          ${pitch.alter ? `<alter>${pitch.alter}</alter>` : ''}
          <octave>${pitch.octave}</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>`;
            });

            // Add rest for last beat in measure 4
            if (measureNum === 4) {
                measuresXML += `
      <note>
        <rest/>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>`;
            }

            measuresXML += `
    </measure>`;
        });

        const footer = `
  </part>
</score-partwise>`;

        return header + measuresXML + footer;
    }
    
    midiToPitch(midi) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor((midi / 12) - 1);
        const step = names[midi % 12];
        const alter = step.includes('#') ? 1 : 0;
        return { step: step.replace('#', ''), alter, octave };
    }
    
    // Called by DualCameraView when a note is played
    checkPlayedNote(midiNote) {
        if (this.currentNoteIndex >= this.expectedNotes.length) {
            // Exercise complete
            if (this.currentNoteIndex === this.expectedNotes.length) {
                this.showFeedback('✓ Exercise Complete!', 'success');
                this.currentNoteIndex++; // Prevent repeated messages
            }
            return;
        }
        
        const expected = this.expectedNotes[this.currentNoteIndex];
        const noteName = this.midiToNoteName(midiNote);
        
        if (midiNote === expected.midi) {
            // Correct note!
            this.showFeedback(`✓ Correct! ${expected.name}`, 'success');
            this.playedNotes.push({ expected: expected.midi, played: midiNote, correct: true });
            this.currentNoteIndex++;
            
            // Highlight progress on staff if possible
            this.highlightCurrentNoteOnStaff();
            
        } else {
            // Wrong note
            this.showFeedback(`✗ Wrong! Expected ${expected.name}, got ${noteName}`, 'error');
            this.mistakes.push({
                expected: expected.midi,
                expectedName: expected.name,
                played: midiNote,
                playedName: noteName,
                position: this.currentNoteIndex
            });
            this.playedNotes.push({ expected: expected.midi, played: midiNote, correct: false });
        }
        
        console.log(`Progress: ${this.currentNoteIndex}/${this.expectedNotes.length} | Mistakes: ${this.mistakes.length}`);
    }
    
    midiToNoteName(midi) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor((midi / 12) - 1);
        return names[midi % 12] + octave;
    }
    
    showFeedback(message, type) {
        this.feedbackBanner.textContent = message;
        
        if (type === 'success') {
            this.feedbackBanner.style.color = '#00ff00';
            this.feedbackBanner.style.borderColor = '#00ff00';
            this.feedbackBanner.style.background = 'rgba(0,150,0,0.9)';
        } else if (type === 'error') {
            this.feedbackBanner.style.color = '#ff0000';
            this.feedbackBanner.style.borderColor = '#ff0000';
            this.feedbackBanner.style.background = 'rgba(200,0,0,0.9)';
        } else {
            this.feedbackBanner.style.color = '#00ff00';
            this.feedbackBanner.style.borderColor = '#00ff00';
            this.feedbackBanner.style.background = 'rgba(0,0,0,0.9)';
        }
        
        // Fade in
        this.feedbackBanner.style.opacity = '1';
        
        // Auto-clear feedback after 1.5 seconds
        setTimeout(() => {
            this.feedbackBanner.style.opacity = '0';
            if (this.currentNoteIndex < this.expectedNotes.length) {
                setTimeout(() => {
                    this.feedbackBanner.textContent = 'Play the next note...';
                    this.feedbackBanner.style.color = '#00ff00';
                    this.feedbackBanner.style.borderColor = '#00ff00';
                    this.feedbackBanner.style.background = 'rgba(0,0,0,0.9)';
                    this.feedbackBanner.style.opacity = '1';
                }, 500);
            }
        }, 1500);
    }
    
    highlightCurrentNoteOnStaff() {
        // Visual feedback on sheet music (if OSMD supports it)
        // This would require more advanced OSMD manipulation
        console.log(`Progress: ${this.currentNoteIndex}/${this.expectedNotes.length}`);
    }
    
    updateExerciseDisplay() {
        // Update any exercise progress display
        console.log(`Exercise progress: ${this.currentNoteIndex}/${this.expectedNotes.length}`);
    }
    
    resetExercise() {
        this.currentNoteIndex = 0;
        this.playedNotes = [];
        this.mistakes = [];
        this.updateExerciseDisplay();
        this.showFeedback('Exercise reset!', 'success');
        this.renderExerciseOnStaff();
        console.log('🔄 Exercise reset');
    }

    // The following methods are kept for compatibility but should be handled by DualCameraView
    // They're simplified since hand tracking should be managed externally
    
    playNote(midiNote, velocity, hand) {
        // Check played note against teaching exercise
        this.checkPlayedNote(midiNote);
        
        // Trigger MIDI note
        const track = hand === 'left' ? 1 : 0;
        
        if (typeof MIDI !== 'undefined' && MIDI.noteOn) {
            MIDI.noteOn(0, midiNote, velocity, 0);
        }
        
        // Trigger visual feedback on piano
        const keyIndex = midiNote - 21;
        if (keyIndex >= 0 && keyIndex < 88) {
            if (typeof setKey === 'function' && typeof pianoKeys !== 'undefined') {
                setKey(keyIndex, true, track);
            }
            
            // Update notesState for finger animation
            if (typeof notesState !== 'undefined') {
                notesState[track][keyIndex] = true;
                
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
                
                if (typeof animateFingers === 'function' && typeof rigHelper !== 'undefined' && 
                    typeof mixamorig !== 'undefined' && typeof settings !== 'undefined') {
                    animateFingers(notesState, rigHelper, 0, settings["Animate Fingers"]);
                    animateFingers(notesState, rigHelper, 1, settings["Animate Fingers"]);
                }
            }
        }
    }

    dispose() {
        // Clean up resources
        if (this.feedbackBanner && this.feedbackBanner.parentElement) {
            this.feedbackBanner.remove();
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
        
        console.log('TeacherView disposed');
    }
}

export { TeacherView };