const {zipSync,strToU8}=require('fflate');
module.exports=function fixture(version=1){
 const rows=version===1?[['108','a','09:00:00'],['109','b','10:25:00']]:[['109','c','11:00:00'],['245','d','12:00:00']];
 const files={
 'stops.txt':'stop_id,stop_name,stop_lat,stop_lon\n777,"Test, Dworzec 01",53.1,19.9\n778,Lutcza test 02,53.11,19.91\n',
 'routes.txt':'route_id,route_short_name,route_type\n'+rows.map(([line])=>line+','+line+',3').join('\n')+'\n',
 'calendar.txt':'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nPS,1,1,1,1,1,0,0,20260101,20271231\n',
 'calendar_dates.txt':'service_id,date,exception_type\nPS,20261111,2\nPS,20261107,1\n',
 'trips.txt':'route_id,service_id,trip_id,trip_headsign\n'+rows.map(([line,id])=>line+',PS,'+id+',Lutcza').join('\n')+'\n',
 'stop_times.txt':'trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type\n'+rows.map(([,id,time])=>id+','+time+','+time+',777,1,0,0\n'+id+',12:30:00,12:30:00,778,2,1,0').join('\n')+'\n',
 };
 return zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])));
};
