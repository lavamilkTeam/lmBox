/** Read a user-selected circuit document; format validation belongs to circuit editing. */
export async function readLogicCircuitFile(file: File): Promise<unknown> {
  if (file.size > 1024 * 1024) throw new Error('电路文件不能超过 1 MiB')
  return JSON.parse(await file.text()) as unknown
}
