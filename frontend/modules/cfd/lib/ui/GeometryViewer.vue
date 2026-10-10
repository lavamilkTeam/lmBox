<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { UiGeometry } from './types'
const props = defineProps<{ geometry: UiGeometry[]; selection: {objectId:string;subelements:string[]}[]; fitVersion?: number; viewportSize: {width:number;height:number}; pixelRatio: number }>()
const emit = defineEmits<{ select: [objectId:string,subelements:string[],append:boolean]; error:[message:string] }>()
const host = ref<HTMLElement>()
let renderer: THREE.WebGLRenderer | undefined
let controls: OrbitControls | undefined
let frame = 0
let lastObjects = ''
let size = 1
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(40,1,.001,1e8)
const group = new THREE.Group()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const cursor = {x:0,y:0}
const materials = [new THREE.MeshStandardMaterial({color:0x9faab6,roughness:.76,metalness:.08,side:THREE.DoubleSide}),new THREE.MeshStandardMaterial({color:0xd9b04a,roughness:.7,side:THREE.DoubleSide})]
function selected(objectId: string, face: string) {
  const pick = props.selection.find(s => s.objectId === objectId)
  if (!pick) return false
  if (!pick.subelements.length) return true
  if (pick.subelements.includes(face)) return true
  return props.geometry.find(g => g.objectId === objectId)?.solids?.some(s => pick.subelements.includes(s.id) && s.faces.includes(face)) ?? false
}
function clearGeometry() {
  for (const object of [...group.children]) {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      object.geometry.dispose()
      if (!(object instanceof THREE.Mesh)) { const values = Array.isArray(object.material) ? object.material : [object.material]; values.forEach(m => m.dispose()) }
    }
    group.remove(object)
  }
}
function rebuild() {
  clearGeometry()
  for (const item of props.geometry) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(item.vertices,3)); geometry.setIndex(item.triangles); geometry.computeVertexNormals()
    if (item.faces.length) for (const face of item.faces) geometry.addGroup(face.firstTriangle*3,face.triangleCount*3,selected(item.objectId,face.id)?1:0)
    else geometry.addGroup(0,item.triangles.length,selected(item.objectId,'')?1:0)
    const mesh = new THREE.Mesh(geometry,materials); mesh.userData = {objectId:item.objectId,faces:item.faces}; group.add(mesh)
    for (const edge of item.edges ?? []) {
      const lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(edge.vertices,3))
      const line = new THREE.Line(lineGeometry,new THREE.LineBasicMaterial({color:selected(item.objectId,edge.id)?0xe6bb46:0x525e6d}))
      line.userData = {objectId:item.objectId,subelement:edge.id}; group.add(line)
    }
    for (const point of item.points ?? []) {
      const pointGeometry = new THREE.BufferGeometry(); pointGeometry.setAttribute('position',new THREE.Float32BufferAttribute(point.position,3))
      const active=selected(item.objectId,point.id)
      const dots = new THREE.Points(pointGeometry,new THREE.PointsMaterial({size:6,sizeAttenuation:false,color:0xe6bb46,transparent:true,opacity:active?1:0}))
      dots.userData = {objectId:item.objectId,subelement:point.id}; group.add(dots)
    }
  }
  const ids=props.geometry.map(g=>g.objectId).join('|')
  if (ids !== lastObjects || lastObjects === '') { fit(); lastObjects=ids }
}
function fit() {
  const box=new THREE.Box3().setFromObject(group)
  if(box.isEmpty())return
  const center=box.getCenter(new THREE.Vector3());size=Math.max(box.getSize(new THREE.Vector3()).length(),.001)
  camera.near=Math.max(size/1e5,.00001);camera.far=size*100;camera.updateProjectionMatrix()
  camera.position.copy(center).add(new THREE.Vector3(1,-1,0.8).normalize().multiplyScalar(size*1.6));camera.up.set(0,0,1)
  controls?.target.copy(center);controls?.update()
}
function resize() { if(!renderer)return;const {width:w,height:h}=props.viewportSize;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix() }
function pick(event: MouseEvent, wholeObject=false) {
  if(Math.hypot(event.clientX-cursor.x,event.clientY-cursor.y)>5 || !host.value)return
  const bounds=host.value.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2)
  raycaster.setFromCamera(pointer,camera)
  const tolerance=camera.position.distanceTo(controls?.target ?? new THREE.Vector3())*3/Math.max(bounds.height,1)
  raycaster.params.Line!.threshold=tolerance;raycaster.params.Points!.threshold=tolerance
  const hits=raycaster.intersectObjects(group.children,false)
  const front=hits[0]
  if(!front) {emit('select','',[],false);return}
  const detail=hits.find(hit=>hit.object.userData.subelement && Math.abs(hit.distance-front.distance)<size*.01) ?? front
  const data=detail.object.userData
  const subelement=data.subelement as string|undefined ?? (data.faces as UiGeometry['faces']|undefined)?.find(f=>detail.faceIndex !== undefined && detail.faceIndex !== null && detail.faceIndex>=f.firstTriangle && detail.faceIndex<f.firstTriangle+f.triangleCount)?.id
  emit('select',String(data.objectId),subelement&&!wholeObject?[subelement]:[],event.ctrlKey||event.metaKey||event.shiftKey)
}
onMounted(()=>{
  if(!host.value)return
  try {
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(props.pixelRatio);renderer.setClearColor(0x17191d,1);host.value.appendChild(renderer.domElement)
    scene.add(group,new THREE.HemisphereLight(0xffffff,0x586073,2))
    const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(1,-1,2);scene.add(light)
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true
    resize();rebuild()
    const animate=()=>{frame=requestAnimationFrame(animate);controls?.update();renderer?.render(scene,camera)};animate()
  } catch(error) {emit('error',`三维视图不可用：${error instanceof Error?error.message:String(error)}`)}
})
watch(()=>props.geometry,rebuild)
watch(()=>props.selection,rebuild)
watch(()=>props.fitVersion,fit)
watch(()=>props.viewportSize,resize)
watch(()=>props.pixelRatio,value=>renderer?.setPixelRatio(value))
onBeforeUnmount(()=>{cancelAnimationFrame(frame);controls?.dispose();clearGeometry();materials.forEach(m=>m.dispose());renderer?.dispose();renderer?.domElement.remove()})
</script>
<template><div ref="host" class="cfd-geometry" role="img" aria-label="流体工程三维几何" @pointerdown="cursor.x=$event.clientX;cursor.y=$event.clientY" @click="pick($event)" @dblclick="pick($event,true)"/></template>
