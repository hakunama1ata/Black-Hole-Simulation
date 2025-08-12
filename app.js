// app.js (ES module) — 3D ray-bending demo using global THREE + OrbitControls
// Put this file next to index.html and open the file in browser (or serve via GitHub Pages).

// Read UI elements
const canvas = document.getElementById('canvas3d');
const massSlider = document.getElementById('massSlider');
const cSlider = document.getElementById('cSlider');
const stepsSlider = document.getElementById('stepsSlider');
const stepsVal = document.getElementById('stepsVal');
const massVal = document.getElementById('massVal');
const cVal = document.getElementById('cVal');
const toggleDiskBtn = document.getElementById('toggleDisk');
const resetCameraBtn = document.getElementById('resetCamera');

let G = 1.0;
let M = 1000.0;
let C = 15.0;
let STEPS = 96;
let SHOW_DISK = true;

// Three.js renderer + scene
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setClearColor(0x000000, 1);
renderer.setPixelRatio(window.devicePixelRatio || 1);
const scene = new THREE.Scene();

// Camera (we use a regular perspective camera for 3D navigation)
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
camera.position.set(0, 10, 30);
camera.up.set(0,1,0);

// Orbit controls (attached via global THREE.OrbitControls)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 400;

// A fullscreen quad (plane) that runs fragment shader performing 3D ray marching
const fsQuad = (() => {
  const geom = new THREE.PlaneGeometry(2, 2);
  // fragment shader — numerically integrate ray in 3D under central gravity approxim.
  const vert = `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const frag = `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 u_resolution;
  uniform mat4 u_invViewMatrix;
  uniform vec3 u_cameraPos;
  uniform float u_G;
  uniform float u_M;
  uniform float u_C;
  uniform int u_steps;
  uniform float u_time;
  uniform bool u_showDisk;

  // simple pseudo-star background (procedural)
  float rand(vec2 p) { return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
  float star(vec2 uv){
    float s = 0.0;
    for(int i=0;i<4;i++){
      vec2 p = uv * (float(i)+1.0)*10.0;
      s += smoothstep(0.9985,1.0,rand(floor(p)));
    }
    return clamp(s,0.0,1.0);
  }

  // rotate 2D vector (helper)
  mat3 rotationFromMatrix(mat4 m) {
    mat3 r;
    r[0] = m[0].xyz;
    r[1] = m[1].xyz;
    r[2] = m[2].xyz;
    return r;
  }

  // check intersection with simple accretion disk: lie on XY plane around origin
  // disk: radius from r_in to r_out, small thickness
  bool diskHit(vec3 p, vec3 prev, out float tHit, out vec3 hitPos) {
    // Ray segment from prev -> p, check if it crosses near z ~ 0 plane within radius band
    // We'll do a simple linear interpolation to find crossing with z=0 if z signs differ
    if ((prev.z > 0.01 && p.z > 0.01) || (prev.z < -0.01 && p.z < -0.01)) {
      return false;
    }
    // param t where z crosses 0: prev + t*(p-prev)
    float dz = p.z - prev.z;
    if (abs(dz) < 1e-6) return false;
    float t = -prev.z / dz;
    if (t < 0.0 || t > 1.0) return false;
    vec3 ip = prev + t*(p - prev);
    float r = length(ip.xy);
    float r_in = 2.0; // inner radius
    float r_out = 12.0; // outer radius
    if (r >= r_in && r <= r_out) {
      tHit = t;
      hitPos = ip;
      return true;
    }
    return false;
  }

  void main(){
    // Build ray in world space from camera through pixel
    vec2 uv = (vUv * 2.0 - 1.0);
    uv.x *= u_resolution.x / u_resolution.y;

    // camera space ray
    vec4 ndir = vec4(uv.x, uv.y, -1.0, 0.0); // pointing into -Z camera space
    // transform ray direction to world by inverse view rotation (no translation)
    mat3 invRot = rotationFromMatrix(u_invViewMatrix);
    vec3 rayDir = normalize(invRot * ndir.xyz);

    vec3 rayPos = u_cameraPos;
    vec3 dir = rayDir;

    float dt = 0.06; // small step size in world units (tweakable)
    int steps = u_steps;

    // integrate
    vec3 prevPos = rayPos;
    bool captured = false;
    bool hitDisk = false;
    vec3 diskHitPos = vec3(0.0);

    for (int i=0; i<1024; ++i) {
      if(i >= steps) break;

      // compute radius and schwarzschild radius
      float r = length(rayPos);
      float rs = (2.0 * u_G * u_M) / (u_C * u_C);
      if (r < rs) { captured = true; break; }

      // Newton-like acceleration (visual approximation): a = -GM * r_hat / r^2
      vec3 acc = - (u_G * u_M) * (rayPos / (pow(r,3.0) + 1e-9));

      // update direction using small transverse deflection (approx)
      dir += acc * dt;
      dir = normalize(dir);

      prevPos = rayPos;
      rayPos += dir * dt;

      // check simple disk intersection between prevPos and rayPos
      float tHit; vec3 hp;
      if (u_showDisk) {
        if (diskHit(rayPos, prevPos, tHit, hp)) {
          hitDisk = true;
          diskHitPos = hp;
          break;
        }
      }
    }

    vec3 color = vec3(0.0);

    if (captured) {
      color = vec3(0.0); // black hole
    } else if (hitDisk) {
      // map diskHitPos to color: inner hot -> orange, outer cooler -> redder
      float r = length(diskHitPos.xy);
      float t = smoothstep(2.0, 12.0, r);
      vec3 inner = vec3(1.0, 0.7, 0.3);
      vec3 outer = vec3(0.6, 0.1, 0.05);
      color = mix(inner, outer, t) * (1.0 + 0.8*exp(-r*0.4));
    } else {
      // sample procedural starfield using rayPos direction as sky coords
      vec2 skyUV = normalize(rayPos).xy * 2.0 + vec2(12.345, 6.789);
      float s = star(skyUV * 8.0);
      color = mix(vec3(0.02,0.02,0.06), vec3(1.0,1.0,1.0), s) * (0.9 + 0.3*fract(sin(u_time*0.01)));
      // add subtle glow from proximity
      float rfinal = length(rayPos);
      float glow = exp(-rfinal * 0.2) * 0.9;
      color += vec3(1.0, 0.45, 0.15) * glow * 0.5;
    }

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      u_invViewMatrix: { value: new THREE.Matrix4() },
      u_cameraPos: { value: new THREE.Vector3() },
      u_G: { value: G },
      u_M: { value: M },
      u_C: { value: C },
      u_steps: { value: STEPS },
      u_time: { value: 0.0 },
      u_showDisk: { value: SHOW_DISK }
    },
    depthTest: false,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(geom, material);
  return { mesh: mesh, material: material };
})();

scene.add(fsQuad.mesh);

// Add a subtle foggy ambient (not necessary but helps visuals)
const ambient = new THREE.AmbientLight(0x202030, 1.0);
scene.add(ambient);

// Optionally add a small helper mesh at origin so user sees it in 3D (thin ring)
const ring = new THREE.Mesh(
  new THREE.RingGeometry(2.3, 2.6, 64),
  new THREE.MeshBasicMaterial({ color: 0xff4444, side: THREE.DoubleSide, opacity: 0.9, transparent: true })
);
ring.rotation.x = Math.PI / 2;
ring.position.set(0,0,0);
ring.visible = false; // hide; the shader draws horizon
scene.add(ring);

// Resize handler
function onResize(){
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  fsQuad.material.uniforms.u_resolution.value.set(w, h);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize, { passive: true });
onResize();

// UI handlers
massSlider.oninput = (e) => { M = +e.target.value; massVal.textContent = M; fsQuad.material.uniforms.u_M.value = M; };
cSlider.oninput = (e) => { C = +e.target.value; cVal.textContent = C; fsQuad.material.uniforms.u_C.value = C; };
stepsSlider.oninput = (e) => { STEPS = +e.target.value; stepsVal.textContent = STEPS; fsQuad.material.uniforms.u_steps.value = STEPS; };
toggleDiskBtn.onclick = () => { SHOW_DISK = !SHOW_DISK; fsQuad.material.uniforms.u_showDisk.value = SHOW_DISK; toggleDiskBtn.textContent = SHOW_DISK ? 'Hide Disk' : 'Show Disk'; };
resetCameraBtn.onclick = () => { camera.position.set(0, 10, 30); controls.target.set(0,0,0); controls.update(); };

// animation
let last = performance.now();
function animate(now){
  const t = now * 0.001;
  const dt = (now - last) * 0.001;
  last = now;

  controls.update();

  // update shader uniforms: inverse view matrix and camera pos
  const viewMatrix = camera.matrixWorldInverse;
  const invView = new THREE.Matrix4().copy(camera.matrixWorld); // inverse of view
  fsQuad.material.uniforms.u_invViewMatrix.value.copy(invView);
  fsQuad.material.uniforms.u_cameraPos.value.copy(camera.position);
  fsQuad.material.uniforms.u_time.value = t;
  fsQuad.material.uniforms.u_G.value = G;
  fsQuad.material.uniforms.u_M.value = M;
  fsQuad.material.uniforms.u_C.value = C;
  fsQuad.material.uniforms.u_steps.value = STEPS;

  // render full-screen quad
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// initial UI text values
massVal.textContent = M;
cVal.textContent = C;
stepsVal.textContent = STEPS;
