
class SpoonSoundApp {
    constructor() {
        // App state
        this.isListening = false;
        this.currentSound = 'wooden-spoon';
        this.tempo = 1.0; // Playing speed multiplier

        // Audio dynamics
        this.baseVolume = 4.0; // master volume (boosted for desktop testing)
        
        // Effects system - now controlled by device rotation
        this.masterEffectsEnabled = false; // Master effects off by default
        this.wetDryMix = 0.0; // Start at 0% wet (dry signal only)
        this.effects = {
            dubDelay: {
                enabled: false,       // Off by default
                delayTime: 0.25,      // 250ms delay
                feedback: 0.4,        // 40% feedback
                filterFreq: 800,      // Low-pass filter on delay
                wetDryMix: 0.0        // Start at 0% wet (dry signal only)
            },
            overdrive: {
                enabled: false,       // Off by default
                drive: 0.3,          // 30% drive amount
                tone: 0.6,           // 60% tone control
                level: 1.0,          // 100% output level
                wetDryMix: 0.0       // Start at 0% wet (dry signal only)
            },
            reverb: {
                enabled: false,       // Off by default
                roomSize: 0.8,        // Room size in seconds (0.1-2.0)
                decay: 1.5,          // Decay time in seconds (0.1-3.0)
                damping: 0.3,        // High frequency damping (0-1)
                wetDryMix: 0.0       // Start at 0% wet (dry signal only)
            }
        };

        // Device orientation tracking
        this.deviceOrientation = {
            alpha: 0,    // Z-axis rotation (yaw) - 0 to 360
            beta: 0,     // X-axis rotation (pitch) - -180 to 180  
            gamma: 0     // Y-axis rotation (roll) - -90 to 90
        };
        
        // Orientation calibration
        this.orientationCalibrated = false;
        this.orientationOffset = { alpha: 0, beta: 0, gamma: 0 };

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
                // Enhanced parameters based on real wooden spoon waveform analysis
                attackTime: 0.0005,  // Much sharper attack (0.5ms vs default 1ms)
                decayCurve: 'wood',  // Material-specific decay
                resonanceQ: 2.5,     // Wood has higher Q factor for resonance
                harmonicContent: [1.0, 0.6, 0.3, 0.15, 0.08], // Harmonic amplitude ratios
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

        // Effects controls
        this.setupEffectsControls();
        
        // Device orientation controls
        this.setupOrientationControls();
        
        // Easter egg: Add Sounds button
        this.setupAddSoundsButton();
    }

