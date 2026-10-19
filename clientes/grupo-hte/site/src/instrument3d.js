// Transmissor de pressão em 3D (seção de calibração e manutenção).
// Gerado em public/assets/js/instrument3d.js com: npm run build:3d
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const HOT = 0xee343a;
const COLD = 0x0e59e8;

function displayTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#cfdcd2";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#16241c";
  ctx.textAlign = "center";
  ctx.font = "500 44px 'Plex Mono', monospace";
  ctx.fillText("PT-101", size / 2, 150);
  ctx.font = "700 128px 'Archivo', sans-serif";
  ctx.fillText("6.32", size / 2 - 38, 296);
  ctx.font = "500 46px 'Plex Mono', monospace";
  ctx.fillText("bar", size / 2 + 142, 296);
  // barra de 0 a 100 %
  ctx.strokeStyle = "#16241c";
  ctx.lineWidth = 4;
  ctx.strokeRect(126, 350, 260, 34);
  ctx.fillRect(132, 356, 160, 22);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function buildTransmitter() {
  const steel = new MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.26 });
  const steelSatin = new MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.4 });
  const coat = new MeshPhysicalMaterial({ color: 0x2f4f86, metalness: 0.3, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const glass = new MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1 });
  const rubber = new MeshStandardMaterial({ color: 0x1a1f29, metalness: 0.1, roughness: 0.7 });

  const g = new Group();
  const add = (geometry, material, position, rotation) => {
    const mesh = new Mesh(geometry, material);
    if (position) mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    g.add(mesh);
    return mesh;
  };
  const sideways = [Math.PI / 2, 0, 0];
  const across = [0, 0, Math.PI / 2];

  // Conexão ao processo: rosca + porca sextavada
  add(new CylinderGeometry(0.55, 0.55, 1.05, 40), steelSatin, [0, -4.1, 0]);
  for (let i = 0; i < 7; i++) {
    add(new TorusGeometry(0.56, 0.045, 8, 40), steelSatin, [0, -4.52 + i * 0.14, 0], [Math.PI / 2, 0, 0]);
  }
  add(new CylinderGeometry(1.02, 1.02, 0.72, 6), steel, [0, -3.22, 0]);

  // Corpo do sensor
  add(new CylinderGeometry(0.86, 0.9, 2.5, 64), steel, [0, -1.62, 0]);
  add(new TorusGeometry(0.87, 0.05, 10, 64), steelSatin, [0, -0.4, 0], [Math.PI / 2, 0, 0]);
  add(new CylinderGeometry(0.62, 0.7, 0.85, 48), steelSatin, [0, 0.02, 0]);

  // Invólucro com tampa frontal (display) e traseira
  add(new CylinderGeometry(1.85, 1.85, 2.7, 72), coat, [0, 2.25, 0], sideways);
  add(new CylinderGeometry(0.9, 1.05, 0.5, 48), coat, [0, 0.55, 0]);
  add(new CylinderGeometry(1.98, 1.98, 0.42, 72), coat, [0, 2.25, 1.52], sideways);
  add(new CylinderGeometry(1.98, 1.98, 0.42, 72), coat, [0, 2.25, -1.52], sideways);
  for (const z of [1.3, -1.3]) add(new TorusGeometry(1.9, 0.05, 10, 72), steelSatin, [0, 2.25, z]);

  const display = add(new CircleGeometry(1.3, 64), new MeshBasicMaterial({ map: displayTexture() }), [0, 2.25, 1.735]);
  display.material.toneMapped = false;
  add(new TorusGeometry(1.36, 0.09, 12, 72), steel, [0, 2.25, 1.75]);
  add(new CircleGeometry(1.36, 64), glass, [0, 2.25, 1.77]);

  // Prensa-cabos dos dois lados
  for (const side of [1, -1]) {
    add(new CylinderGeometry(0.42, 0.42, 0.3, 6), steelSatin, [side * 1.95, 1.75, 0], across);
    add(new CylinderGeometry(0.32, 0.36, 0.42, 32), side > 0 ? steelSatin : rubber, [side * 2.28, 1.75, 0], across);
  }

  g.position.y = 0.2;
  return g;
}

export function mount(stage) {
  const canvas = stage.querySelector("canvas");
  const labels = [...stage.querySelectorAll("[data-anchor]")].map((el) => ({
    el,
    point: new Vector3(...el.dataset.anchor.split(",").map(Number)),
    normal: el.dataset.normal ? new Vector3(...el.dataset.normal.split(",").map(Number)) : null,
  }));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
  } catch {
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const key = new DirectionalLight(0xffffff, 1.4);
  key.position.set(5, 8, 7);
  const hot = new DirectionalLight(new Color(HOT), 3.2);
  hot.position.set(-7, 2, -3);
  const cold = new DirectionalLight(new Color(COLD), 3.6);
  cold.position.set(7, 1, -4);
  scene.add(key, hot, cold);

  const camera = new PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(9.6, 4.6, 19.2);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, -0.15, 0);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.68;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 1.4;
  controls.update();
  // No toque, arrastar na vertical continua rolando a página; na horizontal, gira o modelo
  canvas.style.touchAction = "pan-y";

  const resize = () => {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 480 ? 34 : width / height < 0.8 ? 32 : 27;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  const view = new Vector3();
  const projected = new Vector3();
  const placeLabels = () => {
    const { width, height } = stage.getBoundingClientRect();
    camera.getWorldDirection(view);
    for (const label of labels) {
      projected.copy(label.point).project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      label.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const facing = label.normal ? label.normal.dot(view) < -0.15 : true;
      label.el.classList.toggle("is-hidden", !facing);
    }
  };

  let visible = true;
  let frame = 0;
  const loop = () => {
    frame = 0;
    if (!visible || document.hidden) return;
    controls.update();
    renderer.render(scene, camera);
    placeLabels();
    frame = requestAnimationFrame(loop);
  };
  const start = () => {
    if (!frame) frame = requestAnimationFrame(loop);
  };

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  }).observe(stage);
  document.addEventListener("visibilitychange", start);
  controls.addEventListener("start", () => stage.classList.add("is-touched"));

  // Espera as fontes para o display sair com a tipografia do site
  document.fonts.ready.then(() => {
    scene.add(buildTransmitter());
    renderer.render(scene, camera);
    placeLabels();
    stage.classList.add("is-ready");
    start();
  });
  return true;
}
