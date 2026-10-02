import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
const paste=readFileSync('src-tauri/tests/fixtures/basic.gbr')
const outline=strToU8('%FSLAX34Y34*%\n%MOMM*%\n%ADD10C,0.1*%\nD10*\nX0Y0D02*\nX100000Y0D01*\nX100000Y100000D01*\nX0Y100000D01*\nX0Y0D01*\nM02*')
async function ready(page:import('@playwright/test').Page) {await expect(page.getByRole('button',{name:'STL',exact:true})).toBeEnabled({timeout:20000})}
async function open(page:import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByLabel('选择 Gerber 文件').setInputFiles({name:'editor.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'TopPaste.GTP':paste,'Board.GKO':outline}))})
  await ready(page)
}

test('single selection, additive marquee, edits, delete, undo and restore use real contours',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await open(page)
  const first=page.locator('[data-object-id="0:0:0"]'),second=page.locator('[data-object-id="0:0:1"]')
  await first.click()
  await expect(first).toHaveAttribute('data-selected','true')
  await expect(page.locator('.selection-count')).toHaveText('1 个图形')
  const before=await first.boundingBox()
  await page.getByLabel('X 偏移',{exact:true}).fill('0.25')
  await page.getByLabel('X 偏移',{exact:true}).press('Tab')
  await page.getByRole('button',{name:'应用变换'}).click();await ready(page)
  expect((await first.boundingBox())!.x).toBeGreaterThan(before!.x)
  await page.getByRole('button',{name:'放大',exact:true}).click()
  const b=(await second.boundingBox())!
  await page.keyboard.down('Shift');await page.mouse.move(b.x-2,b.y-2);await page.mouse.down();await page.mouse.move(b.x+b.width+2,b.y+b.height+2,{steps:5});await page.mouse.up();await page.keyboard.up('Shift')
  await expect(page.locator('.selection-count')).toHaveText('2 个图形')
  await page.getByRole('button',{name:'删除所选'}).click();await ready(page)
  await expect(page.locator('[data-object-id]')).toHaveCount(1)
  await page.getByRole('button',{name:'撤销编辑'}).click();await ready(page)
  await expect(page.locator('[data-object-id]')).toHaveCount(3)
  await page.getByRole('button',{name:'重做编辑'}).click();await ready(page)
  await page.getByRole('switch',{name:'显示已删除图形'}).click()
  await expect(page.locator('.deleted-object')).toHaveCount(2)
  await page.getByRole('button',{name:'恢复原图'}).click();await ready(page)
  await expect(page.locator('.deleted-object')).toHaveCount(0)
  await expect(page.locator('[data-object-id]')).toHaveCount(3)
  expect(errors).toEqual([])
  await page.screenshot({path:test.info().outputPath('selection-editor.png')})
})

test('selected printing optimization and native STL SVG DXF exports match current geometry',async({page})=>{
  await open(page)
  await page.locator('[data-object-id="0:0:2"]').click()
  await page.getByRole('tab',{name:'打印优化',exact:true}).click()
  await expect(page.getByLabel('优化范围',{exact:true})).toContainText('当前选中（1）')
  await page.getByRole('switch',{name:'大孔开网格'}).click()
  await page.getByLabel('网格开孔上限',{exact:true}).fill('0.5');await page.getByLabel('网格开孔上限',{exact:true}).press('Tab')
  await page.getByRole('button',{name:'优化所选图形'}).click();await ready(page)
  await expect(page.locator('.board-info')).toContainText('6')
  await page.getByLabel('喇叭口比例',{exact:true}).fill('110');await page.getByLabel('喇叭口比例',{exact:true}).press('Tab')
  await page.getByRole('button',{name:'优化所选图形'}).click();await ready(page)
  await page.getByRole('button',{name:'查看 3D',exact:true}).click()
  await expect(page.locator('.model-scene canvas')).toBeVisible()
  for(const format of ['STL','SVG','DXF']) {
    const downloading=page.waitForEvent('download')
    await page.getByRole('button',{name:format,exact:true}).click()
    const file=await downloading
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${format.toLowerCase()}$`))
    const stream=await file.createReadStream();const chunks:Buffer[]=[]
    for await(const chunk of stream!)chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks).toString()).toContain(format==='STL'?'facet normal':format==='SVG'?'viewBox':'LWPOLYLINE')
    await ready(page)
  }
  await page.screenshot({path:test.info().outputPath('optimized-3d.png')})
})

test('right editor generates a real recessed base with removal slot',async({page})=>{
  await open(page)
  await page.getByRole('tab',{name:'外框与底板',exact:true}).click()
  await page.getByLabel('生成对象',{exact:true}).click()
  await page.getByText('PCB 定位底板',{exact:true}).click();await ready(page)
  await page.getByLabel('卸板槽宽',{exact:true}).fill('3');await page.getByLabel('卸板槽宽',{exact:true}).press('Tab');await ready(page)
  await page.getByLabel('取件斜口',{exact:true}).fill('0.4');await page.getByLabel('取件斜口',{exact:true}).press('Tab');await ready(page)
  await page.getByRole('button',{name:'查看 3D',exact:true}).click()
  await expect(page.locator('.model-scene canvas')).toBeVisible()
  await expect(page.locator('.viewport-top-info')).toContainText('定位底板')
  await page.screenshot({path:test.info().outputPath('base-3d.png')})
})

async function geometryBox(locator:import('@playwright/test').Locator) {
  return locator.evaluate(element=>{
    const {x,y,width,height}=(element as SVGGraphicsElement).getBBox()
    return {x,y,width,height}
  })
}

test('selected taper stays pending across compensation changes and appears in 2D',async({page})=>{
  await open(page)
  const target=page.locator('[data-object-id="0:0:2"] path')
  const other=page.locator('[data-object-id="0:0:0"] path')
  const otherBefore=await geometryBox(other)
  const bottomBefore=await geometryBox(target)
  await target.click()
  await page.getByRole('tab',{name:'打印优化',exact:true}).click()
  await expect(page.getByLabel('优化范围',{exact:true})).toContainText('当前选中（1）')
  await page.getByLabel('喇叭口比例',{exact:true}).fill('120')
  await page.getByLabel('喇叭口比例',{exact:true}).press('Tab')
  await page.getByLabel('整层开孔补偿',{exact:true}).fill('0.01')
  await page.getByLabel('整层开孔补偿',{exact:true}).press('Tab');await ready(page)
  await expect(page.getByLabel('喇叭口比例',{exact:true})).toHaveValue('120')
  await page.getByLabel('整层开孔补偿',{exact:true}).fill('0')
  await page.getByLabel('整层开孔补偿',{exact:true}).press('Tab');await ready(page)
  const request=page.waitForRequest(r=>r.url().endsWith('/api/preview') && r.method()==='POST')
  await page.getByRole('button',{name:'优化所选图形'}).click()
  const input=(await request).postDataJSON()
  expect(input.settings.design.optimization.taper).toBe(100)
  expect(input.edits).toHaveLength(1)
  expect(input.edits[0]).toMatchObject({id:'0:0:2',optimization:{taper:120}})
  await ready(page)
  expect(await geometryBox(target)).toEqual(bottomBefore)
  expect(await geometryBox(other)).toEqual(otherBefore)
  const upper=page.locator('.top-mouth-outline')
  await expect(upper).toBeVisible()
  expect((await upper.getAttribute('d'))!.length).toBeGreaterThan(50)
  await page.getByLabel('显示上口轮廓',{exact:true}).uncheck()
  await expect(upper).toHaveCount(0)
  await page.getByLabel('显示上口轮廓',{exact:true}).check()
  await expect(upper).toBeVisible()
  await page.screenshot({path:test.info().outputPath('taper-mouths-2d.png')})
  // Explicit whole-layer choice remains available despite the selection.
  await page.getByLabel('优化范围',{exact:true}).click()
  await page.getByText('整层默认参数',{exact:true}).click()
  await expect(page.getByRole('button',{name:'应用整层优化'})).toBeEnabled()
  await expect(page.getByLabel('喇叭口比例',{exact:true})).toHaveValue('100')
})

test('inverse taper shrinks only the selected contact opening and focuses its real walls',async({page})=>{
  await open(page)
  const target=page.locator('[data-object-id="0:0:2"] path')
  const other=page.locator('[data-object-id="0:0:0"] path')
  const before=(await geometryBox(target))!,otherBefore=await geometryBox(other)
  await target.click()
  await page.getByRole('tab',{name:'打印优化',exact:true}).click()
  await page.getByLabel('喇叭口比例',{exact:true}).fill('120')
  await page.getByLabel('喇叭口比例',{exact:true}).press('Tab')
  await page.getByRole('switch',{name:'反比缩放',exact:true}).click()
  const request=page.waitForRequest(r=>r.url().endsWith('/api/preview') && r.method()==='POST')
  await page.getByRole('button',{name:'优化所选图形'}).click()
  expect((await request).postDataJSON().edits[0].optimization).toMatchObject({taper:120,inverseTaper:true})
  await ready(page)
  const after=(await geometryBox(target))!
  expect(after.width/before.width).toBeCloseTo(.8,3)
  expect(after.height/before.height).toBeCloseTo(.8,3)
  expect(await geometryBox(other)).toEqual(otherBefore)
  await expect(page.getByText(/上口 120%，贴板下口 80%/)).toBeVisible()
  await page.getByRole('button',{name:'查看所选孔壁',exact:true}).click()
  await expect(page.locator('.model-scene canvas')).toBeVisible()
  await page.getByLabel('喇叭口比例',{exact:true}).scrollIntoViewIfNeeded()
  await page.screenshot({path:test.info().outputPath('inverse-taper-walls.png')})
  await page.getByRole('button',{name:'2D 图层',exact:true}).click()
  await page.getByRole('switch',{name:'反比缩放',exact:true}).click()
  await page.getByRole('button',{name:'优化所选图形'}).click();await ready(page)
  expect(await geometryBox(target)).toEqual(before)
  await expect(page.locator('.top-mouth-outline')).toBeVisible()
  await expect(page.getByText(/上口 120%，贴板下口 100%/)).toBeVisible()
})

test('three XY modes change selected real geometry and remain independent of thickness taper',async({page})=>{
  await open(page)
  const target=page.locator('[data-object-id="0:0:2"] path')
  const other=page.locator('[data-object-id="0:0:0"] path')
  const before=await geometryBox(target),otherBefore=await geometryBox(other)
  await target.click()
  await page.getByRole('tab',{name:'打印优化',exact:true}).click()
  const mode=page.getByLabel('XY 缩放方式',{exact:true})
  const apply=page.getByRole('button',{name:'优化所选图形'})
  for(const [label,value,width,height] of [
    ['仅上半部变化','upper',1,1.1],
    ['整个焊盘缩放','whole',.8,1.2],
    ['上下半部反向变化','opposed',1.2,1],
  ] as const) {
    await mode.click();await page.getByText(label,{exact:true}).click()
    await expect(page.getByLabel('XY 横向比例',{exact:true})).toHaveValue('80')
    await expect(page.getByLabel('XY 纵向比例',{exact:true})).toHaveValue('120')
    const request=page.waitForRequest(r=>r.url().endsWith('/api/preview') && r.method()==='POST')
    await apply.click()
    expect((await request).postDataJSON().edits[0].optimization).toMatchObject({xyMode:value,xyScaleX:80,xyScaleY:120,taper:100})
    await ready(page)
    const after=await geometryBox(target)
    expect(after.width/before.width).toBeCloseTo(width,5)
    expect(after.height/before.height).toBeCloseTo(height,5)
    expect(await geometryBox(other)).toEqual(otherBefore)
    if(value==='opposed') {
      for(let i=0;i<3;i++)await page.getByRole('button',{name:'放大',exact:true}).click()
      await mode.scrollIntoViewIfNeeded()
      await page.screenshot({path:test.info().outputPath('xy-opposed-2d.png')})
    }
  }
  // Custom ratios are stored independently; drafts do not mutate the applied geometry.
  const opposed=await geometryBox(target)
  await page.getByLabel('XY 横向比例',{exact:true}).fill('70')
  await page.getByLabel('XY 横向比例',{exact:true}).press('Tab')
  expect(await geometryBox(target)).toEqual(opposed)
  await apply.click();await ready(page)
  expect((await geometryBox(target)).width/before.width).toBeCloseTo(1.3,5)
  await page.getByRole('button',{name:'撤销编辑'}).click();await ready(page)
  expect(await geometryBox(target)).toEqual(opposed)
  await expect(page.getByLabel('XY 横向比例',{exact:true})).toHaveValue('80')
  await page.getByLabel('喇叭口比例',{exact:true}).fill('120')
  await page.getByLabel('喇叭口比例',{exact:true}).press('Tab')
  await page.getByRole('switch',{name:'反比缩放',exact:true}).click()
  await apply.click();await ready(page)
  expect((await geometryBox(target)).width/before.width).toBeCloseTo(1.2*.8,5)
  await expect(page.locator('.top-mouth-outline')).toBeVisible()
  await page.getByRole('button',{name:'查看所选孔壁',exact:true}).click()
  await expect(page.locator('.model-scene canvas')).toBeVisible()
  await mode.scrollIntoViewIfNeeded()
  await page.screenshot({path:test.info().outputPath('xy-and-thickness-3d.png')})
  await page.getByRole('button',{name:'2D 图层',exact:true}).click()
  await mode.click();await page.getByText('关闭',{exact:true}).click()
  await apply.click();await ready(page)
  expect((await geometryBox(target)).width/before.width).toBeCloseTo(.8,5)
  await page.getByRole('switch',{name:'反比缩放',exact:true}).click()
  await page.getByLabel('喇叭口比例',{exact:true}).fill('100')
  await page.getByLabel('喇叭口比例',{exact:true}).press('Tab')
  await apply.click();await ready(page)
  expect(await geometryBox(target)).toEqual(before)
})

test('rounded pads have continuously sloping sides instead of a centre shoulder',async({page})=>{
  await page.goto('/')
  const pads='%FSLAX34Y34*%\n%MOMM*%\n%ADD10O,1X3*%\nD10*\n'+
    Array.from({length:7},(_,i)=>`X${i*18000}Y0D03*`).join('\n')+'\nM02*'
  await page.getByLabel('选择 Gerber 文件').setInputFiles({name:'rounded-pads.GTP',mimeType:'text/plain',buffer:Buffer.from(pads)})
  await ready(page)
  await page.getByRole('button',{name:'全选',exact:true}).click()
  await page.getByRole('tab',{name:'打印优化',exact:true}).click()
  await page.getByLabel('XY 缩放方式',{exact:true}).click()
  await page.getByText('上下半部反向变化',{exact:true}).click()
  const response=page.waitForResponse(r=>r.url().endsWith('/api/preview') && r.request().method()==='POST')
  await page.getByRole('button',{name:'优化所选图形'}).click()
  const result=await (await response).json();await ready(page)
  const ring=result.mesh.objects[0].rings[0] as number[][]
  // Intersections with the two long sides, measured in native millimetres.
  function widthAt(y:number) {
    const xs:number[]=[]
    for(let i=1;i<ring.length;i++) {
      const a=ring[i-1]!,b=ring[i]!
      if((a[1]!<y && b[1]!>y)||(a[1]!>y && b[1]!<y)) {
        xs.push(a[0]!+(b[0]!-a[0]!)*(y-a[1]!)/(b[1]!-a[1]!))
      }
    }
    expect(xs).toHaveLength(2)
    return Math.max(...xs)-Math.min(...xs)
  }
  for(const y of [-.6,-.01,.01,.6,1])expect(widthAt(y)).toBeCloseTo(1.04-.4*y/3,6)
  const first=page.locator('[data-object-id="0:0:3"] path')
  const centre=(await first.boundingBox())!
  for(let i=0;i<6;i++)await page.getByRole('button',{name:'放大',exact:true}).click()
  await expect.poll(async()=> (await first.boundingBox())!.height).toBeGreaterThan(centre.height*1.5)
  await page.getByLabel('XY 缩放方式',{exact:true}).scrollIntoViewIfNeeded()
  await page.screenshot({path:test.info().outputPath('continuous-xy-taper.png')})
})
