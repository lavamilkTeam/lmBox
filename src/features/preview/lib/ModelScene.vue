<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { BoardDocument } from '../../../domain/project'
const props = defineProps<{ doc: BoardDocument; resetKey: number }>()
const host = ref<HTMLDivElement>()
const error = ref('')
let renderer: THREE.WebGLRenderer | undefined
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let observer: ResizeObserver
let scene: THREE.Scene
let mesh: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial> | undefined
let frame = 0
function reset() { camera.position.set(105, -125, 125); controls.target.set(0, 0, 0); controls.update() }
function rebuild() {
  if (!scene) return
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose() }
  const p = props.doc.params
  const size = 50 + p.margin
  const shape = new THREE.Shape()
  shape.moveTo(-size, -size); shape.lineTo(size, -size); shape.lineTo(size, size); shape.lineTo(-size, size); shape.closePath()
  for (const pad of props.doc.apertures) {
    const x = (p.mirror ? 100 - pad.x - pad.width : pad.x) - 50 - p.compensation
    const y = pad.y - 50 - p.compensation
    const w = pad.width + 2 * p.compensation; const h = pad.height + 2 * p.compensation
    if (w <= 0 || h <= 0) continue
    const hole = new THREE.Path()
    if (pad.round) hole.absellipse(x+w/2, y+h/2, w/2, h/2, 0, Math.PI*2, true)
    else { hole.moveTo(x,y); hole.lineTo(x,y+h); hole.lineTo(x+w,y+h); hole.lineTo(x+w,y); hole.closePath() }
    shape.holes.push(hole)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: p.thickness, bevelEnabled: false, curveSegments: 16 })
  const material = new THREE.MeshStandardMaterial({ color: 0xbac9d9, metalness: 0.55, roughness: 0.38, side: THREE.DoubleSide })
  mesh = new THREE.Mesh(geometry, material); scene.add(mesh)
}
onMounted(() => {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setClearColor(0x000000)
    host.value!.appendChild(renderer.domElement)
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000); camera.up.set(0,0,1)
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.minDistance = 25; controls.maxDistance = 500
    scene.add(new THREE.HemisphereLight(0xe5efff, 0x394054, 3))
    const light = new THREE.DirectionalLight(0xffffff, 4); light.position.set(-80,-20,150); scene.add(light)
    const grid = new THREE.GridHelper(400, 40, 0xffffff, 0xffffff); grid.rotation.x = Math.PI/2; grid.position.z = -0.1; scene.add(grid)
    reset(); rebuild()
    observer = new ResizeObserver(() => { const el = host.value; if (!el || !renderer) return; const w=el.clientWidth,h=el.clientHeight; if (!h) return; renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix() }); observer.observe(host.value!)
    const render = () => { controls.update(); renderer!.render(scene,camera); frame=requestAnimationFrame(render) }; render()
  } catch { error.value = '当前环境无法启动 3D 预览，请在支持 WebGL 的桌面环境中打开。' }
})
watch(() => [props.doc.id, props.doc.params.thickness, props.doc.params.margin, props.doc.params.compensation, props.doc.params.mirror], rebuild)
watch(() => props.resetKey, () => { if (camera) reset() })
onBeforeUnmount(() => { cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose(); scene?.traverse(obj => { if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) { obj.geometry.dispose(); const materials = Array.isArray(obj.material) ? obj.material : [obj.material]; materials.forEach(m => m.dispose()) } }); renderer?.dispose() })
</script>
<template><div ref="host" class="model-scene"><div v-if="error" class="preview-empty"><p>{{ error }}</p></div></div></template>
