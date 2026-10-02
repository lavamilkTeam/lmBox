import init, { import_board } from './generated/lmbox.js'
import wasmUrl from './generated/lmbox_bg.wasm?url'
import type { ImportResult } from '../../../contracts'

// One worker belongs to one import. Terminating it cancels the actual parser
// and releases WASM memory, including all temporary source buffers.
const ready=init({module_or_path:wasmUrl})
self.onmessage=async (event:MessageEvent<{id:string; name:string; bytes:ArrayBuffer}>)=>{
  const {id,name,bytes}=event.data
  try {
    await ready
    const result:ImportResult=JSON.parse(import_board(name,new Uint8Array(bytes)))
    if(result.protocolVersion!=='1') throw new Error('不支持该导入结果版本。')
    self.postMessage({id,result})
  } catch(error) {
    self.postMessage({id,error:typeof error==='string'?error:error instanceof Error?error.message:'文件解析失败。'})
  }
}