    setupEffectsControls() {
        // Wet/Dry mix control
        document.getElementById('wetDryMix').addEventListener('input', (e) => {
            this.wetDryMix = parseFloat(e.target.value);
            document.getElementById('wetDryValue').textContent = Math.round(this.wetDryMix * 100) + '%';
            console.log('Wet/Dry Mix:', Math.round(this.wetDryMix * 100) + '%');
            this.updateEffectsChain();
        });

        // Master effects toggle
        document.getElementById('masterEffectsToggle').addEventListener('change', (e) => {
            this.masterEffectsEnabled = e.target.checked;
            console.log('Master Effects:', this.masterEffectsEnabled ? 'ON' : 'OFF');
            this.updateEffectsChain();
        });

        // Individual effect toggles
        document.getElementById('dubDelayToggle').addEventListener('change', (e) => {
            this.effects.dubDelay.enabled = e.target.checked;
            console.log('Dub Delay:', this.effects.dubDelay.enabled ? 'ON' : 'OFF');
            this.updatePedalVisualState('dub-delay', this.effects.dubDelay.enabled);
            this.updateEffectsChain();
        });


        document.getElementById('overdriveToggle').addEventListener('change', (e) => {
            this.effects.overdrive.enabled = e.target.checked;
            console.log('Overdrive:', this.effects.overdrive.enabled ? 'ON' : 'OFF');
            this.updatePedalVisualState('overdrive', this.effects.overdrive.enabled);
            this.updateEffectsChain();
        });

        document.getElementById('reverbToggle').addEventListener('change', (e) => {
            this.effects.reverb.enabled = e.target.checked;
            console.log('Reverb:', this.effects.reverb.enabled ? 'ON' : 'OFF');
            this.updatePedalVisualState('reverb', this.effects.reverb.enabled);
            this.updateEffectsChain();
        });

        // Dub Delay controls (manual overrides)
        document.getElementById('delayFeedback').addEventListener('input', (e) => {
            this.effects.dubDelay.feedback = parseFloat(e.target.value);
            document.getElementById('delayFeedbackValue').textContent = Math.round(this.effects.dubDelay.feedback * 100) + '%';
            this.updateEffectsChain();
        });

        document.getElementById('delayWetDry').addEventListener('input', (e) => {
            this.effects.dubDelay.wetDryMix = parseFloat(e.target.value);
            document.getElementById('delayWetDryValue').textContent = Math.round(this.effects.dubDelay.wetDryMix * 100) + '%';
            console.log('Delay Wet/Dry:', Math.round(this.effects.dubDelay.wetDryMix * 100) + '%');
            this.updateEffectsChain();
        });


        // Overdrive controls
        document.getElementById('overdriveDrive').addEventListener('input', (e) => {
            this.effects.overdrive.drive = parseFloat(e.target.value);
            document.getElementById('overdriveDriveValue').textContent = Math.round(this.effects.overdrive.drive * 100) + '%';
            console.log('Overdrive Drive:', Math.round(this.effects.overdrive.drive * 100) + '%');
            this.updateEffectsChain();
        });

        document.getElementById('overdriveTone').addEventListener('input', (e) => {
            this.effects.overdrive.tone = parseFloat(e.target.value);
            document.getElementById('overdriveToneValue').textContent = Math.round(this.effects.overdrive.tone * 100) + '%';
            console.log('Overdrive Tone:', Math.round(this.effects.overdrive.tone * 100) + '%');
            this.updateEffectsChain();
        });

        document.getElementById('overdriveLevel').addEventListener('input', (e) => {
            this.effects.overdrive.level = parseFloat(e.target.value);
            document.getElementById('overdriveLevelValue').textContent = Math.round(this.effects.overdrive.level * 100) + '%';
            console.log('Overdrive Level:', Math.round(this.effects.overdrive.level * 100) + '%');
            this.updateEffectsChain();
        });

        document.getElementById('overdriveWetDry').addEventListener('input', (e) => {
            this.effects.overdrive.wetDryMix = parseFloat(e.target.value);
            document.getElementById('overdriveWetDryValue').textContent = Math.round(this.effects.overdrive.wetDryMix * 100) + '%';
            console.log('Overdrive Wet/Dry:', Math.round(this.effects.overdrive.wetDryMix * 100) + '%');
            this.updateEffectsChain();
        });

        // Reverb controls
        document.getElementById('reverbRoomSize').addEventListener('input', (e) => {
            this.effects.reverb.roomSize = parseFloat(e.target.value);
            document.getElementById('reverbRoomSizeValue').textContent = this.effects.reverb.roomSize.toFixed(1) + 's';
            console.log('Reverb Room Size:', this.effects.reverb.roomSize.toFixed(1) + 's');
            this.updateEffectsChain();
        });

        document.getElementById('reverbDecay').addEventListener('input', (e) => {
            this.effects.reverb.decay = parseFloat(e.target.value);
            document.getElementById('reverbDecayValue').textContent = this.effects.reverb.decay.toFixed(1) + 's';
            console.log('Reverb Decay:', this.effects.reverb.decay.toFixed(1) + 's');
            this.updateEffectsChain();
        });

        document.getElementById('reverbDamping').addEventListener('input', (e) => {
            this.effects.reverb.damping = parseFloat(e.target.value);
            document.getElementById('reverbDampingValue').textContent = Math.round(this.effects.reverb.damping * 100) + '%';
            console.log('Reverb Damping:', Math.round(this.effects.reverb.damping * 100) + '%');
            this.updateEffectsChain();
        });

        document.getElementById('reverbWetDry').addEventListener('input', (e) => {
            this.effects.reverb.wetDryMix = parseFloat(e.target.value);
            document.getElementById('reverbWetDryValue').textContent = Math.round(this.effects.reverb.wetDryMix * 100) + '%';
            console.log('Reverb Wet/Dry:', Math.round(this.effects.reverb.wetDryMix * 100) + '%');
            this.updateEffectsChain();
        });
    }

    updatePedalVisualState(pedalClass, enabled) {
        const pedalElement = document.querySelector(`.${pedalClass}`);
        if (pedalElement) {
            if (enabled) {
                pedalElement.classList.remove('disabled');
            } else {
                pedalElement.classList.add('disabled');
            }
        }
    }

    setupAddSoundsButton() {
        const addSoundsBtn = document.getElementById('addSoundsBtn');
        if (!addSoundsBtn) return;

        let clickCount = 0;
        const easterEggMessages = [
            "🎵 Adding more spoons to the collection...",
            "🥄 Searching for rare spoon sounds...",
            "🎶 Unlocking hidden audio treasures...",
            "✨ Discovering new musical possibilities...",
            "🎪 Preparing a spoon symphony...",
            "🎭 Creating magical sound experiences...",
            "🌟 Summoning the Spoon Wizard...",
            "🎨 Painting with sound waves...",
            "🚀 Launching into audio space...",
            "🎊 Easter egg activated! 🎊"
        ];

        addSoundsBtn.addEventListener('click', () => {
            clickCount++;
            
            // Add visual feedback
            addSoundsBtn.classList.add('easter-egg-active');
            setTimeout(() => {
                addSoundsBtn.classList.remove('easter-egg-active');
            }, 600);

            // Show different messages based on click count
            const messageIndex = Math.min(clickCount - 1, easterEggMessages.length - 1);
            const message = easterEggMessages[messageIndex];
            
            console.log(`🥚 Easter Egg #${clickCount}: ${message}`);
            
            // Create a temporary toast notification
            this.showEasterEggToast(message, clickCount);
            
            // Special behavior for 10th click
            if (clickCount === 10) {
                console.log('🎊 Ultimate Easter Egg Unlocked! 🎊');
                this.unlockUltimateEasterEgg();
                clickCount = 0; // Reset counter
            }
        });
    }

