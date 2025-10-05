// --- 1. CONFIGURATION ---
const numLasers = 150; 

// --- VISUALIZER MAPPING CONFIGURATION ---
const baseReach = 30.0;     
const baseHeight = 40.0;    
const audioMaxMultiplier = 25.0; // Max Height/Reach is contained but noticeable
const audioRotationSpeed = 0.005; // Controls Max Rotation Speed (Controlled Response)

// --- ZIG-ZAG CONFIGURATION ---
const zigZagFrequency = 25; // How many "points" in the zig-zag pattern
const zigZagAmplitude = 15.0; // How far the zig-zags spread horizontally
const zigZagSpeed = 2.0; // Speed of the zig-zag movement

// --- FLOW SPEED CONFIGURATION (All movement is extremely slow and static) ---
const baseFlowSpeed = 0.0005;      
const baseSwayFrequency = 0.001;   

// --- STATIC RADIATION CONFIGURATION ---
const sourceY = -10.0; 
const sourceSpread = 5.0; 
const swirlSpeed = 0.2; // Slow speed for global orbit
const swirlRadiusFactor = 0.5; 

// --- SMOOTHING SETUP ---
const audioSmoothingFactor = 0.3; // Increased for fast, bouncy response
const decayRate = 0.4;             // Increased for snappier return (bounce effect)
let smoothedBassVolume = 0.0;
let smoothedMidVolume = 0.0;

// Dynamic variables controlled by smoothed audio volume
let dynamicReachMultiplier = 1.0;
let dynamicFlowSpeed = baseFlowSpeed; 
let dynamicSwayFrequency = baseSwayFrequency; 

// --- 2. SETUP AUDIO CONTEXT ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 256; 
const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

let audioSource;
const audioElement = document.getElementById('audioElement');
const fileInput = document.getElementById('fileInput');

// Make sure the DOM elements exist before adding listeners
if (fileInput && audioElement) {
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            if (audioElement.src) {
                URL.revokeObjectURL(audioElement.src);
            }
            audioElement.src = URL.createObjectURL(file);
            audioElement.play();
            
            // Connect audio source if it hasn't been done yet
            if (!audioSource) {
                audioSource = audioCtx.createMediaElementSource(audioElement);
                audioSource.connect(analyser);
                analyser.connect(audioCtx.destination);
            }
        }
    });
}

// --- 3. SETUP SCENE, CAMERA, AND RENDERER ---
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    75, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true }); 
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.setClearColor(0x000000); 

camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

// --- 4. GEOMETRY BUFFERS AND MATERIALS ---
const laserGroup = new THREE.Group();
scene.add(laserGroup);

const linePositions = new Float32Array(numLasers * 2 * 3); 
const linesGeometry = new THREE.BufferGeometry();
linesGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

// Initialize with white material
const glowingMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff, 
    linewidth: 1,    
    blending: THREE.AdditiveBlending 
});

const lasers = new THREE.LineSegments(linesGeometry, glowingMaterial);
laserGroup.add(lasers); 

// --- 5. INITIALIZE LASERS (Distributed Start Points) ---
const initialStartPointsX = [];

for (let i = 0; i < numLasers; i++) {
    const startIdx = i * 6; 
    
    // Distributed start points on the X-axis
    const startX = (i / numLasers - 0.5) * sourceSpread * 2;
    initialStartPointsX.push(startX);
    
    linePositions[startIdx + 0] = startX; // X
    linePositions[startIdx + 1] = sourceY; // Y
    linePositions[startIdx + 2] = 0; // Z
}

// Helper function to convert HSL to a Three.js Color object
function hslToThreeColor(h, s, l) {
    const color = new THREE.Color();
    color.setHSL(h, s, l);
    return color;
}

