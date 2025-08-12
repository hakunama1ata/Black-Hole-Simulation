// src/web/app.js (FIXED) — relies on global THREE (from <script src="three.min.js">)
const THREE = window.THREE;
if (!THREE) {
  console.error("Three.js not found. Make sure the <script src='...three.min.js'> is included.");
}

// ---------------------------
// Config / Defaults
// ---------------------------
let G = 1.0;
let M = 1000.0;
let C = 15.0;
let timeStep = 0.1;
let TRAIL_LEN = 300;

// UI elements (assume index.html has these ids)
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
trailSlider.oninput = (e) => { TRAIL_LEN = +e.target.value; trailVal.textContent = TRAIL_LEN; particles.forEach(clampTrail); };

// ---------------------------
// Three.js full-screen quad
// ---------------------------
const container = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);

// shaders (vertex + fragment)
const vert = `
precision mediump float;
attribute vec3 position;
void main(){ gl_Position = vec4(position, 1.0); }
`;

const frag = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_G;
uniform float u_M;
uniform float u_C;

#define STEPS 48
#define STEP 0.02

float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453123); }
float star(vec2 uv) {
  float s = 0.0;
  for(int i=0;i<3;i++){
    vec2 p = uv * (float(i)+1.0)*8.0;
    s += smoothstep(0.998,1.0,rand(floor(p)));
  }
  return clamp(s, 0.0, 1.0);
}

void main(){
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;

  vec2 rayPos = uv * 3.0;
  vec2 rayDir = normalize(uv + vec2(0.0001, 0.0002));

  for(int i=0;i<STEPS;i++){
    float r = length(rayPos);
    float rs = (2.0 * u_G * u_M) / (u_C * u_C);
    if (r < rs) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vec2 acc = - (u_G * u_M) * (rayPos / (pow(r,3.0) + 1e-6));
    rayDir += acc * STEP;
    rayDir = normalize(rayDir);
    rayPos += rayDir * STEP;
  }

  vec2 sky = rayPos.xy * 0.35 + vec2(12.345, 6.789);
  float s = star(sky*10.0);
  float rfinal = length(rayPos);
  float glow = exp(-rfinal*0.6) * 1.6;
  vec3 color = mix(vec3(0.02,0.02,0.06), vec3(1.0)*s, s);
  color += vec3(1.0,0.45,0.15) * glow * 0.6;
  color = clamp(color, 0.0, 1.5);
  gl_FragColor = vec4(color, 1.0);
}
`;

const uniforms = {
  u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  u_time: { value: 0.0 },
  u_G: { value: G },
  u_M: { value: M },
  u_C: { value: C }
};

const geometry = new THREE.BufferGeometry();
const positions = new Float32Array([
  -1,-1,0,  1,-1,0,  -1,1,0,
  -1,1,0,   1,-1,0,   1,1,0
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

// renderer & overlay sizing
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');

function setSize(){
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  uniforms.u_resolution.value.set(w, h);

  // overlay handle DPR for crisp trails
  const dpr = window.devicePixelRatio || 1;
  overlay.width = Math.floor(w * dpr);
  overlay.height = Math.floor(h * dpr);
  overlay.style.width = w + 'px';
  overlay.style.height = h + 'px';
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', setSize);
setSize();

// ---------------------------
// 2D CPU particle sim (mirror python initial conditions)
// ---------------------------
class Particle {
  constructor(pos, vel, mass=1.0, isPhoton=false){
    this.pos = { x: pos[0], y: pos[1] };
    this.vel = { x: vel[0], y: vel[1] };
    this.mass = mass;
    this.isPhoton = isPhoton;
    this.path = [{x:this.pos.x, y:this.pos.y}];
    this.isCaptured = false;
  }
  update(dt){
    if (this.isCaptured) return;
    const rx = -this.pos.x, ry = -this.pos.y;
    const r = Math.hypot(rx, ry);
    if (r === 0) return;
    const rs = (2 * G * M) / (C * C);
    if (r < rs) { this.isCaptured = true; return; }

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

let particles = [];
function clampTrail(p){ if (p.path.length > TRAIL_LEN) p.path = p.path.slice(-TRAIL_LEN); }

function resetParticles(){
  particles = [];
  const rs = (2 * G * M) / (C * C);
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

function simToScreen(x, y){
  const autoScale = Math.min(window.innerWidth, window.innerHeight) / 900;
  const px = window.innerWidth/2 + x * autoScale;
  const py = window.innerHeight/2 + y * autoScale;
  return [px, py];
}

function drawParticles(){
  // clear overlay
  octx.clearRect(0,0,overlay.width, overlay.height);

  // draw trails and heads
  for (let p of particles){
    octx.beginPath();
    for (let i=0;i<p.path.length;i++){
      const s = p.path[i];
      const [sx, sy] = simToScreen(s.x, s.y);
      if (i === 0) octx.moveTo(sx, sy); else octx.lineTo(sx, sy);
    }
    octx.strokeStyle = p.isPhoton ? 'rgba(255,220,120,0.95)' : 'rgba(120,220,240,0.95)';
    octx.lineWidth = 1.2;
    octx.stroke();

    const [x, y] = simToScreen(p.pos.x, p.pos.y);
    octx.beginPath();
    octx.fillStyle = p.isPhoton ? '#ffd980' : '#66f0ff';
    octx.arc(x, y, p.isPhoton ? 3.2 : 3.6, 0, Math.PI*2);
    octx.fill();
  }

  // draw event horizon circle
  const rs = (2 * G * M) / (C * C);
  const [cx, cy] = simToScreen(0,0);
  const rpx = Math.abs(simToScreen(rs, 0)[0] - cx);
  octx.beginPath();
  octx.strokeStyle = 'rgba(255,90,90,0.85)';
  octx.lineWidth = 1.6;
  octx.arc(cx, cy, rpx, 0, Math.PI*2);
  octx.stroke();
}

// ---------------------------
// Animation loop
// ---------------------------
let last = performance.now();
let paused = false;
function updateUniforms(){ uniforms.u_G.value = G; uniforms.u_M.value = M; uniforms.u_C.value = C; }
updateUniforms();

function animate(now){
  const dt = (now - last) / 1000;
  last = now;
  uniforms.u_time.value = now * 0.001;

  // update particle sim with user timeStep; run several sub-steps if frame dt large
  if (!paused) {
    const nSteps = Math.max(1, Math.round((dt / timeStep) || 1));
    for (let s=0; s<nSteps; s++){
      particles.forEach(p => p.update(timeStep));
    }
  }

  drawParticles();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ---------------------------
// UI handlers
// ---------------------------
pauseBtn.onclick = () => { paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; };
resetBtn.onclick = () => { resetParticles(); };
spawnBtn.onclick = () => {
  const rs = (2 * G * M) / (C * C);
  particles.push(new Particle([-280, rs * (1 + Math.random()*1.5)], [C, 0], 0.0, true));
  countSpan.textContent = particles.length;
};
document.addEventListener('visibilitychange', () => { if (document.hidden) paused = true; });

// ensure initial size
setSize();
