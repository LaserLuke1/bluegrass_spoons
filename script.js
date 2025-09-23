
class SpoonSoundApp {
    constructor() {
        // App state
        this.isListening = false;
        this.currentSound = 'wooden-spoon';

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
    }

    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.spoon = document.getElementById('spoon');
        this.soundIndicator = document.getElementById('soundIndicator');
        this.soundBtns = document.querySelectorAll('.sound-btn');
        this.motionProgress = document.getElementById('motionProgress');
        this.motionValue = document.getElementById('motionValue');
        this.lastSoundDisplay = document.getElementById('lastSound');
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.startMotionDetection());
        this.stopBtn.addEventListener('click', () => this.stopMotionDetection());

        this.soundBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectSound(e.target.dataset.sound);
            });
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

            // Motion permission (iOS) or just attach (Android/desktop)
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission === 'granted') {
                        window.addEventListener('devicemotion', this._onDeviceMotion, { passive: true });
                        console.log('✅ Motion permission granted');
                    } else {
                        console.log('ℹ️ Motion permission denied - tap to play');
                    }
                } catch (err) {
                    console.log('❌ Motion permission error - tap to play');
                }
            } else {
                window.addEventListener('devicemotion', this._onDeviceMotion, { passive: true });
                console.log('✅ Motion detection enabled');
            }
        } catch (error) {
            console.error('Error starting app:', error);
        }
    }

    stopMotionDetection() {
        this.isListening = false;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;

        window.removeEventListener('devicemotion', this._onDeviceMotion);

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.updateMotionDisplay(0);
        console.log('ℹ️ App stopped');
    }

    handleMotion(event) {
        if (!this.isListening) return;

        let acceleration = event.acceleration || event.accelerationIncludingGravity;
        if (!acceleration) return;

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
        this.playSpoonSound();

        // Visual pop scaled by intensity
        const intensity = this.getCurrentShakeIntensity();
        const scale = intensity === 'strong' ? 1.15 : intensity === 'medium' ? 1.08 : 1.03;
        this.spoon.style.transform = `scale(${scale})`;
        clearTimeout(this._animTO);
        this._animTO = setTimeout(() => {
            this.spoon.style.transform = '';
        }, 140);
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
        this.createVariedSpoonPercussion(cfg, now, intensity, rhythm, finalVolume);

        // Tonal character with harmonics & micro-sweep
        this.createRichMaterialTone(cfg, now, intensity, rhythm, finalVolume);

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

    createVariedSpoonPercussion(cfg, startTime, intensity, rhythm, finalVolume) {
        let numBursts, baseDur, volMul, filtMul;
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
        this.createSpoonPercussionBursts(cfg, startTime, numBursts, baseDur, volMul, filtMul, finalVolume);
    }

    createSpoonPercussionBursts(cfg, startTime, numBursts, baseDur, volMul, filtMul, finalVolume) {
        for (let i = 0; i < numBursts; i++) {
            const t = startTime + (i * 0.01);
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

            // Volume
            const base = finalVolume * (0.3 + Math.random() * 0.2) * volMul;
            const vol = base * (1 - i * 0.2);
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
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SpoonSoundApp();
});
