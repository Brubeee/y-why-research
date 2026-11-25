import { env, pipeline, RawImage } from '@huggingface/transformers';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

env.cacheDir = resolve(process.env.YWHY_MODEL_CACHE ?? './model-cache');
env.allowRemoteModels = false;
env.allowLocalModels = true;
const folder = resolve(process.argv[2]);
const pages = JSON.parse(readFileSync(join(folder,'manifest.json'),'utf8'));
if (pages.length !== 8) throw Error('Expected eight frozen full pages');
const recognize = await pipeline('image-to-text','onnx-community/TexTeller3-ONNX',{
  device:'cpu',dtype:'q4',revision:'ed90c6164810242882ca90863bb85697a76f4841'});
const output = new Map();
try {
  for (const page of pages) {
    for (const crop of page.crops) {
      const path=join(folder,crop.name);
      if (createHash('sha256').update(readFileSync(path)).digest('hex')!==crop.crop_sha256)
        throw Error('Input crop differs from the frozen manifest');
      let raw=output.get(crop.crop_sha256);
      if (raw===undefined) {
        const results=await recognize((await RawImage.read(path)).grayscale(),
          {max_new_tokens:128,do_sample:false,num_beams:1});
        raw=results[0]?.generated_text??'';
        output.set(crop.crop_sha256,raw);
      }
      crop.raw=raw;
    }
  }
} finally {
  await recognize.dispose();
}
console.log(JSON.stringify(pages,null,2));
