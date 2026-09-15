import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const assets=JSON.parse(await fs.readFile(new URL('./photo-sources.json',import.meta.url),'utf8'));
const dir=new URL('../frontend/public/photos/',import.meta.url);
for(const {source,name} of assets){
  for(const width of [640,1024,1536]){
    await sharp(source).resize({width,withoutEnlargement:true}).webp({quality:86}).toFile(fileURLToPath(new URL(`wharf-${name}-${width}.webp`,dir)));
  }
}
console.log('24 versions WebP créées ; originaux conservés.');