// --- 6. ANIMATION LOOP ---
function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.001;

    let currentBassVolume = 0.0;
    let currentMidVolume = 0.0;

    // --- AUDIO ANALYSIS ---
    if (audioSource && !audioElement.paused) { 
        audioCtx.resume(); 
        analyser.getByteFrequencyData(dataArray);
        
        const bassEnd = Math.floor(bufferLength / 8); 
        const midEnd = Math.floor(bufferLength / 2);

        let bassSum = 0;
        for (let i = 0; i < bassEnd; i++) {
            bassSum += dataArray[i];
        }
        const bassVolume = (bassSum / bassEnd) / 255; 

        let midSum = 0;
        for (let i = bassEnd; i < midEnd; i++) {
            midSum += dataArray[i];
        }
        const midVolume = (midSum / (midEnd - bassEnd)) / 255; 

        currentBassVolume = bassVolume;
        currentMidVolume = midVolume;
    } 
    
    // --- APPLY SMOOTHING (Decays to 0.0 when audio is paused) ---
    smoothedBassVolume += (currentBassVolume - smoothedBassVolume) * audioSmoothingFactor;
    smoothedMidVolume += (currentMidVolume - smoothedMidVolume) * audioSmoothingFactor;

    // --- MAPPING TO VISUALS ---
    
    // LOGIC FOR PAUSE: Explicitly decay dynamic parameters back to baseline fast if paused
    if (audioElement.paused) {
        dynamicReachMultiplier += (1.0 - dynamicReachMultiplier) * decayRate;
        dynamicFlowSpeed += (baseFlowSpeed - dynamicFlowSpeed) * decayRate; 
        dynamicSwayFrequency += (baseSwayFrequency - dynamicSwayFrequency) * decayRate;
        glowingMaterial.color.setHex(0x3333ff); 
    } else {
        // *** 1. HEIGHT/REACH (Beat/Bass Volume) - BOUNCY RESPONSE ***
        dynamicReachMultiplier = 1 + smoothedBassVolume * audioMaxMultiplier;
        
        // *** 2. FLOW/SWAY SPEED (STATIC) ***
        dynamicFlowSpeed = baseFlowSpeed; 
        dynamicSwayFrequency = baseSwayFrequency;

        // --- DYNAMIC COLOR CALCULATION ---
        const hue = (0.5 + smoothedMidVolume * 0.5) % 1; 
        const saturation = 1.0; 
        const lightness = 0.6 + smoothedMidVolume * 0.2; 

        glowingMaterial.color.copy(hslToThreeColor(hue, saturation, lightness));
    }
    
    // C. Rotation Speed (Controlled response to mid-range volume)
    laserGroup.rotation.y += 0.000005 + (smoothedMidVolume * audioRotationSpeed); 
    
    // D. Camera Z movement (negligible and static)
    camera.position.z = 10; 
    camera.updateProjectionMatrix();
    
    // E. Global Motion (Swirl) - Circular path around the center of the screen (XY plane)
    const orbitalRadius = baseReach * swirlRadiusFactor; 
    
    laserGroup.position.x = Math.sin(time * swirlSpeed) * orbitalRadius;
    laserGroup.position.y = Math.cos(time * swirlSpeed) * orbitalRadius * 0.5; 
    laserGroup.position.z = 0;
    
    // GLOBAL MOTION (X-rotation is independent and runs always)
    laserGroup.rotation.x += 0.000005; 

    
    // Zig-Zag speed is static but the amplitude scales with the audio reach
    const pulsatingReach = baseReach * dynamicReachMultiplier; 
    
    for (let i = 0; i < numLasers; i++) {
        const endIdx = i * 6 + 3; 
        
        const startX = initialStartPointsX[i];
        const baseAngle = (i / numLasers) * Math.PI * 2;

        // *** ZIG-ZAG LOGIC ***
        // Zig-zag offset based on laser index (frequency) and time (speed)
        const zigZagOffset = Math.sin(i * zigZagFrequency + time * zigZagSpeed);
        
        // End X Position: StartX + dynamic oscillating offset. The multiplier ensures the zig-zag scales with the height pulse.
        const endX = startX + zigZagOffset * zigZagAmplitude * (pulsatingReach / baseReach); 
        
        // End Z Position: Simple slow depth flow (controlled by baseFlowSpeed)
        const endZ = Math.sin(baseAngle + time * dynamicFlowSpeed) * pulsatingReach * 0.5; 
        
        linePositions[endIdx + 0] = endX;
        linePositions[endIdx + 2] = endZ;

        // Y coordinate defines the height, radiating upwards from the sourceY
        const waveHeight = baseHeight * Math.abs(Math.sin(baseAngle * 5 + time * 0.5)) * 0.7; 
        linePositions[endIdx + 1] = sourceY + waveHeight * dynamicReachMultiplier; 
    }

    // Notify Three.js that the line positions have changed
    linesGeometry.attributes.position.needsUpdate = true;
    
    renderer.render(scene, camera);
}

// Start the animation
animate();

// --- 7. RESPONSIVENESS ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    });