    showEasterEggToast(message, clickCount) {
        // Remove existing toast if any
        const existingToast = document.querySelector('.easter-egg-toast');
        if (existingToast) {
            existingToast.remove();
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'easter-egg-toast';
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">🥚</span>
                <span class="toast-message">${message}</span>
                <span class="toast-count">#${clickCount}</span>
            </div>
        `;

        // Style the toast
        Object.assign(toast.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.95) 0%, rgba(184, 134, 11, 0.95) 100%)',
            color: '#FFF8DC',
            padding: '12px 16px',
            borderRadius: '12px',
            boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(255, 248, 220, 0.3)',
            zIndex: '10000',
            fontFamily: "'Cinzel', serif",
            fontSize: '0.9rem',
            fontWeight: 'bold',
            textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease-in-out',
            maxWidth: '300px',
            wordWrap: 'break-word'
        });

        // Style toast content
        const toastContent = toast.querySelector('.toast-content');
        Object.assign(toastContent.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        });

        // Style toast elements
        const toastIcon = toast.querySelector('.toast-icon');
        Object.assign(toastIcon.style, {
            fontSize: '1.2rem'
        });

        const toastMessage = toast.querySelector('.toast-message');
        Object.assign(toastMessage.style, {
            flex: '1'
        });

        const toastCount = toast.querySelector('.toast-count');
        Object.assign(toastCount.style, {
            background: 'rgba(255, 248, 220, 0.3)',
            padding: '2px 6px',
            borderRadius: '6px',
            fontSize: '0.8rem'
        });

        // Add to DOM
        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 10);

        // Remove after delay
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    unlockUltimateEasterEgg() {
        // Create ultimate easter egg notification
        const ultimateToast = document.createElement('div');
        ultimateToast.className = 'ultimate-easter-egg';
        ultimateToast.innerHTML = `
            <div class="ultimate-content">
                <div class="ultimate-icon">🎊</div>
                <div class="ultimate-title">Ultimate Easter Egg!</div>
                <div class="ultimate-message">You've discovered the hidden spoon collection! The Spoon Wizard is impressed by your dedication to the art of musical spoonery.</div>
                <div class="ultimate-reward">✨ Bonus: All effects are now 10% more magical! ✨</div>
            </div>
        `;

        // Style the ultimate toast
        Object.assign(ultimateToast.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) scale(0)',
            background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.98) 0%, rgba(184, 134, 11, 0.98) 100%)',
            color: '#FFF8DC',
            padding: '24px',
            borderRadius: '20px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(20px)',
            border: '3px solid rgba(255, 248, 220, 0.4)',
            zIndex: '10001',
            fontFamily: "'Cinzel', serif",
            textAlign: 'center',
            maxWidth: '400px',
            wordWrap: 'break-word',
            transition: 'transform 0.5s ease-in-out'
        });

        // Style ultimate content
        const ultimateContent = ultimateToast.querySelector('.ultimate-content');
        Object.assign(ultimateContent.style, {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
        });

        const ultimateIcon = ultimateToast.querySelector('.ultimate-icon');
        Object.assign(ultimateIcon.style, {
            fontSize: '3rem',
            animation: 'spin 2s linear infinite'
        });

        const ultimateTitle = ultimateToast.querySelector('.ultimate-title');
        Object.assign(ultimateTitle.style, {
            fontSize: '1.5rem',
            fontWeight: 'bold',
            textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
        });

        const ultimateMessage = ultimateToast.querySelector('.ultimate-message');
        Object.assign(ultimateMessage.style, {
            fontSize: '1rem',
            lineHeight: '1.4',
            textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
        });

        const ultimateReward = ultimateToast.querySelector('.ultimate-reward');
        Object.assign(ultimateReward.style, {
            fontSize: '0.9rem',
            fontWeight: 'bold',
            color: '#FFD700',
            textShadow: '1px 1px 2px rgba(0,0,0,0.5)'
        });

        // Add spin animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);

        // Add to DOM
        document.body.appendChild(ultimateToast);

        // Animate in
        setTimeout(() => {
            ultimateToast.style.transform = 'translate(-50%, -50%) scale(1)';
        }, 10);

        // Remove after delay
        setTimeout(() => {
            ultimateToast.style.transform = 'translate(-50%, -50%) scale(0)';
            setTimeout(() => {
                if (ultimateToast.parentNode) {
                    ultimateToast.parentNode.removeChild(ultimateToast);
                }
                if (style.parentNode) {
                    style.parentNode.removeChild(style);
                }
            }, 500);
        }, 5000);

        // Apply bonus effect (10% more magical effects)
        this.applyEasterEggBonus();
    }

    applyEasterEggBonus() {
        // Boost all effect parameters by 10% for a magical feel
        this.effects.dubDelay.feedback *= 1.1;
        this.effects.dubDelay.wetDryMix *= 1.1;
        this.effects.overdrive.drive *= 1.1;
        this.effects.overdrive.tone *= 1.1;
        this.effects.overdrive.wetDryMix *= 1.1;
        this.effects.reverb.roomSize *= 1.1;
        this.effects.reverb.decay *= 1.1;
        this.effects.reverb.wetDryMix *= 1.1;
        
        // Update the effects chain
        this.updateEffectsChain();
        
        console.log('✨ Easter Egg Bonus Applied: All effects are now 10% more magical! ✨');
    }

    updateEffectsChain() {
        // Update existing effects chain parameters
        if (this.effectsChain) {
            // Update delay parameters
            if (this.effectsChain.dubDelay && this.masterEffectsEnabled && this.effects.dubDelay.enabled) {
                const { delayNode, feedbackGain, filterNode, wetGain, dryGain } = this.effectsChain.dubDelay;
                delayNode.delayTime.setValueAtTime(this.effects.dubDelay.delayTime, this.audioContext.currentTime);
                feedbackGain.gain.setValueAtTime(this.effects.dubDelay.feedback, this.audioContext.currentTime);
                filterNode.frequency.setValueAtTime(this.effects.dubDelay.filterFreq, this.audioContext.currentTime);
                wetGain.gain.setValueAtTime(this.effects.dubDelay.wetDryMix, this.audioContext.currentTime);
                dryGain.gain.setValueAtTime(1 - this.effects.dubDelay.wetDryMix, this.audioContext.currentTime);
            }


            // Update overdrive parameters
            if (this.effectsChain.overdrive && this.masterEffectsEnabled && this.effects.overdrive.enabled) {
                const { driveGain, toneFilter, levelGain, waveShaper, wetGain, dryGain } = this.effectsChain.overdrive;
                
                // Update drive gain
                driveGain.gain.setValueAtTime(1 + (this.effects.overdrive.drive * 10), this.audioContext.currentTime);
                
                // Update tone filter
                toneFilter.frequency.setValueAtTime(80 + (this.effects.overdrive.tone * 200), this.audioContext.currentTime);
                
                // Update output level
                levelGain.gain.setValueAtTime(this.effects.overdrive.level * 0.8, this.audioContext.currentTime);
                
                // Update wave shaper curve for drive amount
                const samples = 44100;
                const curve = new Float32Array(samples);
                for (let i = 0; i < samples; i++) {
                    const x = (i * 2) / samples - 1;
                    const driveAmount = 1 + this.effects.overdrive.drive * 3;
                    curve[i] = Math.tanh(x * driveAmount) / driveAmount;
                }
                waveShaper.curve = curve;
                
                // Update wet/dry mix
                wetGain.gain.setValueAtTime(this.effects.overdrive.wetDryMix, this.audioContext.currentTime);
                dryGain.gain.setValueAtTime(1 - this.effects.overdrive.wetDryMix, this.audioContext.currentTime);
            }

            // Update reverb parameters
            if (this.effectsChain.reverb && this.masterEffectsEnabled && this.effects.reverb.enabled) {
                const { convolver, wetGain, dryGain } = this.effectsChain.reverb;
                // Create new impulse response if parameters changed
                const newImpulse = this.createReverbImpulse(this.effects.reverb.roomSize, this.effects.reverb.decay, this.effects.reverb.damping);
                convolver.buffer = newImpulse;
                wetGain.gain.setValueAtTime(this.effects.reverb.wetDryMix, this.audioContext.currentTime);
                dryGain.gain.setValueAtTime(1 - this.effects.reverb.wetDryMix, this.audioContext.currentTime);
            }

            // Update wet/dry mix levels
            if (this.effectsChain.wetDryMix) {
                const { dryGain, wetGain } = this.effectsChain.wetDryMix;
                dryGain.gain.setValueAtTime(1 - this.wetDryMix, this.audioContext.currentTime);
                wetGain.gain.setValueAtTime(this.wetDryMix, this.audioContext.currentTime);
            }
        }
    }

    setupOrientationControls() {
        // Check if device orientation is supported
        if (!window.DeviceOrientationEvent) {
            console.log('❌ Device orientation not supported');
            return;
        }

        // Request permission for iOS
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            console.log('📱 Device orientation permission needed');
        }

        // Bind the orientation handler
        this._onDeviceOrientation = (e) => this.handleOrientation(e);
        
        // Add orientation event listener
        window.addEventListener('deviceorientation', this._onDeviceOrientation, true);
        
        console.log('🎛️ Device orientation tracking enabled for effects control');
    }

    handleOrientation(event) {
        if (!this.isListening) return;

        // Update orientation data
        this.deviceOrientation.alpha = event.alpha || 0;  // Z-axis (yaw)
        this.deviceOrientation.beta = event.beta || 0;    // X-axis (pitch) 
        this.deviceOrientation.gamma = event.gamma || 0;  // Y-axis (roll)

        // Calibrate on first reading
        if (!this.orientationCalibrated) {
            this.orientationOffset = {
                alpha: this.deviceOrientation.alpha,
                beta: this.deviceOrientation.beta,
                gamma: this.deviceOrientation.gamma
            };
            this.orientationCalibrated = true;
            console.log('🎛️ Orientation calibrated:', this.orientationOffset);
        }

        // Calculate relative orientation (subtract calibration offset)
        const relativeOrientation = {
            alpha: this.deviceOrientation.alpha - this.orientationOffset.alpha,
            beta: this.deviceOrientation.beta - this.orientationOffset.beta,
            gamma: this.deviceOrientation.gamma - this.orientationOffset.gamma
        };

        // Map orientation to effects parameters
        this.updateEffectsFromOrientation(relativeOrientation);
    }

    updateEffectsFromOrientation(orientation) {
        // Only use Roll (gamma) for practical real-world testing
        // Roll controls delay wet/dry mix
        // Clamp roll to ±45 degrees for realistic wrist rotation
        const clampedRoll = Math.max(-45, Math.min(45, orientation.gamma));
        // Convert -45 to +45 degrees to 0-1 wet/dry range
        const normalizedRoll = (clampedRoll + 45) / 90;
        this.effects.dubDelay.wetDryMix = Math.max(0, Math.min(1, normalizedRoll));

        // Update the effects chain with new parameters
        this.updateEffectsChain();
        
        // Update UI display values
        this.updateOrientationDisplay(orientation);
    }

    updateOrientationDisplay(orientation) {
        // Update delay wet/dry display
        const delayWetDryElement = document.getElementById('delayWetDryValue');
        if (delayWetDryElement) {
            delayWetDryElement.textContent = Math.round(this.effects.dubDelay.wetDryMix * 100) + '%';
        }

        // Update orientation display (if element exists) - only show roll control
        const orientationDisplay = document.getElementById('orientationDisplay');
        if (orientationDisplay) {
            const clampedRoll = Math.max(-45, Math.min(45, orientation.gamma));
            orientationDisplay.innerHTML = `
                <div>Roll: ${clampedRoll.toFixed(1)}° (±45° range) → Delay Wet/Dry: ${Math.round(this.effects.dubDelay.wetDryMix * 100)}%</div>
            `;
        }
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
                    console.log('📱 Requesting motion and orientation permissions...');
                    const motionPermission = await DeviceMotionEvent.requestPermission();
                    const orientationPermission = await DeviceOrientationEvent.requestPermission();
                    console.log('Motion permission result:', motionPermission);
                    console.log('Orientation permission result:', orientationPermission);
                    
                    if (motionPermission === 'granted') {
                        // Permission granted - add motion listener
                        window.addEventListener('devicemotion', (e) => this.handleMotion(e), { passive: true });
                        console.log('✅ Motion permission granted! Shake your phone to play shaki spoons!');
                    } else {
                        console.log('❌ Motion permission denied - you can still tap to play sounds');
                    }

                    if (orientationPermission === 'granted') {
                        console.log('✅ Orientation permission granted! Rotate your device to control effects!');
                    } else {
                        console.log('❌ Orientation permission denied - effects will use default values');
                    }
                } catch (error) {
                    console.error('Error requesting permissions:', error);
                    console.log('❌ Permission error - you can still tap to play sounds');
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
        window.removeEventListener('deviceorientation', this._onDeviceOrientation);

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

    createReverbImpulse(roomSize, decay, damping) {
        const sampleRate = this.audioContext.sampleRate;
        const length = Math.floor(sampleRate * roomSize);
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            
            for (let i = 0; i < length; i++) {
                // Create a decaying noise burst
                const n = length - i;
                const decayValue = Math.pow(n / length, decay);
                const noise = (Math.random() * 2 - 1) * decayValue;
                
                // Apply damping (reduce high frequencies over time)
                const dampingValue = Math.pow(damping, i / length);
                
                channelData[i] = noise * dampingValue;
            }
        }
        
        return impulse;
    }

    // Create effects processing chain
    createEffectsChain(source) {
        if (!this.effectsChain) {
            this.effectsChain = {
                dubDelay: null,
                reverb: null,
                overdrive: null,
                output: this.audioContext.destination
            };
        }

        let currentNode = source;

        // Dub Delay Effect
        if (this.masterEffectsEnabled && this.effects.dubDelay.enabled) {
            const delayNode = this.audioContext.createDelay(1.0);
            const feedbackGain = this.audioContext.createGain();
            const filterNode = this.audioContext.createBiquadFilter();
            const wetGain = this.audioContext.createGain();
            const dryGain = this.audioContext.createGain();

            // Configure delay
            delayNode.delayTime.setValueAtTime(this.effects.dubDelay.delayTime, this.audioContext.currentTime);
            feedbackGain.gain.setValueAtTime(this.effects.dubDelay.feedback, this.audioContext.currentTime);
            filterNode.type = 'lowpass';
            filterNode.frequency.setValueAtTime(this.effects.dubDelay.filterFreq, this.audioContext.currentTime);
            filterNode.Q.setValueAtTime(1, this.audioContext.currentTime);

            // Individual wet/dry mix controls
            wetGain.gain.setValueAtTime(this.effects.dubDelay.wetDryMix, this.audioContext.currentTime);
            dryGain.gain.setValueAtTime(1 - this.effects.dubDelay.wetDryMix, this.audioContext.currentTime);

            // Connect the delay chain
            currentNode.connect(dryGain);
            currentNode.connect(delayNode);
            delayNode.connect(filterNode);
            filterNode.connect(feedbackGain);
            feedbackGain.connect(delayNode);
            delayNode.connect(wetGain);

            // Merge dry and wet
            const merger = this.audioContext.createChannelMerger(2);
            dryGain.connect(merger, 0, 0);
            wetGain.connect(merger, 0, 1);

            currentNode = merger;
            this.effectsChain.dubDelay = { delayNode, feedbackGain, filterNode, wetGain, dryGain };
        }

        // Reverb Effect
        if (this.masterEffectsEnabled && this.effects.reverb.enabled) {
            const wetGain = this.audioContext.createGain();
            const dryGain = this.audioContext.createGain();
            
            // Create reverb using convolver with impulse response
            const convolver = this.audioContext.createConvolver();
            const impulseBuffer = this.createReverbImpulse(this.effects.reverb.roomSize, this.effects.reverb.decay, this.effects.reverb.damping);
            convolver.buffer = impulseBuffer;

            // Individual wet/dry mix controls
            wetGain.gain.setValueAtTime(this.effects.reverb.wetDryMix, this.audioContext.currentTime);
            dryGain.gain.setValueAtTime(1 - this.effects.reverb.wetDryMix, this.audioContext.currentTime);

            // Connect reverb chain
            currentNode.connect(dryGain);
            currentNode.connect(convolver);
            convolver.connect(wetGain);

            // Merge dry and wet
            const merger = this.audioContext.createChannelMerger(2);
            dryGain.connect(merger, 0, 0);
            wetGain.connect(merger, 0, 1);

            currentNode = merger;
            this.effectsChain.reverb = { convolver, wetGain, dryGain };
        }

        // Overdrive Effect
        if (this.masterEffectsEnabled && this.effects.overdrive.enabled) {
            const wetGain = this.audioContext.createGain();
            const dryGain = this.audioContext.createGain();
            
            // Create overdrive using soft clipping
            const driveGain = this.audioContext.createGain();
            const toneFilter = this.audioContext.createBiquadFilter();
            const levelGain = this.audioContext.createGain();
            const waveShaper = this.audioContext.createWaveShaper();
            
            // Configure drive gain (pre-distortion)
            driveGain.gain.setValueAtTime(1 + (this.effects.overdrive.drive * 10), this.audioContext.currentTime);
            
            // Configure tone filter (high-pass to roll off low end)
            toneFilter.type = 'highpass';
            toneFilter.frequency.setValueAtTime(80 + (this.effects.overdrive.tone * 200), this.audioContext.currentTime);
            toneFilter.Q.setValueAtTime(0.5, this.audioContext.currentTime);
            
            // Configure output level
            levelGain.gain.setValueAtTime(this.effects.overdrive.level * 0.8, this.audioContext.currentTime);
            
            // Create soft clipping curve for warm overdrive
            const samples = 44100;
            const curve = new Float32Array(samples);
            for (let i = 0; i < samples; i++) {
                const x = (i * 2) / samples - 1;
                // Soft clipping using tanh approximation for tube-like warmth
                const driveAmount = 1 + this.effects.overdrive.drive * 3;
                curve[i] = Math.tanh(x * driveAmount) / driveAmount;
            }
            waveShaper.curve = curve;

            // Individual wet/dry mix controls
            wetGain.gain.setValueAtTime(this.effects.overdrive.wetDryMix, this.audioContext.currentTime);
            dryGain.gain.setValueAtTime(1 - this.effects.overdrive.wetDryMix, this.audioContext.currentTime);

            // Connect overdrive chain
            currentNode.connect(dryGain);
            currentNode.connect(driveGain);
            driveGain.connect(waveShaper);
            waveShaper.connect(toneFilter);
            toneFilter.connect(levelGain);
            levelGain.connect(wetGain);

            // Merge dry and wet
            const merger = this.audioContext.createChannelMerger(2);
            dryGain.connect(merger, 0, 0);
            wetGain.connect(merger, 0, 1);

            currentNode = merger;
            this.effectsChain.overdrive = { driveGain, toneFilter, levelGain, waveShaper, wetGain, dryGain };
        }

        // Final wet/dry mix stage
        const dryGain = this.audioContext.createGain();
        const wetGain = this.audioContext.createGain();
        const finalMerger = this.audioContext.createChannelMerger(2);

        // Connect dry signal (bypass effects)
        source.connect(dryGain);
        dryGain.connect(finalMerger, 0, 0);

        // Connect wet signal (through effects)
        currentNode.connect(wetGain);
        wetGain.connect(finalMerger, 0, 1);

        // Set wet/dry mix levels
        dryGain.gain.setValueAtTime(1 - this.wetDryMix, this.audioContext.currentTime);
        wetGain.gain.setValueAtTime(this.wetDryMix, this.audioContext.currentTime);

        // Connect to output
        finalMerger.connect(this.effectsChain.output);

        // Store wet/dry gain nodes for updates
        this.effectsChain.wetDryMix = { dryGain, wetGain };

        return finalMerger;
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
            
            // Apply effects chain
            this.createEffectsChain(gain);

            // Filter (bandpass) varies with intensity
            filter.type = 'bandpass';
            const ff = cfg.filterFreq * filtMul * (0.8 + Math.random() * 0.4);
            filter.frequency.setValueAtTime(ff, t);
            filter.Q.setValueAtTime(1 + Math.random() * 2, t);

            // Enhanced volume dynamics for authentic arpeggiation (boosted for desktop testing)
            let vol;
            if (tempo > 2.0) {
                // ARPEGGIATED: Create cascading volume pattern (like the waveform)
                // First hit is strong, then slight decay with some accents
                const baseVol = finalVolume * (1.2 + Math.random() * 0.6) * volMul; // Boosted from 0.8-1.2 to 1.2-1.8
                if (i === 0) {
                    vol = baseVol * 1.3; // Strong first hit
                } else if (i === numBursts - 1) {
                    vol = baseVol * 0.9; // Slight accent on last hit
                } else {
                    vol = baseVol * (0.8 + Math.random() * 0.4); // Variable middle hits
                }
            } else if (tempo > 1.5) {
                // SYNCOPATED: Alternating strong/weak pattern
                const baseVol = finalVolume * (1.0 + Math.random() * 0.4) * volMul; // Boosted from 0.7-1.0 to 1.0-1.4
                vol = baseVol * (i % 2 === 0 ? 1.2 : 0.9);
            } else {
                // NORMAL/SPARSE: Traditional decay pattern
                const base = finalVolume * (0.9 + Math.random() * 0.4) * volMul; // Boosted from 0.6-0.9 to 0.9-1.3
                vol = base * (1 - i * 0.15); // Reduced decay for louder sustained hits
            }
            
            // Use material-specific attack time for sharper percussive attack
            const attackTime = cfg.attackTime || 0.001; // Default 1ms, wood uses 0.5ms
            
            // Debug: Log when using enhanced attack time
            if (cfg.attackTime && cfg.attackTime < 0.001) {
                console.log('⚡ Using enhanced attack time:', attackTime, 'for', cfg.name);
            }
            
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(vol, t + attackTime);
            gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

            noise.start(t);
            noise.stop(t + dur);

            this.audioInstances.push({ source: noise, contextTime: t + dur });
        }
    }

    // Richer tonal component: adds material-specific harmonics and resonance based on waveform analysis
    createRichMaterialTone(cfg, startTime, intensity, rhythm, finalVolume, tempo = 1.0) {
        // Enhanced harmonic generation for wooden spoon based on real waveform analysis
        const harmonics = cfg.harmonicContent || [1.0, 0.6, 0.3, 0.15, 0.08];
        const resonanceQ = cfg.resonanceQ || 1.0;
        
        // Debug: Log when using enhanced wooden spoon parameters
        if (cfg.name === 'Wooden Spoon' && cfg.harmonicContent) {
            console.log('🎵 Using enhanced wooden spoon synthesis with', harmonics.length, 'harmonics');
        }
        
        // Debug: Log boosted volume levels for desktop testing
        console.log('🔊 Boosted volume levels active - base:', this.baseVolume, 'toneVol:', toneVol);
        
        // Create multiple oscillators for harmonic richness (like real wooden resonance)
        const oscillators = [];
        const gains = [];
        const filters = [];
        
        for (let i = 0; i < harmonics.length; i++) {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            const filter = this.audioContext.createBiquadFilter();
            
            osc.connect(filter);
            filter.connect(gain);
            
            // Apply effects chain
            this.createEffectsChain(gain);
            
            oscillators.push(osc);
            gains.push(gain);
            filters.push(filter);
        }

        // Duration/volume/frequency multipliers
        let toneDur, toneVol, freqMul;
        switch (intensity) {
            case 'strong':
                toneDur = 0.02 + Math.random() * 0.015;
                toneVol = finalVolume * 0.8; // Boosted from 0.45 to 0.8 (even louder for desktop)
                freqMul = 1.1;
                break;
            case 'light':
                toneDur = 0.008 + Math.random() * 0.007;
                toneVol = finalVolume * 0.5; // Boosted from 0.20 to 0.5 (much louder)
                freqMul = 0.95;
                break;
            default:
                toneDur = 0.012 + Math.random() * 0.01;
                toneVol = finalVolume * 0.7; // Boosted from 0.35 to 0.7 (significantly louder)
                freqMul = 1.0;
        }
        if (rhythm.isFastRhythm) {
            toneDur *= 0.7;
            toneVol *= 0.85;
        }
        
        // Apply tempo effects to create dramatic harmonic differences (boosted for desktop)
        if (tempo > 2.0) {
            // High tempo: Much louder harmonics for arpeggiated effect
            toneVol *= 2.8; // Boosted from 2.2 to 2.8
            toneDur *= 0.6; // Shorter, sharper hits
        } else if (tempo > 1.5) {
            // Medium-high tempo: Enhanced harmonics for syncopation
            toneVol *= 2.0; // Boosted from 1.6 to 2.0
        } else if (tempo < 0.7) {
            // Low tempo: Much longer sustained tones
            toneDur *= 2.0; // Very long sustained tones
            toneVol *= 1.6; // Boosted from 1.2 to 1.6
        } else if (tempo < 0.9) {
            // Medium-low tempo: Longer sustained tones
            toneDur *= 1.5;
            toneVol *= 1.4; // Boosted from 1.1 to 1.4
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

        // Enhanced harmonic generation based on real wooden spoon waveform analysis
        for (let i = 0; i < oscillators.length; i++) {
            const osc = oscillators[i];
            const gain = gains[i];
            const filter = filters[i];
            const harmonicRatio = harmonics[i];
            
            // Calculate frequency for this harmonic (fundamental * harmonic number)
            const harmonicFreq = f0 * (i + 1);
            
            // Slight pitch sweep (adds realism of impact resonance)
            const fStart = harmonicFreq * (intensity === 'strong' ? 0.95 : 0.98);
            const fEnd = harmonicFreq * (intensity === 'strong' ? 1.03 : 1.01);

            osc.type = cfg.type;
            osc.frequency.setValueAtTime(fStart, startTime);
            osc.frequency.linearRampToValueAtTime(fEnd, startTime + toneDur);

            // Material-specific filtering with enhanced Q factor for wood
            filter.type = 'highpass';
            const hp = cfg.filterFreq * 0.5 * (intensity === 'strong' ? 1.1 : 1.0);
            filter.frequency.setValueAtTime(hp, startTime);
            filter.Q.setValueAtTime(resonanceQ + (intensity === 'strong' ? 0.4 : 0), startTime);

            // Use material-specific attack time for tonal components too
            const attackTime = cfg.attackTime || 0.001;
            
            // Volume decreases for higher harmonics (like real acoustic behavior)
            const harmonicVol = toneVol * harmonicRatio * (0.8 - i * 0.1);
            
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(harmonicVol, startTime + attackTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + toneDur);

            osc.start(startTime);
            osc.stop(startTime + toneDur);

            this.audioInstances.push({ source: osc, contextTime: startTime + toneDur });
        }
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
        
        // Update folk art background for material styling
        const folkArtBackground = document.querySelector('.folk-art-background');
        if (folkArtBackground) {
            // Remove all material classes
            folkArtBackground.classList.remove('material-wooden-spoon', 'material-metal-spoon', 'material-plastic-spoon', 'material-ceramic-spoon');
            // Add the new material class
            folkArtBackground.classList.add(`material-${sound}`);
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
