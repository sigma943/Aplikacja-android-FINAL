const test=require('node:test');const assert=require('node:assert/strict');
const {banExpiryForDuration,banDetailsForSave,banDateTimeInput}=require('./load-ts.cjs')('lib/admin/ban-details.ts');
test('ban presets start from confirmation time, and a leap-day year ends on February 28',()=>{
 const now=new Date('2026-10-17T18:30:17Z');
 for(const [preset,hours] of [['hour',1],['day',24],['week',168]])assert.equal(new Date(banExpiryForDuration(preset,now)).getTime()-now.getTime(),hours*3600000);
 assert.equal(banExpiryForDuration('year',new Date('2024-02-29T12:00:00Z')),'2025-02-28T12:00:00.000Z');
 assert.equal(banExpiryForDuration('custom',now),'');
});
test('editing replaces expiry, reason and photo, including explicit removal, while preserving original issue details',()=>{
 const now=new Date('2026-10-17T18:00:00Z'),previous={reason:'old',expiresAt:'2026-10-18T18:00:00Z',gifUrl:'https://example.com/old.png',bannedAt:'2026-10-16T12:00:00Z',bannedBy:'Original',silent:false,autoBan:true};
 const edit=banDetailsForSave({previous,reason:' New reason ',expiryDate:'2026-10-19T14:23:00Z',image:'https://example.com/new.png',silent:false,actor:'Editor',now});
 assert.equal(edit.reason,'New reason');assert.equal(edit.expiresAt,'2026-10-19T14:23:00.000Z');assert.equal(edit.gifUrl,'https://example.com/new.png');assert.equal(edit.bannedAt,previous.bannedAt);assert.equal(edit.bannedBy,'Original');assert.equal(edit.autoBan,true);
 const removed=banDetailsForSave({previous,reason:'',expiryDate:'',image:'',silent:false,actor:'Editor',now});assert.equal(removed.gifUrl,'');assert.equal(removed.expiresAt,'');
 assert.equal(banDetailsForSave({previous,reason:'x',expiryDate:'',image:'https://example.com/a.png',silent:true,actor:'Editor',now}).gifUrl,'');
});
test('invalid or past custom deadlines cannot silently create a permanent ban',()=>{
 for(const expiryDate of ['invalid','2026-10-17T18:00:00Z','2026-10-16T18:00:00Z'])assert.throws(()=>banDetailsForSave({reason:'x',expiryDate,image:'',silent:false,actor:'Editor',now:new Date('2026-10-17T18:00:00Z')}),/przyszłości/);
 assert.equal(banDateTimeInput('invalid'),'');
 const iso='2026-10-18T13:27:19Z';const local=banDateTimeInput(iso);assert.equal(new Date(local).getTime(),new Date(iso).getTime()-19000);
});
