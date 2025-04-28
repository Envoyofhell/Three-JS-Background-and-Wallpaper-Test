# Interactive Three.js Particle Background

This project displays an animated particle background using Three.js and provides an interactive control panel to customize its appearance and behavior in real-time.

## Features

* **Dynamic Particle Animation:** Creates a visually appealing background with thousands of moving particles.
* **Multiple Visual States:** Switch between three distinct visual styles:
    * **Normal:** A calm, subtly shifting particle field.
    * **Rave:** Faster movement, brighter colors, and more intense effects.
    * **Techno:** Very fast, strobing colors, and high-energy rotation.
* **Interactive Controls:** A side panel allows users to adjust various parameters:
    * **State Buttons:** Switch between Normal, Rave, and Techno modes.
    * **Rotation Speed:** Control the overall speed of particle system rotation.
    * **Mouse Sensitivity:** Adjust how much the camera follows the mouse cursor.
    * **Breathing Effect:** Modify the intensity and speed of the camera's subtle zoom oscillation.
    * **Fog Density:** Change the density of the scene's fog.
    * **Particle Opacity:** Adjust the overall transparency of the particles.
    * **Particle Size:** Scale the size of the particles.
    * **Hue Offset:** Shift the base color hue of the particles.
    * **Pause/Resume:** Toggle the animation on and off.
* **Screenshot Saving:** Capture a PNG image of the current animation frame.
* **GIF Recording:** Record a short (5-second) animated GIF of the background.

## Project Structure

* `index.html`: The main HTML file that sets up the page structure, loads libraries, and includes the controls panel UI.
* `styles.css`: Contains custom CSS rules for styling the page elements, particularly the controls panel. Tailwind CSS is also used via CDN for utility classes.
* `background.js`: The core JavaScript file containing the Three.js logic for creating, managing, and animating the particle background (`BackgroundApp` object).
* `controls.js`: JavaScript file that handles user interactions with the sliders and buttons in the control panel, updating the `BackgroundApp` configuration.
* `gif.worker.js`: The web worker script required by the `gif.js` library for processing GIF frames in the background. **Must be present in the same directory.**

## Dependencies

* **Three.js:** Loaded via CDN in `index.html`.
* **gif.js:** Main library loaded via CDN in `index.html`.
* **Tailwind CSS:** Loaded via CDN in `index.html` for styling.

## Setup and Usage

1.  **Ensure all files are present:** Make sure `index.html`, `styles.css`, `background.js`, `controls.js`, and `gif.worker.js` are all in the same directory.
2.  **Open `index.html`:** Open the `index.html` file directly in a modern web browser (like Chrome, Firefox, Edge, Safari).
    * *Note:* Because the GIF recording uses a Web Worker loaded locally (`gif.worker.js`), it should work when opened directly as a file (`file:///...`). If you encounter unexpected issues (especially related to workers or security), running it through a simple local web server might be necessary.
3.  **Interact:** Use the controls panel on the right side of the screen to change the animation's settings, pause/resume, save screenshots, or record GIFs.

## How Controls Work

* **State Buttons (Normal/Rave/Techno):** Click to switch the overall visual theme. This also resets relevant sliders to default values for that theme.
* **Sliders:** Drag the sliders to adjust parameters like speed, size, color, etc., in real-time. The value display next to each slider updates automatically.
* **Pause/Resume:** Toggles the animation loop.
* **Save Screenshot:** Immediately captures the current view and triggers a PNG download.
* **Record GIF (5s):** Starts recording the animation for 5 seconds. The button will be disabled during recording. A status message indicates progress ("Recording...", "Rendering GIF...", "GIF Saved!"). The final GIF will be downloaded automatically.

Enjoy customizing your particle background!
