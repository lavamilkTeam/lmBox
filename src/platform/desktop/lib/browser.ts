import { unzipSync } from 'fflate'
import type { BoardDocument, LayerFile } from '../../../domain/project'
import type { GraphicsIr } from '../../../contracts'
import demoGraphics from './demo-ir.json'

function role(name: string): LayerFile['role'] {
  if (/\.gtp$|top.?paste|f[._-]paste/i.test(name)) return 'top-paste'
  if (/\.gbp$|bottom.?paste|b[._-]paste/i.test(name)) return 'bottom-paste'
  if (/\.gko$|\.gm1$|outline|edge[._-]cuts/i.test(name)) return 'outline'
  return 'other'
}
// Browser development adapter. Replace this entry point with Tauri commands for desktop delivery.
// This adapter only inventories files; it never claims to parse manufacturing geometry.
export async function inspectFiles(files: File[]): Promise<{ name: string; layers: LayerFile[] }[]> {
  const results: { name: string; layers: LayerFile[] }[] = []
  const singles: LayerFile[] = []
  for (const file of files) {
    if (file.size > 30 * 1024 * 1024) throw new Error(`${file.name} 超过 30 MB，请使用较小的 Gerber 文件。`)
    if (/\.zip$/i.test(file.name)) {
      const layers: LayerFile[] = []
      let expanded = 0
      unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => {
        if (entry.name.endsWith('/') || entry.name.startsWith('__MACOSX/')) return false
        expanded += entry.originalSize
        if (expanded > 150 * 1024 * 1024 || layers.length >= 500) throw new Error('压缩包超出文件数量或解压大小限制。')
        layers.push({ name: entry.name, size: entry.originalSize, role: role(entry.name) })
        return false // Read directory metadata only; do not decompress untrusted payloads.
      } })
      if (!layers.length) throw new Error(`${file.name} 是空的压缩包。`)
      results.push({ name: file.name, layers })
    } else if (/\.(gtp|gbp|gko|gm1|gbr|ger|dxf|drl)$/i.test(file.name)) {
      singles.push({ name: file.name, role: role(file.name), size: file.size })
    } else throw new Error(`不支持 ${file.name}，请选择 Gerber ZIP、图层文件或 DXF。`)
  }
  if (singles.length) results.push({ name: singles.length === 1 ? singles[0]!.name : `${singles[0]!.name} 等 ${singles.length} 个图层`, layers: singles })
  return results
}
export function saveParameters(doc: BoardDocument) {
  const data = { version: 1, source: doc.name, demo: doc.demo, parameters: doc.params }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = `${doc.name.replace(/\.zip$/i, '')}.parameters.json`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Loads the sample graphics IR produced by the Rust parser for demo.gbr. This
// exercises the 2D renderer against real parser output. When the Rust/WASM or
// Tauri bridge lands, `parseGerber(source)` replaces this demo data source
// while keeping the same `GraphicsIr` contract.
export function loadDemoGraphics(): GraphicsIr {
  return demoGraphics as GraphicsIr
}
