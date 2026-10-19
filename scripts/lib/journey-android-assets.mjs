import fs from 'node:fs';
import path from 'node:path';

export function prepareAndroidJourneyAssets(outDir){
  const files=['pks','mpk'].map(provider=>({provider,file:path.join(outDir,'data','journeys',provider+'.json')}));
  for(const {provider,file} of files){
    if(!fs.existsSync(file)||!JSON.parse(fs.readFileSync(file,'utf8')).trips?.length)throw new Error(`Missing Android timetable: ${provider}`);
  }
  // Android merges foo.json.gz under the name foo.json. Package only plain JSON
  // after checking both feeds; compressed sources remain in public for the web.
  for(const {file} of files)fs.rmSync(file+'.gz',{force:true});
}
