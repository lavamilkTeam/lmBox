import { test, expect } from '@playwright/test'
import { zipSync, strToU8 } from 'fflate'

test('views switch with matching settings and an interactive 3D model', async ({ page }) => {
  const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('.panel-heading')).toContainText('2D 图层参数')
  await page.getByRole('button',{name:'3D 模型',exact:true}).click()
  await expect(page.locator('.model-scene canvas')).toBeVisible()
  await expect(page.locator('.panel-heading')).toContainText('3D 模型参数')
  await page.getByLabel('模板厚度',{exact:true}).fill('0.5')
  await page.getByLabel('模板厚度',{exact:true}).press('Enter')
  await expect(page.locator('.viewport-top-info')).toContainText('0.50 mm')
  await page.getByRole('button',{name:'G-code 路径',exact:true}).click()
  await expect(page.locator('.panel-heading')).toContainText('G-code 参数')
  await expect(page.getByRole('button',{name:'生成 G-code',exact:true})).toBeDisabled()
  expect(errors).toEqual([])
})

test('ZIP import and per-tab state remain independent', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button',{name:'3D 模型',exact:true}).click()
  await page.getByLabel('模板厚度',{exact:true}).fill('0.35')
  await page.getByLabel('模板厚度',{exact:true}).press('Enter')
  const zip=zipSync({ 'TopPaste.GTP':strToU8('G04 fixture*'), 'Board.GKO':strToU8('G04 fixture*') })
  await page.getByLabel('选择 Gerber 文件').setInputFiles({ name:'board.zip',mimeType:'application/zip',buffer:Buffer.from(zip) })
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(page.locator('.imported-layers')).toContainText('TopPaste.GTP')
  await expect(page.locator('.file-summary')).toContainText('2 个文件')
  await expect(page.locator('.panel-heading')).toContainText('2D 图层参数')
  await expect(page.locator('.board-canvas')).toHaveCount(0)
  await page.getByRole('tab',{name:'示例板 · 100 × 100'}).click()
  await expect(page.getByLabel('模板厚度',{exact:true})).toHaveValue('0.35')
  await page.getByRole('button',{name:'关闭 示例板 · 100 × 100',exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button',{name:'继续编辑'}).click()
  await expect(page.getByRole('tab')).toHaveCount(2)
})

test('parameter export preserves values and logs can be collapsed and cleared', async ({ page }) => {
  await page.goto('/')
  const downloadPromise=page.waitForEvent('download')
  await page.getByRole('button',{name:'导出参数',exact:true}).click()
  const download=await downloadPromise
  expect(download.suggestedFilename()).toContain('.parameters.json')
  const stream=await download.createReadStream();const chunks:Buffer[]=[]
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const params=JSON.parse(Buffer.concat(chunks).toString())
  expect(params.demo).toBe(true);expect(params.parameters.thickness).toBe(0.2)
  await expect(page.getByRole('log')).toContainText('参数配置已导出')
  await page.getByRole('button',{name:'收起日志'}).click()
  await expect(page.getByRole('log')).toHaveCount(0)
  await page.getByRole('button',{name:'展开日志'}).click()
  await page.getByRole('button',{name:'清空日志'}).click()
  await expect(page.getByRole('log')).toContainText('暂无日志')
})

test('empty workspace, invalid file, and compact window are usable', async ({ page }) => {
  await page.setViewportSize({width:1024,height:700})
  await page.goto('/')
  await page.getByRole('button',{name:'关闭 示例板 · 100 × 100',exact:true}).click()
  await expect(page.getByRole('heading',{name:'导入gerber'})).toBeVisible()
  await page.getByLabel('选择 Gerber 文件').setInputFiles({name:'invalid.zip',mimeType:'application/zip',buffer:Buffer.from('not a zip')})
  await expect(page.locator('.toast-message')).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})

test('sample IR is rendered after reopening from either empty state', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.ir-layer > defs > mask')).toHaveCount(125)
  await page.getByRole('button',{name:'关闭 示例板 · 100 × 100',exact:true}).click()
  await page.getByRole('button',{name:'打开示例',exact:true}).click()
  await expect(page.locator('.ir-layer > defs > mask')).toHaveCount(125)
  await page.getByLabel('选择 Gerber 文件').setInputFiles({name:'board.gtp',mimeType:'text/plain',buffer:Buffer.from('G04 fixture*')})
  await expect(page.locator('.ir-layer')).toHaveCount(0)
  await page.getByRole('button',{name:'关闭 示例板 · 100 × 100',exact:true}).click()
  await page.getByRole('button',{name:'打开示例',exact:true}).click()
  await expect(page.locator('.ir-layer > defs > mask')).toHaveCount(125)
  await page.screenshot({path:test.info().outputPath('ir-preview.png')})
})

test('IR masks preserve drawing order, transparency and local macro holes', async ({ page }) => {
  await page.goto('/')
  // Exercise the public store seam with an already parsed layer. This does
  // not pretend the browser adapter parses source Gerber files.
  await page.evaluate(async () => {
    const moduleUrl='/src/domain/project/index.ts'
    const {useProjectStore}=await import(moduleUrl)
    const store=useProjectStore()
    const flash=(aperture:number,polarity='dark',x=0)=>({kind:'flash',aperture,polarity,at:{x,y:0},sourceOffset:0})
    store.add('Parsed layer',[],false,{
      schemaVersion:'2',unit:'mm',source:{originalUnit:'MM',zeroSuppression:'L'},
      apertures:[
        {code:10,shape:{type:'circle',diameter:20}},
        {code:11,shape:{type:'circle',diameter:12}},
        {code:12,shape:{type:'macro',name:'window',primitives:[
          {exposure:'on',shape:{type:'centerLine',width:8,height:8,center:{x:0,y:0}}},
          {exposure:'off',shape:{type:'circle',diameter:4,center:{x:0,y:0}}},
        ]}},
      ],objects:[flash(10),flash(11,'clear'),flash(12),flash(12,'dark',8)],
    })
  })
  await expect(page.locator('.ir-layer')).toBeVisible()
  const samples=await page.locator('.ir-layer').evaluate(async layer => {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg')
    svg.setAttribute('width','240');svg.setAttribute('height','240');svg.setAttribute('viewBox','-12 -12 24 24')
    svg.appendChild(layer.cloneNode(true))
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}))
    try {
      const image=new Image();image.src=url;await image.decode()
      const canvas=document.createElement('canvas');canvas.width=240;canvas.height=240
      const context=canvas.getContext('2d')!;context.drawImage(image,0,0)
      return [0,3,-5,8].map(x=>Array.from(context.getImageData((x+12)*10,120,1,1).data))
    } finally {URL.revokeObjectURL(url)}
  })
  expect(samples[0]![3]).toBe(0) // local hole over the cleared layer
  expect(samples[1]).toEqual([154,200,203,255]) // later dark restores material
  expect(samples[2]![3]).toBe(0) // layer clear stays transparent
  expect(samples[3]).toEqual([154,200,203,255]) // macro hole preserves earlier material
  await page.getByRole('button',{name:'3D 模型',exact:true}).click()
  await expect(page.locator('.model-scene')).toHaveCount(0)
})
