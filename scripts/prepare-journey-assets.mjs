import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
// Plain JSON has a known MIME type in Capacitor's Android asset server.
for(const provider of ['pks','mpk']){
 const source=`public/data/journeys/${provider}.json.gz`;
 const bytes=gunzipSync(fs.readFileSync(source));
 const feed=JSON.parse(bytes.toString('utf8'));
 if(feed.provider!==provider||!feed.trips?.length)throw Error(`Invalid ${provider} timetable`);
 fs.writeFileSync(`public/data/journeys/${provider}.json`,bytes);
}
