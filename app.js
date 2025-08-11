// src/web/app.js
// ES module (imported from index.html). Uses Three.js from CDN (already loaded in index.html).
// Ensure this file is placed next to index.html (or update path in index).

import * as THREE from 'three';

// ---------------------------
// Globals / default params
// ---------------------------
let G = 1.0;
let M = 1000.0;
let C = 15.0;
let timeStep = 0.1;
let TRAIL_LEN = 300;

// UI elements
const massSlider = document.getElementById('massSlider');
const cSlider = document.getElementById('cSlider');
const dtSlider = document.getElementById('dtSlider');
const trailSlider = document.getElementById('trailSlider');
const massVal = document.getElementById('massVal');
const cVal = document.getElementById('cVal');
const dtVal = document.getElementById('dtVal');
const trailVal = document.getElementById('trailVal');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const spawnBtn = document.getElementById('spawnBtn');
const countSpan = document.getElementById('count');

massSlider.oninput = (e) => { M = +e.target.value; massVal.textContent = M; updateUniforms(); };
cSlider.oninput = (e) => { C = +e.target.value; cVal.textContent = C; updateUniforms(); };
dtSlider.oninput = (e) => { timeStep = +e.target.value; dtVal.textContent = timeStep.toFixed(2); };
trailSlider.oninput = (e) => { TRAIL_LEN = +e.target.value; trailVal.textContent = TRAIL_LEN; particles.forEach(p => clampTrail(p)); };

// ---------------------------
// Three.js: full-screen quad
// ---------------------------

const container = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);

// Vertex shader (pass-through)
const vert = `
precision mediump float;
attribute vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

// Fragment shader — visual ray-bending approximation
// We perform a small-step path integration in 2D (screen-space projection) and sample a starfield texture (procedural).
const frag = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_G;
uniform float u_M;
uniform float u_C;
uniform vec3 u_bgColor;

#define STEPS 64
#define STEP_SIZE 0.02

// simple hash-based starfield
float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453123); }
float star(vec2 uv) {
  float s = 0.0;
  for(int i=0;i<3;i++){
    vec2 p = uv * (float(i)+1.0)*10.0;
    s += smoothstep(0.998,1.0,rand(floor(p)));
  }
  return clamp(s, 0.0, 1.0);
}

void main(){
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y; // keep aspect

  // camera ray origin in screen plane, treat z fixed
  vec2 rayPos = uv * 3.0;    // scale to simulation units (visual)
  vec2 rayDir = normalize(uv);

  // black hole center at origin (0,0). Integrate ray path with Newton-like transverse acceleration
  // note: visual approximation — not full GR
  for(int i=0;i<STEPS;i++){
    float r = length(rayPos);
    float rs = (2.0 * u_G * u_M) / (u_C * u_C);

    if (r < rs) {
      // fallen into black hole -> black
      gl_FragColor = vec4(0.0,0.0,0.0,1.0); 
      return;
    }

    // Newtonian gravitational acceleration (in 2D)
    vec2 acc = - (u_G * u_M) * (rayPos / (r*r*r + 1e-6));
    // update ray direction (small-angle bending)
    rayDir += acc * STEP_SIZE;
    rayDir = normalize(rayDir);
    rayPos += rayDir * STEP_SIZE;
  }

  // After integrating ray, use final rayPos to sample starfield (simulate background)
  // Map rayPos -> sky coordinates for procedural star sampling
  vec2 sky = rayPos.xy * 0.4 + vec2(12.345, 6.789);
  float s = star(sky*10.0);
  // accretion glow: simple radial emission near BH
  float rfinal = length(rayPos);
  float glow = exp(-rfinal*0.6) * 1.6;
  vec3 color = mix(u_bgColor, vec3(1.0,1.0,1.0)*s, s);
  color += vec3(1.0,0.45,0.15) * glow * 0.6; // warm glow
  color = clamp(color, 0.0, 1.5);
  gl_FragColor = vec4(color, 1.0);
}
`;

// create shader material
const uniforms = {
  u_resolution: { value: new THREE.Vector2(1,1) },
  u_time: { value: 0.0 },
  u_G: { value: G },
  u_M: { value: M },
  u_C: { value: C },
  u_bgColor: { value: new THREE.Color(0.02, 0.02, 0.06) },
};

