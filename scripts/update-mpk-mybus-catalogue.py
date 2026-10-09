import json,sqlite3,re,unicodedata,math,pathlib,urllib.request,gzip,tempfile,datetime
root=pathlib.Path(__file__).resolve().parent.parent
request=urllib.request.Request('https://www.mpkrzeszow.pl/przystanki/stopscache',headers={'User-Agent':'PKS-Live catalogue updater'})
old=json.loads(urllib.request.urlopen(request,timeout=30).read())
packed=urllib.request.urlopen('http://84.38.160.220/myBusServices/SchedulesService.svc/GetScheduleFile',timeout=30).read()
temp=tempfile.NamedTemporaryFile(suffix='.sqlite')
temp.write(gzip.decompress(packed));temp.flush()
def norm(s):
 s=unicodedata.normalize('NFKD',s.lower().replace('ł','l'));s=''.join(c for c in s if not unicodedata.combining(c));s=re.sub(r'^rzeszow[ ,]*','',s);return re.sub('[^a-z0-9]','',s)
index={}
for s in old:index.setdefault(norm(s['stop_name']),[]).append(s)
catalog={}
for id,name,lat,lon in sqlite3.connect(temp.name).execute('select id,nazwa,lat,lon from PRZYSTANKI'):
 if not (lat and lon and 48<=lat<=56 and 14<=lon<=25):continue
 candidates=[s for s in index.get(norm(name),[]) if math.hypot((float(s['stop_lat'])-lat)*111320,(float(s['stop_lon'])-lon)*111320*math.cos(math.radians(lat)))<=150]
 mapped=int(candidates[0]['stop_id']) if len(candidates)==1 else 2000000+id
 catalog[id]=[mapped,name,lat,lon]
if len(catalog)<1000:raise RuntimeError('Incomplete myBus catalogue; refusing to replace existing data')
temp.close()
content='// Generated from the public myBus SIP catalogue, '+datetime.date.today().isoformat()+'. SIP IDs are NOT GTFS IDs.\nexport const mybusStopCatalogue: Record<string, [number,string,number,number]> = '+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n'
for prefix in ['lib','functions/src/transport']:(root/prefix/'mpk-mybus-stop-catalogue.ts').write_text(content)
