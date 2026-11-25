import { env, pipeline, RawImage, Tensor } from '@huggingface/transformers';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

env.cacheDir=fileURLToPath(new URL('./model-cache',import.meta.url));
// Off by default. Explicit opt-in is only for fetching the pinned model.
env.allowRemoteModels=process.env.YWHY_ALLOW_MODEL_DOWNLOAD==='1';
env.allowLocalModels=true;
const path=resolve(process.argv[2]);
const meta=JSON.parse(readFileSync(join(path,'manifest.json'),'utf8'));
if(meta.length!==36)throw Error('Unexpected frozen oracle manifest');
const pipe=await pipeline('image-to-text','onnx-community/TexTeller3-ONNX',{
  device:'cpu',dtype:'q4',revision:'ed90c6164810242882ca90863bb85697a76f4841'});
const output=[];
const gen={max_new_tokens:128,do_sample:false,num_beams:1};
try{
  for(const c of meta){
    const png=join(path,c.key+'.png');
    const f=readFileSync(join(path,c.key+'.f32'));
    if(f.byteLength!==448*448*4)throw Error('Unexpected tensor size');
    const buf=new Float32Array(448*448);
    for(let i=0;i<buf.length;i++)buf[i]=f.readFloatLE(4*i);
    const orig=spawnSync('tesseract',[png,'stdout','-l','eng','--psm','7'],{encoding:'utf8',timeout:10000,env:{...process.env,OMP_THREAD_LIMIT:'1'}});
    if(orig.status!==0)throw Error(orig.stderr);
    const p0=performance.now();
    const stock=await pipe((await RawImage.read(png)).grayscale(),gen);
    const p1=performance.now();
    const generated=await pipe.model.generate({inputs:new Tensor('float32',buf,[1,1,448,448]),...gen});
    const raw=pipe.tokenizer.batch_decode(generated,{skip_special_tokens:true})[0];
    output.push({...c,raw:{tesseract:orig.stdout,stock:stock[0]?.generated_text??'',aspect_pad:raw},
      timesMs:{stock:Math.round(p1-p0),aspect_pad:Math.round(performance.now()-p1)}});
  }
}finally{await pipe.dispose();}
console.log(JSON.stringify(output,null,2));
