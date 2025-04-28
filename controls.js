// controls.js - Handles interaction with the control panel UI

document.addEventListener('DOMContentLoaded', () => {

    // Check if BackgroundApp is available
    if (typeof BackgroundApp === 'undefined' || !BackgroundApp || !BackgroundApp.config || !BackgroundApp.BASE_ROTATION_SPEED_NORMAL) { // Check for constants too
        console.error("BackgroundApp not found or not fully initialized. Controls cannot function.");
        const controlsDiv = document.getElementById('controls');
         if (controlsDiv) {
            const errorMsg = document.createElement('p');
            errorMsg.textContent = "Error: Background script failed. Controls disabled.";
            errorMsg.style.color = 'orange'; errorMsg.style.textAlign = 'center';
            controlsDiv.prepend(errorMsg);
        }
        // Disable all controls if app failed
        document.querySelectorAll('#controls input, #controls button').forEach(el => el.disabled = true);
        return;
    }

    // --- Get references to ALL control elements ---
    const rotationSpeedSlider = document.getElementById('rotationSpeed');
    const rotationSpeedValue = document.getElementById('rotationSpeedValue');
    const followSpeedSlider = document.getElementById('followSpeed');
    const followSpeedValue = document.getElementById('followSpeedValue');
    const breathingIntensitySlider = document.getElementById('breathingIntensity');
    const breathingIntensityValue = document.getElementById('breathingIntensityValue');
    const breathingSpeedSlider = document.getElementById('breathingSpeed');
    const breathingSpeedValue = document.getElementById('breathingSpeedValue');
    const fogDensitySlider = document.getElementById('fogDensity');
    const fogDensityValue = document.getElementById('fogDensityValue');
    const opacityMultiplierSlider = document.getElementById('opacityMultiplier');
    const opacityMultiplierValue = document.getElementById('opacityMultiplierValue');
    const sizeMultiplierSlider = document.getElementById('sizeMultiplier');
    const sizeMultiplierValue = document.getElementById('sizeMultiplierValue');
    const hueOffsetSlider = document.getElementById('hueOffset');
    const hueOffsetValue = document.getElementById('hueOffsetValue');

    const btnNormal = document.getElementById('btn-normal');
    const btnRave = document.getElementById('btn-rave');
    const btnTechno = document.getElementById('btn-techno');
    const btnPause = document.getElementById('btn-pause');
    const btnScreenshot = document.getElementById('btn-screenshot');
    const btnGif = document.getElementById('btn-gif');
    const gifStatus = document.getElementById('gif-status');

    const stateButtons = [btnNormal, btnRave, btnTechno];

    // --- Default State Settings (for slider sync) ---
    // Define the default values for each state that correspond to sliders
    // Note: Rotation speed multiplier is kept at 1.0 by default for all states,
    // as the base speed changes in background.js. User can then adjust multiplier.
    const defaultSettings = {
        normal: {
            rotationSpeedMultiplier: 1.0,
            cameraFollowSpeed: 0.02, // Base speed for normal
            breathingIntensity: 40,
            breathingSpeed: 0.00015,
            fogDensity: 0.001,
            opacityMultiplier: 1.0, // Base opacity differs in background.js, multiplier starts at 1
            sizeMultiplier: 1.0, // Base size differs, multiplier starts at 1
            hueOffset: 0.0
        },
        rave: {
            rotationSpeedMultiplier: 1.0,
            cameraFollowSpeed: 0.03, // Slightly faster follow for rave
            breathingIntensity: 60, // More intense breathing
            breathingSpeed: 0.00020, // Faster breathing
            fogDensity: 0.0015, // Slightly denser fog
            opacityMultiplier: 1.0, // Base opacity differs, multiplier starts at 1
            sizeMultiplier: 1.0, // Base size differs, multiplier starts at 1
            hueOffset: 0.0 // Hue shift is handled internally, offset starts at 0
        },
        techno: {
            rotationSpeedMultiplier: 1.0,
            cameraFollowSpeed: 0.04, // Faster follow for techno
            breathingIntensity: 80, // Most intense breathing
            breathingSpeed: 0.00025, // Fastest breathing
            fogDensity: 0.002, // Densest fog
            opacityMultiplier: 1.0, // Base opacity differs, multiplier starts at 1
            sizeMultiplier: 1.0, // Base size differs, multiplier starts at 1
            hueOffset: 0.0 // Hue cycling handled internally, offset starts at 0
        }
    };

    // --- Helper Functions ---

    // Updates the visual display of a slider's value
    function updateSliderValueDisplay(sliderElement, displayElement, formatFn) {
        if (sliderElement && displayElement) {
            const value = formatFn ? formatFn(sliderElement.value) : sliderElement.value;
            displayElement.textContent = value;
        }
    }

    // Updates the active state styling for state buttons
    function updateActiveButton() {
        stateButtons.forEach(btn => {
            if (btn && btn.id === `btn-${BackgroundApp.config.backgroundState}`) { btn.classList.add('active'); }
            else if (btn) { btn.classList.remove('active'); }
        });
    }

    // Updates the Pause/Resume button text and style
    function updatePauseButtonState() {
        if (!btnPause) return;
        btnPause.textContent = BackgroundApp.config.isPaused ? 'Resume Animation' : 'Pause Animation';
        btnPause.classList.toggle('bg-green-600', BackgroundApp.config.isPaused);
        btnPause.classList.toggle('hover:bg-green-500', BackgroundApp.config.isPaused);
        btnPause.classList.toggle('bg-yellow-600', !BackgroundApp.config.isPaused);
        btnPause.classList.toggle('hover:bg-yellow-500', !BackgroundApp.config.isPaused);
    }

    // *** NEW: Function to sync sliders to a given state's defaults ***
    function syncSlidersToState(stateName) {
        const settings = defaultSettings[stateName];
        if (!settings) {
            console.warn(`No default settings found for state: ${stateName}`);
            return;
        }

        // Update BackgroundApp config
        BackgroundApp.config.rotationSpeedMultiplier = settings.rotationSpeedMultiplier;
        BackgroundApp.config.cameraFollowSpeed = settings.cameraFollowSpeed;
        BackgroundApp.config.breathingIntensity = settings.breathingIntensity;
        BackgroundApp.config.breathingSpeed = settings.breathingSpeed;
        BackgroundApp.config.fogDensity = settings.fogDensity;
        BackgroundApp.config.opacityMultiplier = settings.opacityMultiplier;
        BackgroundApp.config.sizeMultiplier = settings.sizeMultiplier;
        BackgroundApp.config.hueOffset = settings.hueOffset;

        // Update Slider Positions and Value Displays
        if (rotationSpeedSlider) rotationSpeedSlider.value = settings.rotationSpeedMultiplier;
        updateSliderValueDisplay(rotationSpeedSlider, rotationSpeedValue, (v) => `${parseFloat(v).toFixed(1)}x`);

        if (followSpeedSlider) followSpeedSlider.value = settings.cameraFollowSpeed;
        updateSliderValueDisplay(followSpeedSlider, followSpeedValue, (v) => parseFloat(v).toFixed(3));

        if (breathingIntensitySlider) breathingIntensitySlider.value = settings.breathingIntensity;
        updateSliderValueDisplay(breathingIntensitySlider, breathingIntensityValue);

        if (breathingSpeedSlider) breathingSpeedSlider.value = settings.breathingSpeed;
        updateSliderValueDisplay(breathingSpeedSlider, breathingSpeedValue, (v) => parseFloat(v).toFixed(5));

        if (fogDensitySlider) fogDensitySlider.value = settings.fogDensity;
        updateSliderValueDisplay(fogDensitySlider, fogDensityValue, (v) => parseFloat(v).toFixed(4));

        if (opacityMultiplierSlider) opacityMultiplierSlider.value = settings.opacityMultiplier;
        updateSliderValueDisplay(opacityMultiplierSlider, opacityMultiplierValue, (v) => parseFloat(v).toFixed(2));

        if (sizeMultiplierSlider) sizeMultiplierSlider.value = settings.sizeMultiplier;
        updateSliderValueDisplay(sizeMultiplierSlider, sizeMultiplierValue, (v) => parseFloat(v).toFixed(1));

        if (hueOffsetSlider) hueOffsetSlider.value = settings.hueOffset;
        updateSliderValueDisplay(hueOffsetSlider, hueOffsetValue, (v) => {
            const val = parseFloat(v);
            return (val >= 0 ? '+' : '') + val.toFixed(2);
        });

        console.log(`Synced sliders to '${stateName}' defaults.`);
    }


    // --- Initialization ---
    // Set initial values for ALL controls based on the *initial* BackgroundApp.config state
    syncSlidersToState(BackgroundApp.config.backgroundState); // Use the sync function for initial setup
    updateActiveButton(); // Set initial active state button
    updatePauseButtonState(); // Set initial pause button text/style

    // Disable GIF button if library is not loaded
    if (typeof GIF === 'undefined' && btnGif) {
        btnGif.disabled = true;
        if(gifStatus) gifStatus.textContent = 'GIF library not loaded.';
    }


    // --- Event Listeners for ALL Controls ---

    // Rotation Speed Slider
    if (rotationSpeedSlider) {
        rotationSpeedSlider.addEventListener('input', (e) => {
            BackgroundApp.config.rotationSpeedMultiplier = parseFloat(e.target.value);
            updateSliderValueDisplay(rotationSpeedSlider, rotationSpeedValue, (v) => `${parseFloat(v).toFixed(1)}x`);
        });
    }
    // Camera Follow Speed (Mouse Sensitivity) Slider
    if (followSpeedSlider) {
        followSpeedSlider.addEventListener('input', (e) => {
            BackgroundApp.config.cameraFollowSpeed = parseFloat(e.target.value);
            updateSliderValueDisplay(followSpeedSlider, followSpeedValue, (v) => parseFloat(v).toFixed(3));
        });
    }
    // Breathing Intensity Slider
    if (breathingIntensitySlider) {
        breathingIntensitySlider.addEventListener('input', (e) => {
            BackgroundApp.config.breathingIntensity = parseInt(e.target.value, 10);
             updateSliderValueDisplay(breathingIntensitySlider, breathingIntensityValue);
        });
    }
    // Breathing Speed Slider
    if (breathingSpeedSlider) {
        breathingSpeedSlider.addEventListener('input', (e) => {
            BackgroundApp.config.breathingSpeed = parseFloat(e.target.value);
            updateSliderValueDisplay(breathingSpeedSlider, breathingSpeedValue, (v) => parseFloat(v).toFixed(5));
        });
    }
    // Fog Density Slider
    if (fogDensitySlider) {
        fogDensitySlider.addEventListener('input', (e) => {
            BackgroundApp.config.fogDensity = parseFloat(e.target.value);
             updateSliderValueDisplay(fogDensitySlider, fogDensityValue, (v) => parseFloat(v).toFixed(4));
        });
    }
    // Opacity Multiplier Slider
    if (opacityMultiplierSlider) {
        opacityMultiplierSlider.addEventListener('input', (e) => {
            BackgroundApp.config.opacityMultiplier = parseFloat(e.target.value);
            updateSliderValueDisplay(opacityMultiplierSlider, opacityMultiplierValue, (v) => parseFloat(v).toFixed(2));
        });
    }
    // Size Multiplier Slider
    if (sizeMultiplierSlider) {
        sizeMultiplierSlider.addEventListener('input', (e) => {
            BackgroundApp.config.sizeMultiplier = parseFloat(e.target.value);
            updateSliderValueDisplay(sizeMultiplierSlider, sizeMultiplierValue, (v) => parseFloat(v).toFixed(1));
        });
    }
     // Hue Offset Slider
    if (hueOffsetSlider) {
        hueOffsetSlider.addEventListener('input', (e) => {
            BackgroundApp.config.hueOffset = parseFloat(e.target.value);
            updateSliderValueDisplay(hueOffsetSlider, hueOffsetValue, (v) => {
                 const val = parseFloat(v);
                 return (val >= 0 ? '+' : '') + val.toFixed(2);
            });
        });
    }


    // State Button Listeners (NOW SYNC SLIDERS)
    if (btnNormal) {
        btnNormal.addEventListener('click', () => {
            if (BackgroundApp.config.backgroundState !== 'normal') {
                BackgroundApp.config.backgroundState = 'normal'; // Update state in config
                updateActiveButton(); // Update button appearance
                syncSlidersToState('normal'); // Sync sliders to normal defaults
                // BackgroundApp.createParticleSystems(); // Optional: uncomment if states need full particle recreation (causes flicker)
            }
        });
    }
    if (btnRave) {
        btnRave.addEventListener('click', () => {
            if (BackgroundApp.config.backgroundState !== 'rave') {
                BackgroundApp.config.backgroundState = 'rave';
                updateActiveButton();
                syncSlidersToState('rave'); // Sync sliders to rave defaults
                // BackgroundApp.createParticleSystems(); // Optional
            }
        });
    }
    if (btnTechno) {
        btnTechno.addEventListener('click', () => {
            if (BackgroundApp.config.backgroundState !== 'techno') {
                BackgroundApp.config.backgroundState = 'techno';
                updateActiveButton();
                syncSlidersToState('techno'); // Sync sliders to techno defaults
                // BackgroundApp.createParticleSystems(); // Optional
            }
        });
    }


    // Pause Button Listener
    if (btnPause) {
        btnPause.addEventListener('click', () => {
            BackgroundApp.config.isPaused = !BackgroundApp.config.isPaused;
            updatePauseButtonState();
            BackgroundApp.handleAnimationState();
        });
    }

    // Screenshot Button Listener
    if (btnScreenshot) {
        btnScreenshot.addEventListener('click', () => {
            const wasPaused = BackgroundApp.config.isPaused;
            if (wasPaused) {
                 BackgroundApp.config.isPaused = false;
                 BackgroundApp.handleAnimationState();
                 BackgroundApp.render(); // Force render if paused
            }
            // Use setTimeout to allow potential render to complete before capture
            setTimeout(() => {
                BackgroundApp.saveScreenshot();
                if (wasPaused) { // Restore pause state
                    BackgroundApp.config.isPaused = true;
                    BackgroundApp.handleAnimationState();
                }
            }, 50);
        });
    }

    // GIF Button Listener
    if (btnGif) {
        btnGif.addEventListener('click', () => {
            if (!BackgroundApp.isRecordingGif) {
                BackgroundApp.startGifRecord();
                // UI updates (disabled state, status message) handled within background.js functions now
            }
            // Stop is handled internally by duration/error
        });
    }

    console.log("Controls initialized and listeners attached.");

}); // End of DOMContentLoaded listener
