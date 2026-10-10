<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { BoardDocument } from '../../../domain/project'
const props = defineProps<{ doc: BoardDocument; resetKey: number; focusKey: number }>()
const host = ref<HTMLDivElement>()
const error = ref('')
let renderer: THREE.WebGLRenderer | undefined
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let observer: ResizeObserver
let scene: THREE.Scene
let mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined
let frame = 0
let span=110
let floorZ=-.1
let grid:THREE.GridHelper|undefined
let modelCenter=new THREE.Vector3()
let modelDocument=''
function frameView(viewSpan:number,target=new THREE.Vector3()) {
  const vertical=THREE.MathUtils.degToRad(camera.fov)
  const horizontal=2*Math.atan(Math.tan(vertical/2)*camera.aspect)
  const distance=viewSpan/(2*Math.tan(Math.min(vertical,horizontal)/2))*1.5
  camera.position.copy(new THREE.Vector3(0.6,-0.9,0.85).normalize().multiplyScalar(distance).add(target))
  camera.near=Math.max(0.00001,props.doc.params.thickness/100);camera.far=Math.max(100,span*50);camera.updateProjectionMatrix()
  controls.minDistance=Math.max(.002,props.doc.params.thickness*.1);controls.maxDistance=span*20
  controls.target.copy(target);controls.update()
}
function reset() {frameView(span)}
function focusSelected() {
  const selected=new Set(props.doc.editing.selected)
  const points=props.doc.model.mesh?.objects?.filter(o=>selected.has(o.id) && !o.deleted).flatMap(o=>o.rings.flat()) ?? []
  if(!points.length){reset();return}
  const box=new THREE.Box3().setFromPoints(points.map(p=>new THREE.Vector3(p[0]!,p[1]!,props.doc.params.thickness/2)))
  const size=box.getSize(new THREE.Vector3())
  frameView(Math.max(size.x,size.y,props.doc.params.thickness)*1.5,box.getCenter(new THREE.Vector3()).sub(modelCenter))
}
function rebuild() {
  if (!scene) return
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose() }
  const p = props.doc.params
  if(!props.doc.demo) {
    const data=props.doc.model.mesh
    if(!data)return
    const indexed=new THREE.BufferGeometry()
    indexed.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));indexed.setIndex(data.indices)
    const geometry=indexed.toNonIndexed();indexed.dispose();geometry.computeVertexNormals();geometry.computeBoundingBox()
    const bounds=geometry.boundingBox!,center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3())
    geometry.translate(-center.x,-center.y,-center.z);span=Math.max(size.x,size.y,size.z);floorZ=-size.z/2
    mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xc9c9c9,metalness:0.35,roughness:0.45}))
    const shift=center.clone().sub(modelCenter)
    modelCenter=center
    scene.add(mesh);updateDisplay()
    if(props.focusKey)focusSelected()
    else if(modelDocument!==props.doc.id)reset()
    else {camera.position.sub(shift);controls.target.sub(shift);controls.update()}
    modelDocument=props.doc.id
    return
  }
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
  const material = new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 0.55, roughness: 0.38, side: THREE.DoubleSide })
  mesh = new THREE.Mesh(geometry, material); scene.add(mesh);span=2*size;floorZ=0;updateDisplay();reset()
}
onMounted(() => {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setClearColor(0x000000)
    host.value!.appendChild(renderer.domElement)
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000); camera.up.set(0,0,1)
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.minDistance = 25; controls.maxDistance = 500
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 3))
    const light = new THREE.DirectionalLight(0xffffff, 4); light.position.set(-80,-20,150); scene.add(light)
    grid = new THREE.GridHelper(1, 20, 0x343434, 0x202020); grid.rotation.x = Math.PI/2; scene.add(grid)
    reset(); rebuild()
    observer = new ResizeObserver(() => { const el = host.value; if (!el || !renderer) return; const w=el.clientWidth,h=el.clientHeight; if (!h) return; renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix(); if(props.focusKey)focusSelected();else reset() }); observer.observe(host.value!)
    const render = () => { controls.update(); renderer!.render(scene,camera); frame=requestAnimationFrame(render) }; render()
  } catch { error.value = '当前环境无法启动 3D 预览，请在支持 WebGL 的桌面环境中打开。' }
})
function updateDisplay() {
  if(grid){grid.visible=props.doc.params.grid;grid.scale.setScalar(span*3);grid.position.z=floorZ-0.01}
}
watch(() => [props.doc.id, props.doc.model.mesh, ...(props.doc.demo ? [props.doc.params.thickness,props.doc.params.margin,props.doc.params.compensation,props.doc.params.mirror] : [])], rebuild)
watch(() => props.doc.params.grid,updateDisplay)
watch(() => props.resetKey, () => { if (camera) reset() })
watch(() => props.focusKey, () => { if(camera){if(props.focusKey)focusSelected();else reset()} })
onBeforeUnmount(() => { cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose(); scene?.traverse(obj => { if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) { obj.geometry.dispose(); const materials = Array.isArray(obj.material) ? obj.material : [obj.material]; materials.forEach(m => m.dispose()) } }); renderer?.dispose() })
</script>
<template><div ref="host" class="model-scene"><div v-if="error" class="preview-empty"><p>{{ error }}</p></div></div></template>
