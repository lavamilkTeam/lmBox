import { invoke } from '@tauri-apps/api/core'
import { isNativeDesktop } from './native'

export async function installedModules(): Promise<string[] | null> {
  if (!isNativeDesktop()) return null
  const status = await invoke<{ modular: boolean; installed: string[] }>('module_status')
  return status.modular ? status.installed : null
}
