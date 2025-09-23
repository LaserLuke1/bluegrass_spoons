
class SpoonSoundApp {
    constructor() {
        // App state
        this.isListening = false;
        this.currentSound = 'wooden-spoon';
        this.tempo = 1.0; // Playing speed multiplier

        // Audio dynamics
        this.baseVolume = 1.0; // master volume (uses device volume too)

        // Motion tuning (from the reliable motion version)
        this.motionThreshold = 8.0; // delta threshold for shake
        this.soundCooldown = 100;   // ms between hits
        this.motionCooldown = 150;  // ms between motion-trigger checks

        // Internals
        this.lastSoundTime = 0;
        this.lastMotionTime = 0;
        this.lastAcceleration = { x: 0, y: 0, z: 0 };
        this.shakeHistory = [];     // recent shakes (intensity, timestamp)
        this.audioInstances = [];   // for cleanup

        // Spoon sound configs
        this.sounds = {
            'wooden-spoon': {
                name: 'Wooden Spoon',
                frequencies: [150, 200, 250, 300],
                type: 'triangle',
                filterFreq: 400,
            },
            'metal-spoon': {
                name: 'Metal Spoon',
                frequencies: [800, 1200, 1600, 2000],
                type: 'square',
                filterFreq: 2000,
            },
            'plastic-spoon': {
                name: 'Plastic Spoon',
                frequencies: [400, 600, 800, 1000],
                type: 'sawtooth',
                filterFreq: 1200,
            },
            'ceramic-spoon': {
                name: 'Ceramic Spoon',
                frequencies: [300, 450, 600, 750],
                type: 'sine',
                filterFreq: 800,
            }
        };

        // Bind the device motion handler once so we can remove it later
        this._onDeviceMotion = (e) => this.handleMotion(e);

        this.initializeElements();
        this.setupEventListeners();
        this.checkDeviceSupport();
        
        // Initialize default material styling
        this.selectSound(this.currentSound);
    }

    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.motionTestBtn = document.getElementById('motionTestBtn');
        this.spoon = document.getElementById('spoon');
        this.soundIndicator = document.getElementById('soundIndicator');
        this.soundBtns = document.querySelectorAll('.sound-btn');
        this.motionProgress = document.getElementById('motionProgress');
        this.motionValue = document.getElementById('motionValue');
        this.lastSoundDisplay = document.getElementById('lastSound');
        this.tempoSlider = document.getElementById('tempoSlider');
        this.tempoValue = document.getElementById('tempoValue');
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.startMotionDetection());
        this.stopBtn.addEventListener('click', () => this.stopMotionDetection());
        this.motionTestBtn.addEventListener('click', () => this.testMotionPermission());

        this.soundBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectSound(e.target.dataset.sound);
            });
        });

        // Enhanced tempo control with authentic pattern names
        this.tempoSlider.addEventListener('input', (e) => {
            this.tempo = parseFloat(e.target.value);
            let patternName = '';
            let description = '';
            
            if (this.tempo > 2.0) {
                patternName = 'Arpeggiated';
                description = 'Rapid cascading hits';
            } else if (this.tempo > 1.5) {
                patternName = 'Syncopated';
                description = 'Off-beat emphasis';
            } else if (this.tempo < 0.7) {
                patternName = 'Sparse';
                description = 'Single sustained hits';
            } else if (this.tempo < 0.9) {
                patternName = 'Sustained';
                description = 'Spaced out rhythm';
            } else {
                patternName = 'Normal';
                description = 'Classic shaki style';
            }
            
            this.tempoValue.textContent = `${this.tempo.toFixed(1)}x (${patternName})`;
        });

        // Multiple ways to trigger sounds
        this.spoon.addEventListener('click', () => this.triggerSound());
        this.spoon.addEventListener('touchstart', () => this.triggerSound());

        // Tap anywhere (except buttons) to play
        document.addEventListener('click', (e) => {
            if (this.isListening && e.target.tagName !== 'BUTTON') {
                this.triggerSound();
            }
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (this.isListening && e.code === 'Space') {
                e.preventDefault();
                this.triggerSound();
            }
        });
    }

    checkDeviceSupport() {
        if (!window.DeviceMotionEvent) {
            console.log('ℹ️ Motion sensors not supported - using manual mode');
            return;
        }
        if (this.isIOS()) {
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                console.log('ℹ️ iOS detected - will request motion permission on start');
            } else {
                console.log('ℹ️ iOS detected - motion should work automatically');
            }
        }
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            console.log('⚠️ Motion sensors require HTTPS - use manual tapping on HTTP');
        }
    }

    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    }

    async startMotionDetection() {
        try {
            this.isListening = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;

            // Audio
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Enhanced motion permission handling based on working test page
            if (!window.DeviceMotionEvent) {
                console.log('❌ DeviceMotionEvent not supported - using manual mode');
                this.manualMode = true;
                return;
            }

            // Check if we need to request permission (iOS)
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    console.log('📱 Requesting motion permission...');
                    const permission = await DeviceMotionEvent.requestPermission();
                    console.log('Motion permission result:', permission);
                    
                    if (permission === 'granted') {
                        // Permission granted - add motion listener
                        window.addEventListener('devicemotion', (e) => this.handleMotion(e), { passive: true });
                        console.log('✅ Motion permission granted! Shake your phone to play shaki spoons!');
                    } else {
                        console.log('❌ Motion permission denied - you can still tap to play sounds');
                    }
                } catch (error) {
                    console.error('Error requesting motion permission:', error);
                    console.log('❌ Motion permission error - you can still tap to play sounds');
                }
            } else {
                // No permission request needed (Android, desktop) - try direct access
                try {
                    console.log('📱 No permission request needed - trying direct motion access');
                    window.addEventListener('devicemotion', (e) => this.handleMotion(e), { passive: true });
                    console.log('✅ Motion detection active! Shake your phone to play shaki spoons!');
                } catch (error) {
                    console.error('Error enabling motion detection:', error);
                    console.log('❌ Motion detection failed - you can still tap to play sounds');
                }
            }
        } catch (error) {
            console.error('Error starting app:', error);
        }
    }

    stopMotionDetection() {
        this.isListening = false;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;

        window.removeEventListener('devicemotion', this.handleMotion);

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.updateMotionDisplay(0);
        console.log('ℹ️ App stopped');
    }

    handleMotion(event) {
        if (!this.isListening) return;

        // Debug: Log first few motion events to verify detection is working
        if (!this.motionDebugCount) this.motionDebugCount = 0;
        if (this.motionDebugCount < 3) {
            console.log(`Motion event ${this.motionDebugCount + 1}:`, event);
            this.motionDebugCount++;
        }

        let acceleration = event.acceleration || event.accelerationIncludingGravity;
        if (!acceleration) {
            console.log('No acceleration data in motion event');
            return;
        }

        const now = Date.now();

        // Deltas capture shake better than absolute values
        const deltaX = Math.abs(acceleration.x - this.lastAcceleration.x);
        const deltaY = Math.abs(acceleration.y - this.lastAcceleration.y);
        const deltaZ = Math.abs(acceleration.z - this.lastAcceleration.z);
        const totalDelta = deltaX + deltaY + deltaZ;

        // History for context/rhythm
        this.shakeHistory.push({ intensity: totalDelta, timestamp: now });
        this.shakeHistory = this.shakeHistory.filter(h => now - h.timestamp < 500); // keep 0.5s

        // UI feedback (absolute magnitude)
        const currentMagnitude = Math.sqrt(
            acceleration.x * acceleration.x +
            acceleration.y * acceleration.y +
            acceleration.z * acceleration.z
        );
        this.updateMotionDisplay(currentMagnitude);

        // Gate rapid triggers
        const isSignificant = this.detectVigorousShake(totalDelta, now);
        if (isSignificant && (now - this.lastMotionTime) > this.motionCooldown) {
            console.log(`🎵 Vigorous shake detected! Delta: ${totalDelta.toFixed(2)}, Threshold: ${this.motionThreshold}`);
            this.lastMotionTime = now;
            this.triggerSound();
        }

        this.lastAcceleration = { x: acceleration.x, y: acceleration.y, z: acceleration.z };
    }

    detectVigorousShake(currentIntensity, timestamp) {
        if (currentIntensity < this.motionThreshold) return false;

        const recent = this.shakeHistory.filter(h =>
            h.intensity > this.motionThreshold * 0.6 && (timestamp - h.timestamp) < 200
        );

        if (recent.length < 1) return false;

        if (recent.length === 1) {
            return recent[0].intensity > this.motionThreshold * 1.2;
        } else {
            const avg = recent.reduce((s, h) => s + h.intensity, 0) / recent.length;
            return avg > this.motionThreshold * 0.7;
        }
    }

    updateMotionDisplay(magnitude) {
        if (!this.motionProgress || !this.motionValue) return;
        const percentage = Math.min((magnitude / 15) * 100, 100);
        this.motionProgress.style.width = percentage + '%';
        this.motionValue.textContent = magnitude.toFixed(1);

        if (magnitude > this.motionThreshold) {
            this.motionProgress.style.background = 'linear-gradient(90deg, #32CD32, #FFD700, #FF6347)';
        } else if (magnitude > this.motionThreshold * 0.7) {
            this.motionProgress.style.background = 'linear-gradient(90deg, #32CD32, #FFD700)';
        } else {
            this.motionProgress.style.background = 'linear-gradient(90deg, #32CD32)';
        }
    }

    triggerSound() {
        const now = Date.now();
        if (now - this.lastSoundTime < this.soundCooldown) return;

        this.lastSoundTime = now;

        // Trigger spoon clapping animation (always play, regardless of audio state)
        this.spoon.classList.add('active');
        clearTimeout(this._animTO);
        this._animTO = setTimeout(() => {
            this.spoon.classList.remove('active');
        }, 200);

        // Visual pop scaled by intensity
        const intensity = this.getCurrentShakeIntensity();
        const scale = intensity === 'strong' ? 1.15 : intensity === 'medium' ? 1.08 : 1.03;
        this.spoon.style.transform = `scale(${scale})`;
        clearTimeout(this._scaleTO);
        this._scaleTO = setTimeout(() => {
            this.spoon.style.transform = '';
        }, 140);

        // Play sound (only if audio context is ready)
        this.playSpoonSound();
    }

    playSpoonSound() {
        if (!this.audioContext || this.audioContext.state !== 'running') return;

        const cfg = this.sounds[this.currentSound];
        const now = this.audioContext.currentTime;

        const intensity = this.getCurrentShakeIntensity(); // 'light' | 'medium' | 'strong'
        const rhythm = this.getRhythmContext();

        // Map intensity -> volume factor (per hit)
        const intensityFactor = intensity === 'strong' ? 1.0 : (intensity === 'medium' ? 0.7 : 0.4);
        const finalVolume = this.baseVolume * intensityFactor;

        // Percussive noise bursts
        this.createVariedSpoonPercussion(cfg, now, intensity, rhythm, finalVolume, this.tempo);

        // Tonal character with harmonics & micro-sweep
        this.createRichMaterialTone(cfg, now, intensity, rhythm, finalVolume, this.tempo);

        const rhythmInfo = rhythm.isFastRhythm ? ' (Fast Rhythm)' : '';
        this.lastSoundDisplay && (this.lastSoundDisplay.textContent = `${cfg.name} - ${intensity}${rhythmInfo}`);

        this.cleanupAudioInstances();
    }

    getCurrentShakeIntensity() {
        if (this.shakeHistory.length === 0) return 'medium';
        const latest = this.shakeHistory[this.shakeHistory.length - 1].intensity;
        if (latest > this.motionThreshold * 1.5) return 'strong';
        if (latest > this.motionThreshold * 1.0) return 'medium';
        return 'light';
    }

    getRhythmContext() {
        const now = Date.now();
        const timeSinceLast = now - this.lastMotionTime;
        const recent = this.shakeHistory.filter(h => now - h.timestamp < 1000);
        const avgBetween = this.calculateAverageTimeBetween(recent);
        return {
            isFastRhythm: timeSinceLast < 300,
            avgTimeBetween: avgBetween,
            intensity: this.getCurrentShakeIntensity(),
            shakeCount: recent.length
        };
    }

    calculateAverageTimeBetween(shakes) {
        if (shakes.length < 2) return 1000;
        let sum = 0;
        for (let i = 1; i < shakes.length; i++) {
            sum += (shakes[i].timestamp - shakes[i - 1].timestamp);
        }
        return sum / (shakes.length - 1);
    }

    cleanupAudioInstances() {
        this.audioInstances = this.audioInstances.filter(inst => {
            try {
                return inst.contextTime < this.audioContext.currentTime + 2;
            } catch {
                return false;
            }
        });
    }

    createVariedSpoonPercussion(cfg, startTime, intensity, rhythm, finalVolume, tempo = 1.0) {
        let numBursts, baseDur, volMul, filtMul;
        
        // Base pattern based on intensity
        switch (intensity) {
            case 'strong':
                numBursts = 3 + Math.random() * 2;      // 3-5
                baseDur = 0.08 + Math.random() * 0.04;  // 80-120ms
                volMul = 1.2;
                filtMul = 1.5;
                break;
            case 'light':
                numBursts = 1 + Math.random() * 2;      // 1-3
                baseDur = 0.04 + Math.random() * 0.02;  // 40-60ms
                volMul = 0.7;
                filtMul = 0.8;
                break;
            default:
                numBursts = 2 + Math.random() * 2;      // 2-4
                baseDur = 0.06 + Math.random() * 0.03;  // 60-90ms
                volMul = 1.0;
                filtMul = 1.0;
        }
        
        if (rhythm.isFastRhythm) {
            numBursts = Math.max(1, numBursts - 1);
            baseDur *= 0.8;
        }
        
        // Enhanced tempo-based arpeggiation patterns
        if (tempo > 2.0) {
            // ARPEGGIATED: Authentic cascading spoon patterns (like the waveform)
            numBursts = 4 + Math.floor(Math.random() * 4); // 4-7 hits
            baseDur = 0.03 + Math.random() * 0.02; // Shorter, sharper hits (30-50ms)
            volMul = 1.3; // More dynamic
            filtMul = 1.8; // Brighter, more cutting
        } else if (tempo > 1.5) {
            // SYNCOPATED: Clear off-beat patterns
            numBursts = Math.min(numBursts * 2, 6);
            baseDur = 0.04 + Math.random() * 0.02; // Medium-short hits
            volMul = 1.1;
            filtMul = 1.2;
        } else if (tempo < 0.7) {
            // SPARSE: Single, sustained hits
            numBursts = 1;
            baseDur = 0.12 + Math.random() * 0.06; // Longer, more resonant
            volMul = 0.9;
            filtMul = 0.7;
        } else if (tempo < 0.9) {
            // SUSTAINED: Fewer, more spaced out hits
            numBursts = Math.max(Math.floor(numBursts * 0.6), 1);
            baseDur = 0.08 + Math.random() * 0.04; // Medium duration
            volMul = 0.95;
            filtMul = 0.9;
        }
        
        this.createSpoonPercussionBursts(cfg, startTime, numBursts, baseDur, volMul, filtMul, finalVolume, tempo);
    }

    createSpoonPercussionBursts(cfg, startTime, numBursts, baseDur, volMul, filtMul, finalVolume, tempo = 1.0) {
        for (let i = 0; i < numBursts; i++) {
            let t;
            
            // Enhanced timing patterns based on authentic spoon playing
            if (tempo > 2.0) {
                // ARPEGGIATED: Authentic cascading pattern (like the waveform)
                // Creates the rapid-fire, cascading effect with slight acceleration
                const baseInterval = 0.003; // 3ms base interval
                const acceleration = i * 0.001; // Slight acceleration
                const randomVariation = (Math.random() - 0.5) * 0.002; // Small random variation
                t = startTime + (i * baseInterval) + acceleration + randomVariation;
            } else if (tempo > 1.5) {
                // SYNCOPATED: Clear off-beat timing with emphasis
                const baseInterval = 0.008; // 8ms base
                const offBeatOffset = (i % 2 === 0) ? 0.002 : 0.012; // Off-beat emphasis
                t = startTime + (i * baseInterval) + offBeatOffset;
            } else if (tempo < 0.7) {
                // SPARSE: Single, sustained hits with long intervals
                t = startTime + (i * 0.08); // 80ms intervals
            } else if (tempo < 0.9) {
                // SUSTAINED: Longer intervals, more spaced out
                t = startTime + (i * 0.04); // 40ms intervals
            } else {
                // NORMAL: Regular intervals with slight variation
                const baseInterval = 0.015; // 15ms base
                const variation = (Math.random() - 0.5) * 0.005; // Small variation
                t = startTime + (i * baseInterval) + variation;
            }
            
            const dur = baseDur * (0.8 + Math.random() * 0.4);

            // Noise buffer
            const bufferSize = Math.max(1, Math.floor(this.audioContext.sampleRate * dur));
            const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
            const data = buffer.getChannelData(0);
            for (let j = 0; j < bufferSize; j++) {
                const env = Math.pow(1 - (j / bufferSize), 2);
                data[j] = (Math.random() * 2 - 1) * env;
            }

            const noise = this.audioContext.createBufferSource();
            const gain = this.audioContext.createGain();
            const filter = this.audioContext.createBiquadFilter();

            noise.buffer = buffer;
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.audioContext.destination);

            // Filter (bandpass) varies with intensity
            filter.type = 'bandpass';
            const ff = cfg.filterFreq * filtMul * (0.8 + Math.random() * 0.4);
            filter.frequency.setValueAtTime(ff, t);
            filter.Q.setValueAtTime(1 + Math.random() * 2, t);

            // Enhanced volume dynamics for authentic arpeggiation
            let vol;
            if (tempo > 2.0) {
                // ARPEGGIATED: Create cascading volume pattern (like the waveform)
                // First hit is strong, then slight decay with some accents
                const baseVol = finalVolume * (0.4 + Math.random() * 0.3) * volMul;
                if (i === 0) {
                    vol = baseVol * 1.2; // Strong first hit
                } else if (i === numBursts - 1) {
                    vol = baseVol * 0.8; // Slight accent on last hit
                } else {
                    vol = baseVol * (0.7 + Math.random() * 0.4); // Variable middle hits
                }
            } else if (tempo > 1.5) {
                // SYNCOPATED: Alternating strong/weak pattern
                const baseVol = finalVolume * (0.35 + Math.random() * 0.25) * volMul;
                vol = baseVol * (i % 2 === 0 ? 1.1 : 0.8);
            } else {
                // NORMAL/SPARSE: Traditional decay pattern
                const base = finalVolume * (0.3 + Math.random() * 0.2) * volMul;
                vol = base * (1 - i * 0.2);
            }
            
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(vol, t + 0.001);
            gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

            noise.start(t);
            noise.stop(t + dur);

            this.audioInstances.push({ source: noise, contextTime: t + dur });
        }
    }

    // Richer tonal component: adds a faint harmonic and a tiny pitch sweep for realism
    createRichMaterialTone(cfg, startTime, intensity, rhythm, finalVolume) {
        // Primary oscillator
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.audioContext.destination);

        // Secondary faint harmonic
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);

        // Duration/volume/frequency multipliers
        let toneDur, toneVol, freqMul;
        switch (intensity) {
            case 'strong':
                toneDur = 0.02 + Math.random() * 0.015;
                toneVol = finalVolume * 0.15;
                freqMul = 1.1;
                break;
            case 'light':
                toneDur = 0.008 + Math.random() * 0.007;
                toneVol = finalVolume * 0.05;
                freqMul = 0.95;
                break;
            default:
                toneDur = 0.012 + Math.random() * 0.01;
                toneVol = finalVolume * 0.10;
                freqMul = 1.0;
        }
        if (rhythm.isFastRhythm) {
            toneDur *= 0.7;
            toneVol *= 0.85;
        }
        
        // Apply tempo effects to create dramatic harmonic differences
        if (tempo > 2.0) {
            // High tempo: Much louder harmonics for arpeggiated effect
            toneVol *= 1.8;
            toneDur *= 0.6; // Shorter, sharper hits
        } else if (tempo > 1.5) {
            // Medium-high tempo: Enhanced harmonics for syncopation
            toneVol *= 1.3;
        } else if (tempo < 0.7) {
            // Low tempo: Much longer sustained tones
            toneDur *= 2.0; // Very long sustained tones
            toneVol *= 0.8; // Quieter but longer
        } else if (tempo < 0.9) {
            // Medium-low tempo: Longer sustained tones
            toneDur *= 1.5;
        }

        const freqs = cfg.frequencies;
        let f0;
        if (intensity === 'strong') {
            f0 = freqs[0] * freqMul;
        } else if (intensity === 'light') {
            f0 = freqs[freqs.length - 1] * freqMul;
        } else {
            f0 = freqs[Math.floor(Math.random() * freqs.length)] * freqMul;
        }

        // Slight pitch sweep (adds realism of impact resonance)
        const fStart = f0 * (intensity === 'strong' ? 0.95 : 0.98);
        const fEnd = f0 * (intensity === 'strong' ? 1.03 : 1.01);

        osc.type = cfg.type;
        osc.frequency.setValueAtTime(fStart, startTime);
        osc.frequency.linearRampToValueAtTime(fEnd, startTime + toneDur);

        filter.type = 'highpass';
        const hp = cfg.filterFreq * 0.5 * (intensity === 'strong' ? 1.1 : 1.0);
        filter.frequency.setValueAtTime(hp, startTime);
        filter.Q.setValueAtTime(1 + (intensity === 'strong' ? 0.4 : 0), startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(toneVol, startTime + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + toneDur);

        // Harmonic one octave up, very quiet, short
        const fH = f0 * 2;
        const hDur = toneDur * 0.8;
        const hVol = toneVol * 0.4;

        osc2.type = cfg.type;
        osc2.frequency.setValueAtTime(fH * 0.99, startTime);
        osc2.frequency.linearRampToValueAtTime(fH * 1.01, startTime + hDur);

        gain2.gain.setValueAtTime(0, startTime);
        gain2.gain.linearRampToValueAtTime(hVol, startTime + 0.001);
        gain2.gain.exponentialRampToValueAtTime(0.001, startTime + hDur);

        osc.start(startTime);
        osc.stop(startTime + toneDur);
        osc2.start(startTime);
        osc2.stop(startTime + hDur);

        this.audioInstances.push({ source: osc, contextTime: startTime + toneDur });
        this.audioInstances.push({ source: osc2, contextTime: startTime + hDur });
    }

    selectSound(sound) {
        this.currentSound = sound;
        this.soundBtns.forEach(btn => btn.classList.remove('active'));
        const active = document.querySelector(`[data-sound="${sound}"]`);
        if (active) active.classList.add('active');
        
        // Update spoon container material class for visual styling
        const spoonContainer = document.querySelector('.spoon-container');
        if (spoonContainer) {
            // Remove all material classes
            spoonContainer.classList.remove('material-wooden-spoon', 'material-metal-spoon', 'material-plastic-spoon', 'material-ceramic-spoon');
            // Add the new material class
            spoonContainer.classList.add(`material-${sound}`);
        }
    }

    async testMotionPermission() {
        console.log('🧪 Testing motion permission...');
        
        if (!window.DeviceMotionEvent) {
            console.log('❌ DeviceMotionEvent not supported');
            alert('Motion sensors not supported on this device');
            return;
        }

        // Check if we need to request permission (iOS)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                console.log('📱 Requesting motion permission...');
                const permission = await DeviceMotionEvent.requestPermission();
                console.log('Motion permission result:', permission);
                
                if (permission === 'granted') {
                    console.log('✅ Motion permission granted!');
                    alert('✅ Motion permission granted! You can now use the main app.');
                } else {
                    console.log('❌ Motion permission denied');
                    alert('❌ Motion permission denied. You can still tap to play sounds.');
                }
            } catch (error) {
                console.error('Error requesting motion permission:', error);
                alert('❌ Motion permission error. You can still tap to play sounds.');
            }
        } else {
            // No permission request needed (Android, desktop)
            console.log('📱 No permission request needed - testing motion detection');
            
            let motionCount = 0;
            const maxMotions = 3;
            
            function handleTestMotion(event) {
                motionCount++;
                const acc = event.acceleration || event.accelerationIncludingGravity;
                if (acc) {
                    const magnitude = Math.sqrt(acc.x*acc.x + acc.y*acc.y + acc.z*acc.z);
                    console.log(`Motion ${motionCount}: magnitude = ${magnitude.toFixed(2)}`);
                }
                
                if (motionCount >= maxMotions) {
                    window.removeEventListener('devicemotion', handleTestMotion);
                    console.log(`✅ Motion detection working! Captured ${motionCount} events`);
                    alert(`✅ Motion detection working! Captured ${motionCount} motion events. You can now use the main app.`);
                }
            }
            
            try {
                window.addEventListener('devicemotion', handleTestMotion, { passive: true });
                alert('📱 Testing motion detection... Shake your device! (3 events max)');
                
                setTimeout(() => {
                    window.removeEventListener('devicemotion', handleTestMotion);
                    if (motionCount === 0) {
                        console.log('❌ No motion detected');
                        alert('❌ No motion detected. Check if motion sensors are enabled in your device settings.');
                    }
                }, 5000); // 5 second timeout
                
            } catch (error) {
                console.error('Motion detection error:', error);
                alert('❌ Motion detection failed. You can still tap to play sounds.');
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SpoonSoundApp();
});
