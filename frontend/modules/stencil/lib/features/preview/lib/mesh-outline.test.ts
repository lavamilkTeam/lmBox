// Private rendering regression: boundary edges must exclude top triangulation
// diagonals and all bottom/side faces. This does not generate manufacturing data.
import { expect, it } from 'vitest'
import { topFacePath } from './mesh-outline'

it('draws only top-surface boundary edges from native triangles',()=>{
  const path=topFacePath({
    positions:[0,0,.2, 2,0,.2, 2,1,.2, 0,1,.2, 0,0,0, 2,0,0, 2,1,0, 0,1,0],
    indices:[0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1],
    contours:[],
    summary:{bounds:[[0,0,0],[2,1,.2]],volume:.4,holeCount:0,triangleCount:6,tolerance:.01,unit:'mm'},
  })
  expect(path.split('M ').filter(Boolean)).toHaveLength(4)
  expect(path).toContain('M 0 0 L 2 0')
  expect(path).toContain('M 2 1 L 0 1')
  expect(path).not.toContain('M 0 0 L 2 1')
  expect(path).not.toContain('M 2 1 L 0 0')
})
