import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

// Local development/preview adapter. Rust owns Python execution and task files.
export function previewApi(): Plugin {
  const root=fileURLToPath(new URL('../',import.meta.url))
  const binary=`${root}src-rust/target/debug/preview${process.platform==='win32'?'.exe':''}`
  let running=0
  const active=new Set<ReturnType<typeof spawn>>()
  function middleware(req:IncomingMessage,res:ServerResponse,next:()=>void) {
    if(req.url!=='/api/preview') return next()
    const send=(status:number,data:unknown)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))}}
    if(req.method!=='POST') return send(405,{error:'请使用模型生成操作。'})
    if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`) return send(403,{error:'请求来源不受支持。'})
    if(!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'模型请求格式无效。'})
    if(running>=2) return send(429,{error:'模型计算繁忙，请稍后重试。'})
    let size=0
    const chunks:Buffer[]=[]
    req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size<=12*1024*1024)chunks.push(chunk)})
    req.on('end',()=>{
      if(size>12*1024*1024) return send(413,{error:'模型请求过大。'})
      if(res.destroyed) return
      if(running>=2) return send(429,{error:'模型计算繁忙，请稍后重试。'})
      let input:string
      try { input=JSON.stringify(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch {return send(400,{error:'模型请求格式无效。'})}
      running++
      const child=spawn(binary,[],{cwd:root,stdio:['pipe','pipe','pipe']})
      active.add(child)
      let output=''
      const cancel=()=>child.stdin?.end()
      const timer=setTimeout(cancel,65000)
      res.on('close',cancel)
      child.stdout?.on('data',(chunk:Buffer)=>{output+=chunk.toString();if(output.length>34*1024*1024)cancel()})
      child.stderr?.resume()
      child.stdin?.on('error',()=>{})
      child.once('error',()=>send(503,{error:'无法启动模型预览，请重新运行 npm run dev。'}))
      child.once('close',()=>{
        running--;active.delete(child);clearTimeout(timer);res.off('close',cancel)
        if(res.writableEnded || res.destroyed)return
        try {const result=JSON.parse(output);send(result.error?422:200,result)}
        catch {send(500,{error:'模型计算未返回有效结果。'})}
      })
      child.stdin?.write(`${input}\n`)
    })
  }
  const stop=()=>{for(const child of active) child.stdin?.end()}
  return {name:'lmbox-local-preview',
    configureServer(server){server.middlewares.use(middleware);server.httpServer?.once('close',stop)},
    configurePreviewServer(server){server.middlewares.use(middleware);server.httpServer.once('close',stop)},
  }
}
