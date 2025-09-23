class SpoonSoundApp {
    constructor() {
        this.isListening = false;
        this.currentSound = 'wooden-spoon';
        this.volume = 1.0; // Fixed at 100% - uses device volume
        this.motionThreshold = 8.0; // Higher threshold for actual shake detection
        this.lastSoundTime = 0;
        this.soundCooldown = 50; // Much shorter cooldown for quick tapping responsiveness
        this.permissionRequested = false;
        this.manualMode = false;
        
        // Motion detection variables
        this.lastAcceleration = { x: 0, y: 0, z: 0 };
        this.lastMotionTime = 0;
        this.motionCooldown = 80; // Much shorter cooldown for rapid shaking and quick tapping
        this.shakeHistory = []; // Track recent shake intensities
        this.audioInstances = []; // Track active audio instances for overlapping
        
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
            const timeSinceLastShake = now - this.lastMotionTime;
            const isFastRhythm = timeSinceLastShake < 400; // Less than 400ms between shakes
            
            console.log(`Vigorous shake detected! Delta: ${totalDelta.toFixed(2)}, Threshold: ${this.motionThreshold}${isFastRhythm ? ' (Fast Rhythm!)' : ''}`);
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
        
        // Check for sustained shaking pattern (faster rhythm detection)
        const recentShakes = this.shakeHistory.filter(h => 
            h.intensity > this.motionThreshold * 0.5 && 
            timestamp - h.timestamp < 150 // Even faster detection for quick tapping
        );
        
        // Require at least 1 significant shake within 150ms for vigorous shake
        if (recentShakes.length < 1) return false;
        
        // Enhanced detection for quick tapping patterns
        if (recentShakes.length === 1) {
            // Single shake - allow if intensity is high enough (lowered threshold for responsiveness)
            return recentShakes[0].intensity > this.motionThreshold * 1.0;
        } else {
            // Multiple shakes - calculate average intensity with lower threshold for quick tapping
            const avgIntensity = recentShakes.reduce((sum, shake) => sum + shake.intensity, 0) / recentShakes.length;
            return avgIntensity > this.motionThreshold * 0.6; // Even lower threshold for rhythm playing
        }
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
        
        // Calculate dynamic sound characteristics based on shake intensity and timing
        const shakeIntensity = this.getCurrentShakeIntensity();
        const rhythmContext = this.getRhythmContext();
        
        // Create varied spoon percussion sound based on intensity and rhythm
        this.createVariedSpoonPercussion(soundConfig, now, shakeIntensity, rhythmContext);
        
        // Add varied tonal component for material character
        this.createVariedMaterialTone(soundConfig, now, shakeIntensity, rhythmContext);
        
        // Update display with rhythm information
        const rhythmInfo = rhythmContext.isFastRhythm ? ' (Fast Rhythm)' : '';
        this.lastSoundDisplay.textContent = `${soundConfig.name} - ${rhythmContext.intensity}${rhythmInfo}`;
        
        // Clean up old audio instances to prevent memory leaks
        this.cleanupAudioInstances();
    }
    
    getCurrentShakeIntensity() {
        // Get the intensity of the most recent shake
        if (this.shakeHistory.length === 0) return 'medium';
        
        const latestShake = this.shakeHistory[this.shakeHistory.length - 1];
        const intensity = latestShake.intensity;
        
        if (intensity > this.motionThreshold * 1.5) return 'strong';
        if (intensity > this.motionThreshold * 1.0) return 'medium';
        return 'light';
    }
    
    getRhythmContext() {
        const now = Date.now();
        const timeSinceLastShake = now - this.lastMotionTime;
        
        // Analyze recent shake pattern
        const recentShakes = this.shakeHistory.filter(h => now - h.timestamp < 1000);
        const avgTimeBetween = this.calculateAverageTimeBetween(recentShakes);
        
        return {
            isFastRhythm: timeSinceLastShake < 250, // Faster detection for quick tapping
            avgTimeBetween: avgTimeBetween,
            intensity: this.getCurrentShakeIntensity(),
            shakeCount: recentShakes.length
        };
    }
    
    calculateAverageTimeBetween(shakes) {
        if (shakes.length < 2) return 1000; // Default to slow
        
        let totalTime = 0;
        for (let i = 1; i < shakes.length; i++) {
            totalTime += shakes[i].timestamp - shakes[i-1].timestamp;
        }
        return totalTime / (shakes.length - 1);
    }
    
    cleanupAudioInstances() {
        // Remove references to finished audio instances
        this.audioInstances = this.audioInstances.filter(instance => {
            try {
                return instance.contextTime < this.audioContext.currentTime + 2; // Keep instances from last 2 seconds
            } catch (e) {
                return false; // Remove if error accessing
            }
        });
    }
    
    createVariedSpoonPercussion(soundConfig, startTime, intensity, rhythmContext) {
        // Create varied noise bursts based on intensity and rhythm
        let numBursts, burstDuration, volumeMultiplier, filterVariation;
        
        // Adjust characteristics based on intensity
        switch (intensity) {
            case 'strong':
                numBursts = 3 + Math.random() * 2; // 3-5 bursts
                burstDuration = 0.08 + Math.random() * 0.04; // 80-120ms
                volumeMultiplier = 1.2;
                filterVariation = 1.5;
                break;
            case 'light':
                numBursts = 1 + Math.random() * 2; // 1-3 bursts
                burstDuration = 0.04 + Math.random() * 0.02; // 40-60ms
                volumeMultiplier = 0.7;
                filterVariation = 0.8;
                break;
            default: // medium
                numBursts = 2 + Math.random() * 2; // 2-4 bursts
                burstDuration = 0.06 + Math.random() * 0.03; // 60-90ms
                volumeMultiplier = 1.0;
                filterVariation = 1.0;
        }
        
        // Adjust for rhythm context - more aggressive for quick tapping
        if (rhythmContext.isFastRhythm) {
            numBursts = Math.max(1, Math.floor(numBursts * 0.7)); // Fewer bursts for fast rhythm
            burstDuration *= 0.6; // Much shorter duration for fast rhythm
            volumeMultiplier *= 1.1; // Slightly louder for quick taps
        }
        
        this.createSpoonPercussionBursts(soundConfig, startTime, numBursts, burstDuration, volumeMultiplier, filterVariation);
    }
    
    createSpoonPercussionBursts(soundConfig, startTime, numBursts, baseDuration, volumeMultiplier, filterVariation) {
        
        for (let i = 0; i < numBursts; i++) {
            const burstTime = startTime + (i * 0.01); // Stagger bursts slightly
            const burstDuration = baseDuration * (0.8 + Math.random() * 0.4); // Vary duration around base
            
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
            
            // Filter settings based on spoon material and intensity
            noiseFilter.type = 'bandpass';
            const filterFreq = soundConfig.filterFreq * filterVariation * (0.8 + Math.random() * 0.4);
            noiseFilter.frequency.setValueAtTime(filterFreq, burstTime);
            noiseFilter.Q.setValueAtTime(1 + Math.random() * 2, burstTime);
            
            // Volume envelope - varies with intensity and burst position
            const baseVolume = this.volume * (0.3 + Math.random() * 0.2) * volumeMultiplier;
            const burstVolume = baseVolume * (1 - i * 0.2); // Gradual decay across bursts
            noiseGain.gain.setValueAtTime(0, burstTime);
            noiseGain.gain.linearRampToValueAtTime(burstVolume, burstTime + 0.001);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, burstTime + burstDuration);
            
            // Play the burst
            noiseSource.start(burstTime);
            noiseSource.stop(burstTime + burstDuration);
            
            // Track audio instance for cleanup
            this.audioInstances.push({
                source: noiseSource,
                contextTime: burstTime + burstDuration
            });
        }
    }
    
    createVariedMaterialTone(soundConfig, startTime, intensity, rhythmContext) {
        // Create enhanced tonal variation with harmonics and frequency sweeps
        const frequencies = soundConfig.frequencies;
        
        // Create multiple oscillators for richer harmonic content
        const numOscillators = intensity === 'strong' ? 3 : (intensity === 'light' ? 1 : 2);
        
        for (let i = 0; i < numOscillators; i++) {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            const filter = this.audioContext.createBiquadFilter();
            
            oscillator.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Vary tone duration based on intensity and oscillator position
            let toneDuration, toneVolume, freqMultiplier, harmonicMultiplier;
            
            switch (intensity) {
                case 'strong':
                    toneDuration = 0.025 + Math.random() * 0.02; // 25-45ms
                    toneVolume = this.volume * (0.12 - i * 0.03); // Decreasing volume for harmonics
                    freqMultiplier = 1.0 + (i * 0.3); // Increasing frequency for harmonics
                    harmonicMultiplier = 1 + i; // Harmonic series
                    break;
                case 'light':
                    toneDuration = 0.01 + Math.random() * 0.008; // 10-18ms
                    toneVolume = this.volume * (0.08 - i * 0.02);
                    freqMultiplier = 1.0 + (i * 0.2);
                    harmonicMultiplier = 1 + (i * 0.5);
                    break;
                default: // medium
                    toneDuration = 0.015 + Math.random() * 0.012; // 15-27ms
                    toneVolume = this.volume * (0.1 - i * 0.025);
                    freqMultiplier = 1.0 + (i * 0.25);
                    harmonicMultiplier = 1 + (i * 0.7);
            }
            
            // Adjust for fast rhythm
            if (rhythmContext.isFastRhythm) {
                toneDuration *= 0.6; // Even shorter for fast rhythm
                toneVolume *= 0.7;
            }
            
            // Enhanced frequency selection with more variation
            let selectedFreq;
            const baseFreqIndex = Math.floor(Math.random() * frequencies.length);
            const baseFreq = frequencies[baseFreqIndex];
            
            if (intensity === 'strong') {
                // Strong shakes: lower base frequency with harmonic overtones
                selectedFreq = baseFreq * freqMultiplier * harmonicMultiplier;
            } else if (intensity === 'light') {
                // Light shakes: higher frequencies with subtle harmonics
                selectedFreq = baseFreq * freqMultiplier * (1 + i * 0.3);
            } else {
                // Medium shakes: random frequency with moderate harmonics
                selectedFreq = baseFreq * freqMultiplier * (1 + i * 0.5);
            }
            
            // Add frequency sweep for more dynamic character
            oscillator.frequency.setValueAtTime(selectedFreq, startTime);
            if (toneDuration > 0.015) { // Only sweep for longer tones
                const sweepEndFreq = selectedFreq * (0.8 + Math.random() * 0.4); // ±20% variation
                oscillator.frequency.linearRampToValueAtTime(sweepEndFreq, startTime + toneDuration * 0.7);
            }
            
            oscillator.type = soundConfig.type;
            
            // Enhanced filter with more dynamic response
            filter.type = 'highpass';
            const filterFreq = soundConfig.filterFreq * (0.3 + i * 0.2) * freqMultiplier;
            filter.frequency.setValueAtTime(filterFreq, startTime);
            filter.Q.setValueAtTime(1 + (intensity === 'strong' ? 0.8 : 0.3), startTime);
            
            // Dynamic volume envelope with more character
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(toneVolume, startTime + 0.002);
            
            // Add subtle volume modulation for more organic sound
            if (toneDuration > 0.02) {
                const modTime = startTime + toneDuration * 0.3;
                const modVolume = toneVolume * (0.7 + Math.random() * 0.3);
                gainNode.gain.linearRampToValueAtTime(modVolume, modTime);
            }
            
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + toneDuration);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + toneDuration);
            
            // Track tonal instance for cleanup
            this.audioInstances.push({
                source: oscillator,
                contextTime: startTime + toneDuration
            });
        }
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