class SpoonSoundApp {
    constructor() {
        this.isListening = false;
        this.currentSound = 'wooden-spoon';
        this.volume = 1.0; // Fixed at 100% - uses device volume
        this.motionThreshold = 8.0; // Higher threshold for actual shake detection
        this.lastSoundTime = 0;
        this.soundCooldown = 300; // Longer cooldown to prevent rapid triggers
        this.permissionRequested = false;
        this.manualMode = false;
        
        // Motion detection variables
        this.lastAcceleration = { x: 0, y: 0, z: 0 };
        this.lastMotionTime = 0;
        this.motionCooldown = 500; // Longer cooldown between shake detections
        this.shakeHistory = []; // Track recent shake intensities
        
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
        
        // Check iOS and permission requirements
        if (this.isIOS()) {
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                this.showMessage('📱 iOS detected - motion permission will be requested when you start the app', 'info');
                console.log('iOS detected - motion permission required');
            } else {
                this.showMessage('📱 iOS detected - motion sensors should work automatically', 'info');
            }
        }
        
        // Check if we're on HTTPS (required for motion sensors)
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            this.showMessage('⚠️ Motion sensors require HTTPS - use manual tapping on HTTP', 'warning');
        }
    }
    
    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    }
    
    showMessage(message, type = 'info') {
        // Enhanced console logging with emojis for better debugging
        const emoji = {
            'info': 'ℹ️',
            'success': '✅',
            'warning': '⚠️',
            'error': '❌'
        }[type] || 'ℹ️';
        
        console.log(`${emoji} ${type.toUpperCase()}: ${message}`);
        
        // Optional: Could add visual notifications here in the future
        // For now, console logging is sufficient for debugging
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
            
            // Request motion permission on iOS
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    console.log('Requesting motion permission...');
                    this.showMessage('📱 Requesting motion sensor access...', 'info');
                    
                    const permission = await DeviceMotionEvent.requestPermission();
                    console.log('Motion permission result:', permission);
                    
                    if (permission === 'granted') {
                        window.addEventListener('devicemotion', (e) => this.handleMotion(e), { passive: true });
                        this.showMessage('🎵 Motion permission granted! Shake your phone to play bluegrass spoons!', 'success');
                        console.log('Motion permission granted - shake detection enabled');
                    } else {
                        this.showMessage('❌ Motion permission denied - you can still tap to play sounds', 'info');
                        console.log('Motion permission denied');
                    }
                } catch (error) {
                    console.error('Error requesting motion permission:', error);
                    this.showMessage('❌ Motion permission error - you can still tap to play sounds', 'info');
                }
            } else {
                // Try to add motion listener without permission request (Android, desktop)
                try {
                    window.addEventListener('devicemotion', (e) => this.handleMotion(e), { passive: true });
                    this.showMessage('🎵 Motion detection active! Shake your phone to play bluegrass spoons!', 'success');
                    console.log('Motion detection enabled without permission request');
                } catch (error) {
                    console.error('Error enabling motion detection:', error);
                    this.showMessage('❌ Motion detection failed - you can still tap to play sounds', 'info');
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
        
        // Try acceleration without gravity first, fallback to with gravity
        let acceleration = event.acceleration;
        if (!acceleration) {
            acceleration = event.accelerationIncludingGravity;
        }
        if (!acceleration) return;
        
        const now = Date.now();
        
        // Calculate change in acceleration (this detects shakes better)
        const deltaX = Math.abs(acceleration.x - this.lastAcceleration.x);
        const deltaY = Math.abs(acceleration.y - this.lastAcceleration.y);
        const deltaZ = Math.abs(acceleration.z - this.lastAcceleration.z);
        
        // Calculate total acceleration change
        const totalDelta = deltaX + deltaY + deltaZ;
        
        // Add to shake history for pattern detection
        this.shakeHistory.push({
            intensity: totalDelta,
            timestamp: now
        });
        
        // Keep only recent history (last 500ms)
        this.shakeHistory = this.shakeHistory.filter(h => now - h.timestamp < 500);
        
        // Update motion display with current acceleration magnitude
        const currentMagnitude = Math.sqrt(
            acceleration.x * acceleration.x +
            acceleration.y * acceleration.y +
            acceleration.z * acceleration.z
        );
        this.updateMotionDisplay(currentMagnitude);
        
        // Enhanced shake detection - require sustained vigorous movement
        const isSignificantShake = this.detectVigorousShake(totalDelta, now);
        
        if (isSignificantShake && now - this.lastMotionTime > this.motionCooldown) {
            console.log(`Vigorous shake detected! Delta: ${totalDelta.toFixed(2)}, Threshold: ${this.motionThreshold}`);
            this.triggerSound();
            this.lastMotionTime = now;
        }
        
        // Store current acceleration for next comparison
        this.lastAcceleration = {
            x: acceleration.x,
            y: acceleration.y,
            z: acceleration.z
        };
    }
    
    detectVigorousShake(currentIntensity, timestamp) {
        // Require high intensity
        if (currentIntensity < this.motionThreshold) return false;
        
        // Check for sustained shaking pattern
        const recentShakes = this.shakeHistory.filter(h => 
            h.intensity > this.motionThreshold * 0.7 && 
            timestamp - h.timestamp < 300
        );
        
        // Require at least 2 significant shakes within 300ms for vigorous shake
        if (recentShakes.length < 2) return false;
        
        // Calculate average intensity of recent shakes
        const avgIntensity = recentShakes.reduce((sum, shake) => sum + shake.intensity, 0) / recentShakes.length;
        
        // Require sustained high intensity
        return avgIntensity > this.motionThreshold * 0.8;
    }
    
    updateMotionDisplay(magnitude) {
        // Scale for better visual feedback (shake detection range)
        const percentage = Math.min((magnitude / 15) * 100, 100);
        this.motionProgress.style.width = percentage + '%';
        this.motionValue.textContent = magnitude.toFixed(1);
        
        // Change color based on shake intensity
        const progressBar = this.motionProgress;
        if (magnitude > this.motionThreshold) {
            progressBar.style.background = 'linear-gradient(90deg, #32CD32, #FFD700, #FF6347)';
        } else if (magnitude > this.motionThreshold * 0.7) {
            progressBar.style.background = 'linear-gradient(90deg, #32CD32, #FFD700)';
        } else {
            progressBar.style.background = 'linear-gradient(90deg, #32CD32)';
        }
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