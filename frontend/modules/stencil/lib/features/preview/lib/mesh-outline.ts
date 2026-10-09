import type { PreviewMesh } from '../../../../../../contracts'

// Display the boundary of the existing mesh's top faces. Do not calculate a
// second taper from UI settings: the native model is the geometry source.
export function topFacePath(mesh: PreviewMesh): string {
  const top = mesh.summary.bounds[1]?.[2]
  if (top === undefined) return ''
  const { positions, indices } = mesh
  const edges = new Map<string, { a: number; b: number; count: number }>()
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3)
    if (!triangle.every(v => Math.abs(positions[v * 3 + 2]! - top) <= 1e-9)) continue
    for (let j = 0; j < 3; j++) {
      const a = triangle[j]!, b = triangle[(j + 1) % 3]!
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      const edge = edges.get(key)
      if (edge) edge.count++
      else edges.set(key, { a, b, count: 1 })
    }
  }
  return [...edges.values()].filter(edge => edge.count === 1).map(({ a, b }) =>
    `M ${positions[a * 3]} ${positions[a * 3 + 1]} L ${positions[b * 3]} ${positions[b * 3 + 1]}`,
  ).join(' ')
}
