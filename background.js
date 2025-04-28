// background.js - Three.js Particle Background Logic (Full Code + CORS Fix for GIF Worker)

(function() {
    'use strict';

    // Check if THREE.js is loaded
    if (typeof THREE === 'undefined') {
        console.error("Three.js library not loaded. Background cannot be initialized.");
        const controlsDiv = document.getElementById('controls');
        if (controlsDiv) {
            const errorMsg = document.createElement('p');
            errorMsg.textContent = "Error: Three.js failed to load. Background animation disabled.";
            errorMsg.style.color = 'red';
            errorMsg.style.textAlign = 'center';
            controlsDiv.prepend(errorMsg);
        }
        return; // Stop execution
    }
    // Check if gif.js is loaded
    if (typeof GIF === 'undefined') {
        console.warn("gif.js library not loaded. GIF recording will be disabled.");
        // Controls.js will handle disabling the button if needed
    }


    const BackgroundApp = {
        // --- Core Three.js Variables ---
        scene: null,
        camera: null,
        renderer: null,
        container: null,
        HEIGHT: window.innerHeight,
        WIDTH: window.innerWidth,
        fieldOfView: 75,
        aspectRatio: window.innerWidth / window.innerHeight,
        nearPlane: 1,
        farPlane: 3000,
        geometry: null, // Shared geometry for all particle systems
        materials: [], // Array to hold materials for different particle systems
        mouseX: 0, // Mouse X position relative to center
        mouseY: 0, // Mouse Y position relative to center
        windowHalfX: window.innerWidth / 2,
        windowHalfY: window.innerHeight / 2,
        cameraZ: 1000, // Base Z position for the camera
        fogHex: 0x0a0514, // Fog color (matches background)
        rafId: null, // ID for requestAnimationFrame loop
        isHidden: document.hidden, // Page visibility state
        clock: new THREE.Clock(), // Clock for delta time calculation
        resizeTimeout: null, // Timeout ID for debounced resize

        // --- GIF Recording Variables ---
        gif: null, // gif.js instance
        isRecordingGif: false,
        gifFrameDelay: 100, // ms between frames (10 fps). Adjust for performance/smoothness. Lower delay = more frames = potentially larger file/slower render.
        gifDuration: 5000, // ms (5 seconds)
        gifStartTime: 0,
        gifFramesAdded: 0,
        gifQuality: 15, // GIF quality (lower is better quality but slower processing, 1-30). 10-20 is often a good range.

        // --- Configuration (Controllable via controls.js) ---
        config: {
            particleCount: 5000, // Initial particle count (cannot be changed dynamically without re-init)
            backgroundState: 'normal', // 'normal', 'rave', 'techno'
            isPaused: false, // External pause control
            rotationSpeedMultiplier: 1.0, // Multiplier for base rotation speed
            breathingIntensity: 40, // Amplitude of camera Z movement
            breathingSpeed: 0.00015, // Frequency of camera Z movement
            fogDensity: 0.001, // Density of the scene fog
            cameraFollowSpeed: 0.02, // Base speed for camera following mouse (sensitivity)
            opacityMultiplier: 1.0, // Multiplier for particle opacity
            sizeMultiplier: 1.0, // Multiplier for particle size
            hueOffset: 0.0, // Offset applied to particle colors (HSL hue)
        },

        // --- Constants ---
        BACKGROUND_COLOR: 0x0a0514, // Scene background color (though renderer clear alpha is 0)
        RESIZE_DEBOUNCE_MS: 250, // Delay for debounced resize handler
        // Particle parameters [ [HSL Color Array], Size ]
        // Normal state uses [H, S, L]
        PARTICLE_PARAMS_NORMAL: [
            [[0.95, 0.7, 0.35], 4], [[0.80, 0.7, 0.32], 3.5], [[0.0, 0.7, 0.32], 3.5],
            [[0.85, 0.6, 0.30], 3], [[0.98, 0.6, 0.30], 3]
        ],
        // Rave state uses [H, S, L]
        PARTICLE_PARAMS_RAVE: [
            [[0.95, 0.9, 0.70], 4.5], [[0.80, 0.9, 0.65], 4], [[0.0, 0.9, 0.65], 4],
            [[0.85, 0.8, 0.60], 3.5], [[0.98, 0.8, 0.60], 3.5]
        ],
        // Techno state uses [S, L] (Hue is calculated dynamically)
        PARTICLE_PARAMS_TECHNO: [
            [[1.0, 0.8], 4.5], [[1.0, 0.7], 3.5], [[0.9, 0.8], 4.0],
            [[1.0, 0.7], 4.0], [[0.8, 0.8], 3.0]
        ],
        // Base rotation speeds for different states
        BASE_ROTATION_SPEED_NORMAL: 0.00004,
        BASE_ROTATION_SPEED_RAVE: 0.00014,
        BASE_ROTATION_SPEED_TECHNO: 0.0004,

        // --- Initialization ---
        init() {
            console.log("Initializing BackgroundApp...");
            try {
                // Get the container element
                this.container = document.getElementById('threejs-bg');
                if (!this.container) {
                    throw new Error("Container element #threejs-bg not found.");
                }

                // Set initial dimensions
                this.HEIGHT = window.innerHeight;
                this.WIDTH = window.innerWidth;
                this.windowHalfX = this.WIDTH / 2;
                this.windowHalfY = this.HEIGHT / 2;
                this.aspectRatio = this.WIDTH / this.HEIGHT;

                // Create the perspective camera
                this.camera = new THREE.PerspectiveCamera(this.fieldOfView, this.aspectRatio, this.nearPlane, this.farPlane);
                this.camera.position.z = this.cameraZ; // Set initial camera distance

                // Create the scene
                this.scene = new THREE.Scene();
                // Add exponential fog to the scene
                this.scene.fog = new THREE.FogExp2(this.fogHex, this.config.fogDensity);

                // Create particle geometry (shared across all systems)
                this.geometry = new THREE.BufferGeometry();
                const positions = []; // Array to hold vertex positions
                const count = this.config.particleCount; // Get particle count from config
                for (let i = 0; i < count; i++) {
                    // Distribute particles spherically
                    let radius = Math.random() * 2000; // Random radius
                    let theta = Math.random() * Math.PI * 2; // Random angle around Y (0 to 2PI)
                    let phi = Math.random() * Math.PI; // Random angle from positive Y (0 to PI)

                    // Convert spherical coordinates to Cartesian (x, y, z)
                    const x = radius * Math.sin(phi) * Math.cos(theta);
                    const y = radius * Math.sin(phi) * Math.sin(theta);
                    const z = radius * Math.cos(phi);
                    positions.push(x, y, z); // Add vertex position to the array
                }
                // Set the 'position' attribute on the geometry
                this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

                // Create the initial set of particle systems based on default state
                this.createParticleSystems();

                // Initialize the WebGL renderer
                this.renderer = new THREE.WebGLRenderer({
                    antialias: false, // No antialiasing for performance with many small points
                    alpha: true, // Allow transparency to see HTML background
                    preserveDrawingBuffer: true, // !!! IMPORTANT: Needed for toDataURL() (screenshot/GIF)
                    powerPreference: "high-performance" // Request high performance GPU if available
                });
                // Add the willReadFrequently hint AFTER renderer creation for potential performance boost
                // This hint informs the browser that we'll be reading back pixel data often (for GIF/screenshot)
                try {
                     const contextAttributes = this.renderer.getContext().canvas.getContextAttributes();
                     if (contextAttributes) {
                        contextAttributes.willReadFrequently = true;
                     } else {
                        console.warn("Could not get context attributes to set willReadFrequently.");
                     }
                } catch(e) {
                    console.warn("Error setting willReadFrequently hint:", e);
                }


                // Set device pixel ratio for sharpness on high-DPI screens (can adjust for performance)
                this.renderer.setPixelRatio(window.devicePixelRatio > 1 ? 1.5 : 1);
                // Set renderer size to match window dimensions
                this.renderer.setSize(this.WIDTH, this.HEIGHT);
                // Set clear color with alpha 0, so the HTML body background shows through
                this.renderer.setClearColor(this.BACKGROUND_COLOR, 0);
                // Append the renderer's canvas element to the container div
                this.container.appendChild(this.renderer.domElement);

                // --- Event Listeners ---
                // Bind 'this' context for event handlers
                window.addEventListener('resize', this.handleResize.bind(this), false);
                document.addEventListener('mousemove', this.onDocumentMouseMove.bind(this), false);
                document.addEventListener('touchstart', this.onDocumentTouchStart.bind(this), { passive: true }); // Use passive for touch performance
                document.addEventListener('touchmove', this.onDocumentTouchMove.bind(this), { passive: true }); // Use passive for touch performance
                document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this), false); // Handle tab visibility changes
                window.addEventListener('unload', this.cleanup.bind(this)); // Cleanup resources on page unload

                // Start the animation loop
                this.handleAnimationState();
                console.log("Three.js background initialized successfully.");

            } catch (e) {
                console.error("Error during Three.js initialization:", e);
                // Provide a fallback background if initialization fails
                if (this.container) this.container.style.background = '#111';
            }
        },

        // --- Create/Recreate Particle Systems ---
        // Creates the THREE.Points objects based on the current state's parameters
        createParticleSystems() {
            // console.log(`Creating particle systems for state: ${this.config.backgroundState}`);
            // 1. Remove existing particle systems from the scene and dispose their resources
            for (let i = this.scene.children.length - 1; i >= 0; i--) {
                const object = this.scene.children[i];
                if (object instanceof THREE.Points) { // Only remove Points objects
                    this.scene.remove(object);
                    // Dispose geometry and material to free GPU memory
                    // (Geometry is shared, dispose only if it's the last reference, but safer to dispose materials here)
                    // if (object.geometry) object.geometry.dispose(); // Don't dispose shared geometry here
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(m => m.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                }
            }
            // Clear the materials array
            this.materials = [];

            // 2. Determine which parameter set to use based on the current state
            let currentParams;
            switch (this.config.backgroundState) {
                case 'rave':
                    currentParams = this.PARTICLE_PARAMS_RAVE;
                    break;
                case 'techno':
                    currentParams = this.PARTICLE_PARAMS_TECHNO;
                    break;
                case 'normal':
                default:
                    currentParams = this.PARTICLE_PARAMS_NORMAL;
                    break;
            }
            const parameterCount = currentParams.length;

            // 3. Create new materials and THREE.Points objects
            for (let i = 0; i < parameterCount; i++) {
                const size = currentParams[i][1]; // Get size from parameters
                // Create a new PointsMaterial for this system
                const material = new THREE.PointsMaterial({
                    size: size, // Base size
                    sizeAttenuation: true, // Points scale with distance
                    vertexColors: false, // We are setting color per material, not per vertex
                    blending: THREE.AdditiveBlending, // Make overlapping points brighter
                    transparent: true, // Needed for opacity and blending
                    opacity: 0.8, // Default opacity (will be modified in render loop)
                    depthWrite: false // Helps with rendering order issues for transparent objects
                });
                this.materials.push(material); // Store reference to the material

                // Create the THREE.Points object using the shared geometry and this new material
                const particles = new THREE.Points(this.geometry, material);

                // Assign a random initial rotation to each particle system for variety
                particles.rotation.x = Math.random() * Math.PI * 2;
                particles.rotation.y = Math.random() * Math.PI * 2;
                particles.rotation.z = Math.random() * Math.PI * 2;

                // Add the particle system to the scene
                this.scene.add(particles);
            }
            // console.log(`Added ${parameterCount} particle systems.`);
        },

        // --- Animation Loop ---
        // Called recursively via requestAnimationFrame
        animate() {
            // Request the next frame. Bind 'this' to ensure context is correct.
            this.rafId = requestAnimationFrame(this.animate.bind(this));

            // Render the scene for this frame
            this.render();

            // --- GIF Frame Capture ---
            // Check if recording is active, gif instance exists, and renderer is available
            if (this.isRecordingGif && this.gif && this.renderer) {
                // Simple time-based check to approximate desired frame rate
                // This assumes the animate loop runs frequently enough.
                // A more robust method might involve tracking delta time more precisely.
                if (Date.now() > this.gifStartTime + this.gifFramesAdded * this.gifFrameDelay) {
                    // Check if the recording duration has been exceeded
                    if (Date.now() < this.gifStartTime + this.gifDuration) {
                        this.addGifFrame(); // Add the frame
                    } else {
                        this.stopGifRecord(); // Duration exceeded, stop recording
                    }
                }
            }
        },

        // --- Render Frame ---
        // Called every frame to update object positions, materials, and render the scene
        render() {
            // Calculate time delta for frame-rate independent animations
            const delta = this.clock.getDelta();
            // Get total elapsed time since initialization
            const elapsedTime = this.clock.getElapsedTime();

            let baseRotationSpeed, currentParams, rotationMultiplier;
            // Use the base follow speed directly from the config (controlled by slider)
            let baseFollowSpeed = this.config.cameraFollowSpeed;

            // Determine state-specific parameters (rotation speed, particle params, rotation multiplier)
            switch (this.config.backgroundState) {
                case 'rave':
                    baseRotationSpeed = this.BASE_ROTATION_SPEED_RAVE;
                    currentParams = this.PARTICLE_PARAMS_RAVE;
                    rotationMultiplier = 12; // Faster rotation
                    // No longer modifying baseFollowSpeed here, it's controlled by the slider
                    break;
                case 'techno':
                    baseRotationSpeed = this.BASE_ROTATION_SPEED_TECHNO;
                    currentParams = this.PARTICLE_PARAMS_TECHNO;
                    rotationMultiplier = 30; // Very fast rotation
                    break;
                case 'normal':
                default:
                    baseRotationSpeed = this.BASE_ROTATION_SPEED_NORMAL;
                    currentParams = this.PARTICLE_PARAMS_NORMAL;
                    rotationMultiplier = 1; // Standard rotation
                    break;
            }
            // Apply the user-controlled speed multiplier
            const currentRotationSpeed = baseRotationSpeed * this.config.rotationSpeedMultiplier;
            // Calculate a time value based on elapsed time and current speed for animations
            const time = elapsedTime * currentRotationSpeed * 1000;

            // Animate camera position
            // Use lerp (linear interpolation) for smooth camera following based on mouse position
            const lerpFactor = 1.0 - Math.pow(0.01, delta); // Frame-rate independent lerp factor
            // Normalize the effective lerp speed against the original default speed (0.02)
            // This makes the slider feel more intuitive (e.g., 2x means twice as fast as original default)
            const effectiveLerp = lerpFactor * (baseFollowSpeed / 0.02);
            this.camera.position.x += (this.mouseX - this.camera.position.x) * effectiveLerp;
            this.camera.position.y += (-this.mouseY - this.camera.position.y) * effectiveLerp; // Inverted Y axis

            // Apply camera "breathing" effect (Z-axis oscillation)
            this.camera.position.z = this.cameraZ + Math.sin(Date.now() * this.config.breathingSpeed) * this.config.breathingIntensity;
            // Make the camera always look at the center of the scene
            this.camera.lookAt(this.scene.position);

            // Animate particle systems' rotation
            const parameterCount = currentParams.length;
            for (let i = 0; i < this.scene.children.length; i++) {
                const object = this.scene.children[i];
                if (object instanceof THREE.Points) {
                    // Find the index of this system's material in our materials array
                    const materialIndex = this.materials.indexOf(object.material);
                    if (materialIndex !== -1) {
                        // Apply rotation based on time, multiplier, and index offset
                        // Rotate half clockwise, half counter-clockwise for visual interest
                        object.rotation.y = time * rotationMultiplier * (materialIndex < (parameterCount / 2) ? materialIndex + 1 : -(materialIndex + 1));
                    }
                }
            }

            // Animate materials (colors, opacity, size)
            // Helper function to apply hue offset and wrap around [0, 1]
            const applyHueOffset = (h) => (h + this.config.hueOffset + 1) % 1;

            for (let i = 0; i < this.materials.length; i++) {
                const material = this.materials[i];
                // Use modulo to cycle through parameters if there are more materials than parameter sets
                const paramIndex = i % parameterCount;
                let baseOpacity = 0.8; // Default base opacity
                let baseSize; // Base size from parameters

                // --- State-specific material updates ---
                if (this.config.backgroundState === 'techno') {
                    const technoParams = currentParams[paramIndex][0]; // [S, L]
                    baseSize = currentParams[paramIndex][1];
                    const technoSat = technoParams[0];
                    const technoLight = technoParams[1];
                    // Calculate hue based on time and index for a cycling rainbow effect
                    let h = (elapsedTime * 2.0 + i * 0.2) % 1; // Hue cycles from 0 to 1
                    material.color.setHSL(applyHueOffset(h), technoSat, technoLight); // Set color using HSL
                    baseOpacity = 0.95; // Higher base opacity for techno
                } else { // Normal and Rave use similar HSL structure [H, S, L]
                    const normalRaveParams = currentParams[paramIndex][0]; // [H, S, L]
                    baseSize = currentParams[paramIndex][1];
                    const baseH = normalRaveParams[0];
                    const baseS = normalRaveParams[1];
                    const baseL = normalRaveParams[2];
                    // Adjust hue shift speed based on state (faster for rave)
                    const hueSpeed = this.config.backgroundState === 'rave' ? 1.0 : 0.5;
                    // Calculate hue with a sine wave modulation for smooth pulsing effect
                    let h_norm_rave = baseH + Math.sin(elapsedTime * hueSpeed + i * Math.PI) * 0.1;
                    material.color.setHSL(applyHueOffset(h_norm_rave), baseS, baseL); // Set color
                    // Adjust base opacity based on state
                    baseOpacity = this.config.backgroundState === 'rave' ? 0.9 : 0.8;
                }

                // --- Apply global multipliers ---
                // Apply opacity multiplier, clamping the result between 0 and 1
                material.opacity = Math.max(0, Math.min(1, baseOpacity * this.config.opacityMultiplier));
                // Apply size multiplier, ensuring a minimum size
                material.size = Math.max(0.1, baseSize * this.config.sizeMultiplier);
            }

            // Update fog density dynamically from config
            if (this.scene.fog) {
                this.scene.fog.density = this.config.fogDensity;
            }

            // Render the scene using the configured renderer, scene, and camera
            if (this.renderer) {
                this.renderer.render(this.scene, this.camera);
            }
        },

        // --- Event Handlers ---

        // Update mouse coordinates relative to the window center on mouse move
        onDocumentMouseMove(e) {
            this.mouseX = e.clientX - this.windowHalfX;
            this.mouseY = e.clientY - this.windowHalfY;
        },

        // Update mouse coordinates on touch start (for single touch)
        onDocumentTouchStart(e) {
            if (e.touches.length === 1) {
                // e.preventDefault(); // Consider if needed, might interfere with scrolling controls panel
                this.mouseX = e.touches[0].pageX - this.windowHalfX;
                this.mouseY = e.touches[0].pageY - this.windowHalfY;
            }
        },

        // Update mouse coordinates on touch move (for single touch)
        onDocumentTouchMove(e) {
            if (e.touches.length === 1) {
                // e.preventDefault(); // Consider if needed
                this.mouseX = e.touches[0].pageX - this.windowHalfX;
                this.mouseY = e.touches[0].pageY - this.windowHalfY;
            }
        },

        // Debounced resize handler to update dimensions, camera aspect, and renderer size
        handleResize() {
            clearTimeout(this.resizeTimeout); // Clear previous timeout
            this.resizeTimeout = setTimeout(() => { // Set new timeout
                // console.log("Debounced resize executing...");
                try {
                    // Update dimensions
                    this.WIDTH = window.innerWidth;
                    this.HEIGHT = window.innerHeight;
                    this.windowHalfX = this.WIDTH / 2;
                    this.windowHalfY = this.HEIGHT / 2;

                    // Update camera aspect ratio and projection matrix
                    if (this.camera) {
                        this.camera.aspect = this.WIDTH / this.HEIGHT;
                        this.camera.updateProjectionMatrix();
                    }
                    // Update renderer size and pixel ratio
                    if (this.renderer) {
                        this.renderer.setPixelRatio(window.devicePixelRatio > 1 ? 1.5 : 1); // Re-apply pixel ratio
                        this.renderer.setSize(this.WIDTH, this.HEIGHT);
                    }
                } catch (e) {
                    console.error("Error during debounced window resize:", e);
                }
            }, this.RESIZE_DEBOUNCE_MS); // Wait specified ms after resize stops
        },

        // Handle page visibility changes (tab switching, minimizing)
        handleVisibilityChange() {
            this.isHidden = document.hidden; // Update visibility state
            // console.log("Background visibility changed. Hidden:", this.isHidden);
            // Pause or resume animation based on visibility and explicit pause state
            this.handleAnimationState();
        },

        // --- Animation State Control ---
        // Decides whether the animation loop (requestAnimationFrame) should run
        handleAnimationState() {
            const shouldBeRunning = !this.config.isPaused && !this.isHidden;
            if (shouldBeRunning && !this.rafId) {
                // If it should be running but isn't, start/resume the loop
                // console.log("Resuming animation loop.");
                this.clock.getDelta(); // Reset delta time to avoid jump on resume
                this.rafId = requestAnimationFrame(this.animate.bind(this));
            } else if (!shouldBeRunning && this.rafId) {
                // If it shouldn't be running but is, stop the loop
                // console.log("Pausing animation loop.");
                cancelAnimationFrame(this.rafId);
                this.rafId = null; // Clear the request ID
            }
        },

        // --- Screenshot Function ---
        // Captures the current canvas state and triggers a download
        saveScreenshot() {
            if (!this.renderer) {
                console.error("Renderer not available for screenshot.");
                alert("Cannot save screenshot: Renderer not ready.");
                return;
            }
            try {
                // Render one more frame just before capture if paused (optional, helps ensure latest state)
                if (this.config.isPaused) {
                    this.render();
                }
                // Get canvas data as a PNG image Data URL
                const dataURL = this.renderer.domElement.toDataURL('image/png');
                // Create a temporary link element
                const link = document.createElement('a');
                link.href = dataURL;
                link.download = `background_screenshot_${Date.now()}.png`; // Set filename
                // Append, click, and remove the link to trigger download
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                console.log("Screenshot saved.");
            } catch (e) {
                console.error("Error saving screenshot:", e);
                // Handle potential errors (e.g., canvas tainted, browser restrictions)
                alert("Could not save screenshot. This might be due to browser security restrictions or an error.");
            }
        },

        // --- GIF Recording Functions ---

        // Initializes and starts the GIF recording process
        startGifRecord() {
            // Prevent starting if already recording
            if (this.isRecordingGif) {
                console.warn("Already recording GIF.");
                return;
            }
            // Check if gif.js library is loaded
            if (typeof GIF === 'undefined') {
                console.error("gif.js library not loaded. Cannot record GIF.");
                alert("GIF recording library (gif.js) not loaded.");
                return;
            }
            // Check if renderer is available
            if (!this.renderer) {
                console.error("Renderer not available for GIF recording.");
                alert("Cannot record GIF: Renderer not ready.");
                return;
            }

            console.log(`Starting GIF recording (Duration: ${this.gifDuration}ms, Delay: ${this.gifFrameDelay}ms, Quality: ${this.gifQuality})...`);
            this.isRecordingGif = true;
            this.gifStartTime = Date.now();
            this.gifFramesAdded = 0;

            // Initialize the gif.js instance
            try {
                this.gif = new GIF({
                    workers: 2, // Number of web workers for parallel processing (adjust based on performance)
                    quality: this.gifQuality, // GIF quality setting
                    width: this.renderer.domElement.width, // Use canvas width
                    height: this.renderer.domElement.height, // Use canvas height
                    // *** THE FIX: Point to the local worker script ***
                    workerScript: 'gif.worker.js' // Assumes gif.worker.js is in the same directory
                });
            } catch (e) {
                 console.error("Failed to initialize GIF instance:", e);
                 alert("Failed to start GIF recorder. Check console for details (maybe worker script path is wrong?).");
                 this.isRecordingGif = false; // Reset state
                 // Update UI to reflect failure
                 const statusEl = document.getElementById('gif-status');
                 const gifButton = document.getElementById('btn-gif');
                 if(statusEl) statusEl.textContent = 'GIF init failed.';
                 if(gifButton) gifButton.disabled = false; // Re-enable button
                 document.getElementById('recording-indicator')?.classList.add('hidden'); // Hide indicator
                 return; // Stop if initialization failed
            }


            // --- GIF Event Listeners ---

            // Called when the GIF rendering process is complete
            this.gif.on('finished', (blob) => {
                console.log(`GIF rendering finished (${blob.size} bytes).`);
                // Create a downloadable URL for the generated GIF blob
                const url = URL.createObjectURL(blob);
                // Create a temporary link to trigger download
                const link = document.createElement('a');
                link.href = url;
                link.download = `background_animation_${Date.now()}.gif`; // Set filename
                document.body.appendChild(link);
                link.click(); // Trigger download
                document.body.removeChild(link); // Clean up link
                URL.revokeObjectURL(url); // Release blob URL memory

                this.isRecordingGif = false; // Reset recording state

                // Update UI (status message, enable button)
                const statusEl = document.getElementById('gif-status');
                const gifButton = document.getElementById('btn-gif');
                if(statusEl) statusEl.textContent = 'GIF saved!';
                if(gifButton) gifButton.disabled = false; // Re-enable button
                document.getElementById('recording-indicator')?.classList.add('hidden'); // Hide indicator

                // Clear status message after a delay
                setTimeout(() => { if(statusEl) statusEl.textContent = ''; }, 3000);
            });

            // Called periodically during the rendering phase (after all frames are added)
            this.gif.on('progress', (p) => {
                // Update UI with rendering progress
                const statusEl = document.getElementById('gif-status');
                if(statusEl) statusEl.textContent = `Rendering GIF: ${Math.round(p * 100)}%`;
            });

            // --- Update UI to indicate recording started ---
            const statusEl = document.getElementById('gif-status');
            const gifButton = document.getElementById('btn-gif');
            if(statusEl) statusEl.textContent = 'Recording...';
            if(gifButton) gifButton.disabled = true; // Disable button while recording
            document.getElementById('recording-indicator')?.classList.remove('hidden'); // Show indicator
        },

        // Adds the current canvas frame to the GIF instance
        addGifFrame() {
            // Ensure recording is active and objects exist
            if (!this.isRecordingGif || !this.gif || !this.renderer) return;

            try {
                // console.log(`Adding GIF frame ${this.gifFramesAdded + 1}`);
                // Add the current canvas content as a frame
                // 'copy: true' ensures pixels are copied immediately
                this.gif.addFrame(this.renderer.domElement, {
                    copy: true,
                    delay: this.gifFrameDelay // Set delay for this specific frame
                });
                this.gifFramesAdded++; // Increment frame counter
            } catch (e) {
                console.error("Error adding GIF frame:", e);
                this.stopGifRecord(true); // Stop recording immediately on error
                alert("Error adding frame to GIF. Recording stopped.");
            }
        },

        // Stops the GIF recording and initiates the rendering process
        stopGifRecord(errorOccurred = false) {
            // Ensure recording is actually active
            if (!this.isRecordingGif) return;

            console.log("Stopping GIF recording...");
            this.isRecordingGif = false; // Set state immediately

            // --- Update UI ---
            const statusEl = document.getElementById('gif-status');
            const gifButton = document.getElementById('btn-gif');
            document.getElementById('recording-indicator')?.classList.add('hidden'); // Hide indicator

            // Check if gif instance exists and no error occurred
            if (this.gif && !errorOccurred) {
                // Only render if frames were actually captured
                if (this.gifFramesAdded > 0) {
                    if(statusEl) statusEl.textContent = 'Rendering GIF...'; // Update status
                    console.log(`Rendering ${this.gifFramesAdded} captured frames...`);
                    this.gif.render(); // Start the final GIF rendering process (asynchronous)
                } else {
                    // No frames captured, just update UI and clean up
                    console.warn("No frames captured for GIF. Recording stopped.");
                    if(statusEl) statusEl.textContent = 'Recording stopped (no frames).';
                    if(gifButton) gifButton.disabled = false; // Re-enable button
                    setTimeout(() => { if(statusEl) statusEl.textContent = ''; }, 3000); // Clear status
                }
            } else {
                // Handle cleanup if stopped due to an error or if gif instance is missing
                if(statusEl) statusEl.textContent = errorOccurred ? 'Recording failed.' : 'Recording stopped.';
                if(gifButton) gifButton.disabled = false; // Re-enable button
                setTimeout(() => { if(statusEl) statusEl.textContent = ''; }, 3000); // Clear status
            }
            // Clear the gif instance reference
            this.gif = null;
        },


        // --- Cleanup ---
        // Releases resources and removes event listeners
        cleanup(fullCleanup = true) {
            console.log("Cleaning up Three.js resources...");
            // Stop animation loop
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
            // Stop GIF recording if active
            if (this.isRecordingGif) {
                this.stopGifRecord(true); // Pass true to indicate cleanup/abort
            }

            // Dispose of Three.js objects (geometry, materials)
            if (this.scene) {
                // Iterate backwards when removing items from the array being modified
                for (let i = this.scene.children.length - 1; i >= 0; i--) {
                    const object = this.scene.children[i];
                    // Dispose geometry if present (safer check)
                    if (object.geometry) {
                        object.geometry.dispose();
                    }
                    // Dispose material(s) if present
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(m => {
                                if (m.map) m.map.dispose(); // Dispose textures if any
                                m.dispose();
                            });
                        } else {
                            if (object.material.map) object.material.map.dispose(); // Dispose texture if any
                            object.material.dispose();
                        }
                    }
                    // Remove object from scene
                    this.scene.remove(object);
                }
            }
            // Dispose the shared geometry if it exists
            if (this.geometry) {
                this.geometry.dispose();
                this.geometry = null;
            }
            // Dispose materials stored in the array
            this.materials.forEach(m => { if (m.dispose) m.dispose(); });
            this.materials = [];


            // Dispose of the renderer and remove its canvas element from the DOM
            if (this.renderer) {
                this.renderer.dispose(); // Release WebGL context and resources
                if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                    this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
                }
                this.renderer = null;
            }

            // Nullify references to potentially large objects
            this.scene = null;
            this.camera = null;


            // Remove event listeners only on full page unload (or explicit full cleanup)
            // to prevent removal during potential partial re-initializations if implemented later.
            if (fullCleanup) {
                window.removeEventListener('resize', this.handleResize);
                document.removeEventListener('mousemove', this.onDocumentMouseMove);
                document.removeEventListener('touchstart', this.onDocumentTouchStart);
                document.removeEventListener('touchmove', this.onDocumentTouchMove);
                document.removeEventListener('visibilitychange', this.handleVisibilityChange);
                window.removeEventListener('unload', this.cleanup); // Remove self to prevent multiple calls
                console.log("Event listeners removed.");
            }
            console.log("Cleanup complete.");
        }
    };

    // Expose the BackgroundApp object to the global window scope
    // so it can be accessed by controls.js
    window.BackgroundApp = BackgroundApp;

    // Initialize the application after the DOM is fully loaded
    if (document.readyState === 'loading') { // Loading hasn't finished yet
        document.addEventListener('DOMContentLoaded', () => BackgroundApp.init());
    } else { // `DOMContentLoaded` has already fired
        BackgroundApp.init();
    }

})(); // End of IIFE