const geometry = new THREE.BufferGeometry();
const positions = new Float32Array([
  -1,-1,0,
   1,-1,0,
  -1, 1,0,
  -1, 1,0,
   1,-1,0,
   1, 1,0
]);
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const material = new THREE.ShaderMaterial({
  vertexShader: vert,
  fragmentShader: frag,
  uniforms: uniforms,
  depthTest: false,
  depthWrite: false,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// renderer sizing
function onResize(){
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w,h);
  uniforms.u_resolution.value.set(w,h);
  overlay.width = w;
  overlay.height = h;
}
window.addEventListener('resize', onResize, { passive: true });

// ---------------------------
// 2D overlay: particle simulation (mirrors Python initial conditions)
// ---------------------------

const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');

class Particle {
  constructor(pos, vel, mass=1.0, isPhoton=false){
    this.pos = { x: pos[0], y: pos[1] };     // sim units
    this.vel = { x: vel[0], y: vel[1] };     // sim units / time
    this.mass = mass;
    this.isPhoton = isPhoton;
    this.path = [{x:this.pos.x, y:this.pos.y}];
    this.isCaptured = false;
  }
  update(dt){
    if (this.isCaptured) return;
    const bh = {x:0, y:0};
    const rx = bh.x - this.pos.x;
    const ry = bh.y - this.pos.y;
    const r = Math.hypot(rx, ry);
    if (r === 0) return;
    const rs = (2 * G * M) / (C * C);
    if (r < rs) { this.isCaptured = true; return; }

    // Newtonian force
    const forceMag = (G * M * this.mass) / (r * r);
    const ax = (forceMag * (rx / r)) / this.mass;
    const ay = (forceMag * (ry / r)) / this.mass;

    this.vel.x += ax * dt;
    this.vel.y += ay * dt;

    if (this.isPhoton) {
      const vmag = Math.hypot(this.vel.x, this.vel.y) || 1;
      this.vel.x = (this.vel.x / vmag) * C;
      this.vel.y = (this.vel.y / vmag) * C;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.path.push({x:this.pos.x, y:this.pos.y});
    if (this.path.length > TRAIL_LEN) this.path.shift();
  }
}

// Exact initial particles from your Python repo
let particles = [];
function clampTrail(p){ if (p.path.length > TRAIL_LEN) p.path = p.path.slice(-TRAIL_LEN); }

function resetParticles(){
  particles = [];
  const rs = (2 * G * M) / (C * C);
  // the same initial conditions as the python code you provided earlier
  particles.push(new Particle([100, 0], [0, 7.5], 1.0, false));
  particles.push(new Particle([-110, 0], [0, -7.0], 1.0, false));
  particles.push(new Particle([0, 130], [-6.5, 0], 1.0, false));
  particles.push(new Particle([0, -140], [6.0, 0], 1.0, false));
  particles.push(new Particle([-250, 50], [7, 0], 1.0, false));
  particles.push(new Particle([-250, rs * 1.5], [C, 0], 0.0, true));
  particles.push(new Particle([-250, rs * 0.8], [C, 0], 0.0, true));
  countSpan.textContent = particles.length;
}
resetParticles();

// coordinate mapping: simulation units -> screen pixels (centered)
function simToScreen(x, y){
  const scale = 1.0; // pixels per simulation unit; choose adaptively
  // auto-zoom so initial particles fit nicely
  const autoScale = Math.min(window.innerWidth, window.innerHeight) / 900; // tuned constant for visuals
  const px = window.innerWidth/2 + x * autoScale * scale;
  const py = window.innerHeight/2 + y * autoScale * scale;
  return [px, py];
}

// draw particles and trails
function drawParticles(){
  octx.clearRect(0,0,overlay.width, overlay.height);
  // subtle fade background to create trailing impression (but we maintain explicit path arrays)
  // draw each particle path
  for (let p of particles){
    // path
    octx.beginPath();
    for (let i=0;i<p.path.length;i++){
      const s = p.path[i];
      const [sx, sy] = simToScreen(s.x, s.y);
      if (i === 0) octx.moveTo(sx, sy); else octx.lineTo(sx, sy);
    }
    octx.strokeStyle = p.isPhoton ? 'rgba(255,220,120,0.95)' : 'rgba(120,220,240,0.95)';
    octx.lineWidth = 1.2;
    octx.stroke();

    // head
    const [x, y] = simToScreen(p.pos.x, p.pos.y);
    octx.beginPath();
    octx.fillStyle = p.isPhoton ? '#ffd980' : '#66f0ff';
    octx.arc(x, y, p.isPhoton ? 3.2 : 3.6, 0, Math.PI*2);
    octx.fill();
  }

  // draw event horizon circle on overlay for crispness (matches shader)
  const rs = (2 * G * M) / (C * C);
  const [cx, cy] = simToScreen(0,0);
  const rpx = Math.abs(simToScreen(rs, 0)[0] - cx);
  octx.beginPath();
  octx.strokeStyle = 'rgba(255,90,90,0.9)';
  octx.lineWidth = 1.6;
  octx.arc(cx, cy, rpx, 0, Math.PI*2);
  octx.stroke();
}

// ---------------------------
// Animation loop
// ---------------------------

let last = performance.now();
let paused = false;

function updateUniforms(){
  uniforms.u_G.value = G;
  uniforms.u_M.value = M;
  uniforms.u_C.value = C;
}

updateUniforms();
onResize();

function tick(now){
  const dt = (now - last) / 1000.0;
  last = now;

  uniforms.u_time.value = now * 0.001;

  if (!paused) {
    // advance particle sim – use timeStep (user controls) as internal dt
    // but scale by real dt to keep stable across framerates: advance n steps
    const steps = Math.max(1, Math.floor((dt / timeStep) * 1)); // roughly 1 sim step per frame scaled
    for (let s=0;s<steps;s++){
      particles.forEach(p => p.update(timeStep));
    }
  }

  drawParticles();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------------------------
// UI interactivity
// ---------------------------

pauseBtn.onclick = () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
};
resetBtn.onclick = () => {
  resetParticles();
};
spawnBtn.onclick = () => {
  const rs = (2 * G * M) / (C * C);
  particles.push(new Particle([-280, rs * (1.0 + Math.random()*1.5)], [C, 0], 0.0, true));
  countSpan.textContent = particles.length;
};

// page visibility: stop heavy updates when hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) paused = true;
});

// enable resizing on load
window.addEventListener('load', () => {
  onResize();
});

// helper to keep particle's trail limit in sync
function clampTrail(p){
  if (p.path.length > TRAIL_LEN) p.path = p.path.slice(-TRAIL_LEN);
}

// initial sizing right now
onResize();
