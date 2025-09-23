class SpoonSoundApp {
    constructor() {
        this.isListening = false;
        this.currentSound = 'wooden-spoon';
        this.volume = 1.0; // Fixed at 100% - uses device volume
        this.motionThreshold = 15;
        this.lastSoundTime = 0;
        this.soundCooldown = 50; // Very short for realistic percussion response
        this.permissionRequested = false;
        this.manualMode = false;
        
        // Spoon sound configurations optimized for realistic percussion
        this.sounds = {
            'wooden-spoon': {
                name: 'Wooden Spoon',
                frequencies: [150, 200, 250, 300], // Lower, warmer frequencies
                type: 'triangle',
                filterFreq: 400, // Lower filter for woody sound
                attack: 0.001,
                decay: 0.05
            },
            'metal-spoon': {
                name: 'Metal Spoon',
                frequencies: [800, 1200, 1600, 2000], // Higher, brighter frequencies
                type: 'square',
                filterFreq: 2000, // Higher filter for metallic ring
                attack: 0.0005,
                decay: 0.08
            },
            'plastic-spoon': {
                name: 'Plastic Spoon',
                frequencies: [400, 600, 800, 1000], // Mid-range frequencies
                type: 'sawtooth',
                filterFreq: 1200, // Mid-range filter
                attack: 0.002,
                decay: 0.06
            },
            'ceramic-spoon': {
                name: 'Ceramic Spoon',
                frequencies: [300, 450, 600, 750], // Resonant frequencies
                type: 'sine',
                filterFreq: 800, // Resonant filter
                attack: 0.0015,
                decay: 0.1
            }
        };

        
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
        
        // Add tap anywhere to play sound
        document.addEventListener('click', (e) => {
            if (this.isListening && e.target.tagName !== 'BUTTON') {
                this.triggerSound();
            }
        });
        
        // Add keyboard support
        document.addEventListener('keydown', (e) => {
            if (this.isListening && e.code === 'Space') {
                e.preventDefault();
                this.triggerSound();
            }
        });
    }
    
    checkDeviceSupport() {
        if (!window.DeviceMotionEvent) {
            this.showMessage('Motion sensors not supported - using manual mode', 'info');
            this.manualMode = true;
            return;
        }
        
        if (this.isIOS() && typeof DeviceMotionEvent.requestPermission === 'function') {
            this.showMessage('iOS detected - tap anywhere to play spoon sounds', 'info');
        }
    }
    
    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    }
    
    showMessage(message, type = 'info') {
        // Disabled to prevent white flash effect
        console.log(`Message (${type}): ${message}`);
    }
    
    async startMotionDetection() {
        try {
            this.isListening = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            
            // Initialize audio context
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // Try to request motion permission, but don't require it
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission === 'granted') {
                        window.addEventListener('devicemotion', (e) => this.handleMotion(e), { passive: true });
                        this.showMessage('Motion detection active! Shake or tap to play spoon sounds', 'success');
                    } else {
                        this.showMessage('Motion blocked - tap anywhere to play spoon sounds!', 'info');
                    }
                } catch (error) {
                    this.showMessage('Motion blocked - tap anywhere to play spoon sounds!', 'info');
                }
            } else {
                // Try to add motion listener without permission request
                try {
                    window.addEventListener('devicemotion', (e) => this.handleMotion(e), { passive: true });
                    this.showMessage('Motion detection active! Shake or tap to play spoon sounds', 'success');
                } catch (error) {
                    this.showMessage('Motion blocked - tap anywhere to play spoon sounds!', 'info');
                }
            }
            
            console.log('App started - ready to play spoon sounds!');
            
        } catch (error) {
            console.error('Error starting app:', error);
            this.showMessage('App started - tap anywhere to play spoon sounds!', 'success');
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
        this.showMessage('App stopped', 'info');
    }
    
    handleMotion(event) {
        if (!this.isListening) return;
        
        const acceleration = event.accelerationIncludingGravity;
        if (!acceleration) return;
        
        const magnitude = Math.sqrt(
            acceleration.x * acceleration.x +
            acceleration.y * acceleration.y +
            acceleration.z * acceleration.z
        );
        
        this.updateMotionDisplay(magnitude);
        
        if (magnitude > this.motionThreshold) {
            this.triggerSound();
        }
    }
    
    updateMotionDisplay(magnitude) {
        const percentage = Math.min((magnitude / 50) * 100, 100);
        this.motionProgress.style.width = percentage + '%';
        this.motionValue.textContent = Math.round(magnitude);
    }
    
    triggerSound() {
        const now = Date.now();
        if (now - this.lastSoundTime < this.soundCooldown) return;
        
        this.lastSoundTime = now;
        this.playSpoonSound();
        this.animateSpoon();
    }
    
    playSpoonSound() {
        if (!this.audioContext || this.audioContext.state !== 'running') return;
        
        const soundConfig = this.sounds[this.currentSound];
        const now = this.audioContext.currentTime;
        
        // Create realistic spoon percussion sound
        this.createSpoonPercussion(soundConfig, now);
        
        // Add subtle tonal component for material character
        this.createMaterialTone(soundConfig, now);
        
        // Update display
        this.lastSoundDisplay.textContent = `${soundConfig.name} - Percussion`;
    }
    
    createSpoonPercussion(soundConfig, startTime) {
        // Create multiple noise bursts to simulate spoon collision
        const numBursts = 2 + Math.random() * 2; // 2-4 bursts
        
        for (let i = 0; i < numBursts; i++) {
            const burstTime = startTime + (i * 0.01); // Stagger bursts slightly
            const burstDuration = 0.05 + Math.random() * 0.03; // 50-80ms per burst
            
            // Create noise buffer for this burst
            const bufferSize = this.audioContext.sampleRate * burstDuration;
            const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
            const data = buffer.getChannelData(0);
            
            // Generate percussive noise with envelope
            for (let j = 0; j < bufferSize; j++) {
                const envelope = Math.pow(1 - (j / bufferSize), 2); // Exponential decay
                const noise = (Math.random() * 2 - 1) * envelope;
                data[j] = noise;
            }
            
            // Create noise source
            const noiseSource = this.audioContext.createBufferSource();
            const noiseGain = this.audioContext.createGain();
            const noiseFilter = this.audioContext.createBiquadFilter();
            
            noiseSource.buffer = buffer;
            noiseSource.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.audioContext.destination);
            
            // Filter settings based on spoon material
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(soundConfig.filterFreq, burstTime);
            noiseFilter.Q.setValueAtTime(1 + Math.random() * 2, burstTime);
            
            // Volume envelope - sharp attack, quick decay
            const burstVolume = this.volume * (0.3 + Math.random() * 0.2) * (1 - i * 0.3);
            noiseGain.gain.setValueAtTime(0, burstTime);
            noiseGain.gain.linearRampToValueAtTime(burstVolume, burstTime + 0.001);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, burstTime + burstDuration);
            
            // Play the burst
            noiseSource.start(burstTime);
            noiseSource.stop(burstTime + burstDuration);
        }
    }
    
    createMaterialTone(soundConfig, startTime) {
        // Add subtle tonal component to distinguish materials
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Very short tonal burst (10-20ms)
        const toneDuration = 0.01 + Math.random() * 0.01;
        
        // Random frequency within material range
        const frequencies = soundConfig.frequencies;
        const randomFreq = frequencies[Math.floor(Math.random() * frequencies.length)];
        
        oscillator.frequency.setValueAtTime(randomFreq, startTime);
        oscillator.type = soundConfig.type;
        
        // High-pass filter to remove low frequencies
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(soundConfig.filterFreq * 0.5, startTime);
        filter.Q.setValueAtTime(1, startTime);
        
        // Very quiet tonal component
        const toneVolume = this.volume * 0.1;
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(toneVolume, startTime + 0.001);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + toneDuration);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + toneDuration);
    }
    
    
    animateSpoon() {
        this.spoon.classList.add('active');
        this.soundIndicator.classList.add('active');
        
        setTimeout(() => {
            this.spoon.classList.remove('active');
            this.soundIndicator.classList.remove('active');
        }, 200);
    }
    
    selectSound(sound) {
        this.currentSound = sound;
        
        this.soundBtns.forEach(btn => {
            btn.classList.remove('active');
        });
        
        document.querySelector(`[data-sound="${sound}"]`).classList.add('active');
    }
    
}

document.addEventListener('DOMContentLoaded', () => {
    new SpoonSoundApp();
});