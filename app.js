// app.js — uses Three.js ES modules (CDN).
// Place this next to index.html. Works with GitHub Pages.

import * as THREE from 'https://unpkg.com/three@0.155.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.155.0/examples/jsm/controls/OrbitControls.js';

window.addEventListener('DOMContentLoaded', () => {

  // DOM elements (guaranteed to exist now)
  const canvas = document.getElementById('canvas3d');
  const massSlider = document.getElementById('massSlider');
  const cSlider = document.getElementById('cSlider');
  const stepsSlider = document.getElementById('stepsSlider');
  const stepsVal = document.getElementById('stepsVal');
  const massVal = document.getElementById('massVal');
  const cVal = document.getElementById('cVal');
  const toggleDiskBtn = document.getElementById('toggleDisk');
  const resetCameraBtn = document.getElementById('resetCamera');

  // Simulation params (mutable by UI)
  let G = 1.0;
  let M = 1000.0;
  let C = 15.0;
  let STEPS = 96;
  let SHOW_DISK = true;

  // Renderer and scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(window.devicePixelRatio || 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 10, 30);

  // Orbit controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 400;

  // Full-screen quad shader (3D ray integration approximation)
  const quadGeo = new THREE.PlaneGeometry(2, 2);

  const vert = `
    varying vec2 vUv;
    void main() {
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

    float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453123); }
    float star(vec2 uv){
      float s = 0.0;
      for(int i=0;i<4;i++){
        vec2 p = uv * (float(i)+1.0)*10.0;
        s += smoothstep(0.9985,1.0,rand(floor(p)));
      }
      return clamp(s,0.0,1.0);
    }

    mat3 mat3_from_mat4(mat4 m) {
      return mat3(m[0].xyz, m[1].xyz, m[2].xyz);
    }

    bool diskHit(vec3 a, vec3 b, out vec3 hitPos) {
      // Check crossing of z=0 plane between a and b
      if ((a.z > 0.01 && b.z > 0.01) || (a.z < -0.01 && b.z < -0.01)) return false;
      float dz = b.z - a.z;
      if (abs(dz) < 1e-6) return false;
      float t = -a.z / dz;
      if (t < 0.0 || t > 1.0) return false;
      vec3 ip = a + t * (b - a);
      float r = length(ip.xy);
      float r_in = 2.0, r_out = 12.0;
      if (r >= r_in && r <= r_out) {
        hitPos = ip;
        return true;
      }
      return false;
    }

    void main() {
      vec2 uv = (vUv * 2.0 - 1.0);
      uv.x *= u_resolution.x / u_resolution.y;

      vec4 ndir = vec4(uv.x, uv.y, -1.0, 0.0);
      mat3 invRot = mat3_from_mat4(u_invViewMatrix);
      vec3 rayDir = normalize(invRot * ndir.xyz);

      vec3 pos = u_cameraPos;
      vec3 dir = rayDir;

      float dt = 0.06;
      int steps = int(u_steps);

      vec3 prev = pos;
      bool captured = false;
      bool hit = false;
      vec3 hitPos = vec3(0.0);

      for (int i = 0; i < 1024; ++i) {
        if (i >= steps) break;
        float r = length(pos);
        float rs = (2.0 * u_G * u_M) / (u_C * u_C);
        if (r < rs) { captured = true; break; }
        vec3 acc = - (u_G * u_M) * (pos / (pow(r,3.0) + 1e-9));
        dir += acc * dt;
        dir = normalize(dir);
        prev = pos;
        pos += dir * dt;

        if (u_showDisk) {
          vec3 hp;
          if (diskHit(prev, pos, hp)) {
            hit = true;
            hitPos = hp;
            break;
          }
        }
      }

      vec3 color = vec3(0.0);
      if (captured) {
        color = vec3(0.0);
      } else if (hit) {
        float r = length(hitPos.xy);
        float t = smoothstep(2.0, 12.0, r);
        vec3 inner = vec3(1.0, 0.7, 0.3);
        vec3 outer = vec3(0.6, 0.1, 0.05);
        color = mix(inner, outer, t) * (1.0 + 0.8*exp(-r*0.4));
      } else {
        vec2 skyUV = normalize(pos).xy * 2.0 + vec2(12.34, 6.78);
        float s = star(skyUV * 8.0);
        color = mix(vec3(0.02,0.02,0.06), vec3(1.0), s) * (0.9 + 0.2*fract(sin(u_time*0.01)));
        float rfinal = length(pos);
        float glow = exp(-rfinal * 0.2) * 0.9;
        color += vec3(1.0,0.45,0.15) * glow * 0.5;
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
    depthWrite: false,
    depthTest: false
  });

  const quad = new THREE.Mesh(quadGeo, material);
  scene.add(quad);

  // small informational ring (optional)
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.6, 64), new THREE.MeshBasicMaterial({ color: 0xff4444, side: THREE.DoubleSide, transparent:true, opacity:0.9 }));
  ring.rotation.x = Math.PI/2;
  ring.visible = false;
  scene.add(ring);

  // Resize
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    material.uniforms.u_resolution.value.set(w, h);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize, { passive: true });
  onResize();

  // UI: wire events (safe because DOMContentLoaded)
  massSlider.addEventListener('input', (e) => {
    M = Number(e.target.value);
    massVal.textContent = M;
    material.uniforms.u_M.value = M;
  });
  cSlider.addEventListener('input', (e) => {
    C = Number(e.target.value);
    cVal.textContent = C;
    material.uniforms.u_C.value = C;
  });
  stepsSlider.addEventListener('input', (e) => {
    STEPS = Number(e.target.value);
    stepsVal.textContent = STEPS;
    material.uniforms.u_steps.value = STEPS;
  });
  toggleDiskBtn.addEventListener('click', () => {
    SHOW_DISK = !SHOW_DISK;
    material.uniforms.u_showDisk.value = SHOW_DISK;
    toggleDiskBtn.textContent = SHOW_DISK ? 'Hide Disk' : 'Show Disk';
  });
  resetCameraBtn.addEventListener('click', () => {
    camera.position.set(0,10,30);
    controls.target.set(0,0,0);
    controls.update();
  });

  // Animation
  let last = performance.now();
  function animate(now) {
    const t = now * 0.001;
    controls.update();
    // update uniforms
    material.uniforms.u_time.value = t;
    material.uniforms.u_G.value = G;
    material.uniforms.u_M.value = M;
    material.uniforms.u_C.value = C;
    material.uniforms.u_steps.value = STEPS;

    // provide inverse view matrix and camera pos for world-space ray building
    material.uniforms.u_invViewMatrix.value.copy(camera.matrixWorld);
    material.uniforms.u_cameraPos.value.copy(camera.position);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

}); // DOMContentLoaded
