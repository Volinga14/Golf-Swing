const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function createServer(privateDirectory){
  const directory=privateDirectory?path.resolve(privateDirectory):null;
  const manifest=directory&&fs.existsSync(path.join(directory,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8')):null;
  return http.createServer((request,response)=>{
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return}
    let relative;try{relative=decodeURIComponent(new URL(request.url,'http://localhost').pathname)}catch{response.writeHead(400);response.end();return}
    if(relative==='/__lab/manifest.json'){
      if(!manifest){response.writeHead(404);response.end();return}
      response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');
      response.end(request.method==='HEAD'?undefined:JSON.stringify(manifest));return;
    }
    let target;
    if(relative.startsWith('/__lab/private/')){
      const id=relative.slice('/__lab/private/'.length),record=manifest?.records.find(r=>r.id===id);
      if(!record||path.basename(record.fileName)!==record.fileName){response.writeHead(404);response.end();return}
      target=path.join(directory,record.fileName);
    }else{
      if(relative.endsWith('/'))relative+='index.html';target=path.resolve(root,'.'+relative);
      if(!target.startsWith(root+path.sep)){response.writeHead(403);response.end();return}
      if(relative.includes('/.git/')||relative.includes('/node_modules/')){response.writeHead(404);response.end();return}
    }
    if(!fs.existsSync(target)||!fs.statSync(target).isFile()){response.writeHead(404);response.end();return}
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.onnx':'application/octet-stream','.mp4':'video/mp4','.webm':'video/webm','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
    const size=fs.statSync(target).size;response.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');response.setHeader('Accept-Ranges','bytes');
    const range=request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);let start=0,end=size-1;
    if(range){start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),size-1):size-1;if(start>end||start>=size){response.writeHead(416,{'Content-Range':`bytes */${size}`});response.end();return}response.statusCode=206;response.setHeader('Content-Range',`bytes ${start}-${end}/${size}`)}
    response.setHeader('Content-Length',end-start+1);if(request.method==='HEAD'){response.end();return}
    const stream=fs.createReadStream(target,{start,end});stream.on('error',()=>response.destroy());response.on('close',()=>stream.destroy());stream.pipe(response);
  });
}
module.exports={createServer};
if(require.main===module){
  const privateDirectory=process.argv[2]||path.resolve(root,'../audit/marking-references'),port=Number(process.env.PORT||8086);
  createServer(privateDirectory).listen(port,'127.0.0.1',()=>console.log(`Laboratorio: http://127.0.0.1:${port}/lab/ (vídeos privados solo en este equipo)`));
}
