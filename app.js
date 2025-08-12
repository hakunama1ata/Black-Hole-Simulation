import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';

let scene, camera, renderer, blackHole, particles = [];
let G = 1.0;
let M = 1000.0;
let C = 15.0;
let particleCount = 10;

init();
animate();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.z = 200;

  renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Black Hole
  const geometry = new THREE.SphereGeometry(10, 32, 32);
  const material = new THREE.MeshBasicMaterial({color: 0x000000});
  blackHole = new THREE.Mesh(geometry, material);
  scene.add(blackHole);

  // Event Horizon Glow
  const ringGeometry = new THREE.RingGeometry(12, 14, 64);
  const ringMaterial = new THREE.MeshBasicMaterial({color: 0xff0000, side: THREE.DoubleSide});
  const eventHorizon = new THREE.Mesh(ringGeometry, ringMaterial);
  eventHorizon.rotation.x = Math.PI / 2;
  scene.add(eventHorizon);

  createParticles();

  // Controls
  document.getElementById("massSlider").oninput = (e) => { M = parseFloat(e.target.value); };
  document.getElementById("cSlider").oninput = (e) => { C = parseFloat(e.target.value); };
  document.getElementById("particleSlider").oninput = (e) => { particleCount = parseInt(e.target.value); createParticles(); };

  window.addEventListener('resize', onWindowResize, false);
}

function createParticles() {
  particles.forEach(p => scene.remove(p.mesh));
  particles = [];
  for (let i = 0; i < particleCount; i++) {
    const geo = new THREE.SphereGeometry(1, 8, 8);
    const mat = new THREE.MeshBasicMaterial({color: 0xffff00});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      THREE.MathUtils.randFloatSpread(300),
      THREE.MathUtils.randFloatSpread(300),
      0
    );
    scene.add(mesh);
    particles.push({mesh, velocity: new THREE.Vector3(Math.random()*2-1, Math.random()*2-1, 0)});
  }
}

function animate() {
  requestAnimationFrame(animate);

  particles.forEach(p => {
    let rVec = blackHole.position.clone().sub(p.mesh.position);
    let rMag = rVec.length();
    if (rMag > 0.1) {
      let forceMag = (G * M) / (rMag * rMag);
      let acceleration = rVec.normalize().multiplyScalar(forceMag);
      p.velocity.add(acceleration.multiplyScalar(0.1));
      if (p.velocity.length() > C) {
        p.velocity.setLength(C);
      }
      p.mesh.position.add(p.velocity);
    }
  });

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
