// DEV ONLY: a fake backend that follows the API spec, so the frontend can be
// previewed before the real backend is ready. Data lives in memory and resets
// on restart. Not part of the product; the real backend replaces it.
//
//   npm run mock                                   (fake backend on :4000)
//   HOTEL_IMAGES=/path/to/pack/images/hotels npm run mock   (real hotel photos)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CITY_IMAGES = fileURLToPath(new URL('../../server/assets/cities/', import.meta.url));

const interests = [['TEMPLES','Temples and shrines','CULTURE'],['STREET_FOOD','Street food','FOOD'],['PHOTOGRAPHY','Photography','HOBBY'],['BUDGET_STAYS','Budget stays','STYLE'],['ADVENTURE','Adventure','ACTIVITY'],['NIGHTLIFE','Nightlife','SOCIAL'],['HIKING','Hiking','NATURE'],['MUSEUMS','Museums','CULTURE']].map(([interest,label,category])=>({interest,label,category}));
const cities = [['Tokyo','Japan','JP','Asia/Tokyo'],['Kyoto','Japan','JP','Asia/Tokyo'],['Osaka','Japan','JP','Asia/Tokyo'],['Dubai','UAE','AE','Asia/Dubai'],['Abu Dhabi','UAE','AE','Asia/Dubai']].map(([name,country,countryCode,timezone])=>({name,country,countryCode,timezone,image:`/static/cities/${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.jpg`}));
const dep = [{city:'Bengaluru',airport:'BLR'},{city:'Mumbai',airport:'BOM'},{city:'Delhi',airport:'DEL'}];
const now = () => new Date().toISOString();
const travellers = new Map();
const addT = (t) => travellers.set(t.travellerId, { age: null, createdAt: now(), homeAirport: dep.find(d=>d.city===t.homeCity)?.airport ?? 'BLR', ...t });
addT({ travellerId:'T-001', name:'Sarah Thomas', age:27, gender:'FEMALE', homeCity:'Bengaluru', interests:['TEMPLES','STREET_FOOD','PHOTOGRAPHY','BUDGET_STAYS'], genderPreference:'SAME_GENDER' });
addT({ travellerId:'T-002', name:'Aisha Khan', age:25, gender:'FEMALE', homeCity:'Delhi', interests:['STREET_FOOD','ADVENTURE','NIGHTLIFE'], genderPreference:'SAME_GENDER' });
let tSeq=1000, gSeq=1000, sSeq=1000, rSeq=1000, oSeq=1000, bSeq=0;
const groups = new Map(); const searches = new Map(); const requests = new Map(); const options = new Map(); const bookings = new Map();
const mkG = (g) => groups.set(g.groupId, { itinerary:'', memberIds:[g.ownerId], createdAt: now(), status:'OPEN', ...g });
mkG({ groupId:'G-01', name:'Kyoto Spring Temples', city:'Kyoto', checkIn:'2027-04-10', checkOut:'2027-04-15', maxSize:3, budgetInr:60000, ownerId:'T-001', itinerary:'Day 1 – Fushimi Inari at sunrise\nDay 2 – Nishiki Market and Gion walk' });
mkG({ groupId:'G-08', name:'Kyoto Night Food Trail', city:'Kyoto', checkIn:'2027-04-10', checkOut:'2027-04-14', maxSize:4, budgetInr:58000, ownerId:'T-002' });
const hotels = [
  { hotelId:'HTL-KYO-001', name:'Gion Corner Hotel', city:'Kyoto', area:'Gion', stars:3, rating:7.8, image:'/static/hotels/HOTEL-BUSINESS-1.jpg', checkInFrom:'15:00', checkOutUntil:'11:00',
    rooms:[{ roomId:'RM-KYO-001-A', roomType:'TWIN', name:'Twin Room', maxAdults:2, pricePerNightInr:4760, refundable:true },{ roomId:'RM-KYO-001-B', roomType:'TRIPLE', name:'Triple Room', maxAdults:3, pricePerNightInr:6900, refundable:false }]},
  { hotelId:'HTL-KYO-002', name:'Higashiyama Ryokan', city:'Kyoto', area:'Higashiyama', stars:4, rating:9.1, image:'/static/hotels/HOTEL-RYOKAN-1.jpg', checkInFrom:'15:00', checkOutUntil:'10:00',
    rooms:[{ roomId:'RM-KYO-002-A', roomType:'FAMILY', name:'Family Tatami Room', maxAdults:4, pricePerNightInr:14200, refundable:true }]},
];
const roomsLeft = {};
const nightsOf = (a,b)=>{const out=[];let d=new Date(a+'T00:00:00Z');const e=new Date(b+'T00:00:00Z');while(d<e){out.push(d.toISOString().slice(0,10));d=new Date(d.getTime()+864e5);}return out;};
const left = (roomId, n) => roomsLeft[roomId+n] ?? 3;

const summ = (t) => ({ travellerId:t.travellerId, name:t.name, gender:t.gender, homeCity:t.homeCity });
function groupDto(g, actor) {
  const owner = travellers.get(g.ownerId);
  const pend = [...requests.values()].filter(r=>r.groupId===g.groupId && r.status==='PENDING');
  const mine = [...requests.values()].filter(r=>r.groupId===g.groupId && r.seekerId===actor).at(-1);
  const relation = g.ownerId===actor ? 'OWNER' : g.memberIds.includes(actor) ? 'MEMBER' : mine?.status==='PENDING' ? 'PENDING' : mine?.status==='REJECTED' ? 'REJECTED' : 'NONE';
  const c = cities.find(c=>c.name===g.city);
  return { groupId:g.groupId, name:g.name, city:g.city, country:c.country, timezone:c.timezone, checkIn:g.checkIn, checkOut:g.checkOut, nights:nightsOf(g.checkIn,g.checkOut).length,
    maxSize:g.maxSize, memberCount:g.memberIds.length, freeSpots:g.maxSize-g.memberIds.length, budgetInr:g.budgetInr, itinerary:g.itinerary, status:g.status,
    owner:{ travellerId:owner.travellerId, name:owner.name, gender:owner.gender },
    members:g.memberIds.map(id=>({ ...summ(travellers.get(id)), isOwner:id===g.ownerId })),
    viewer:{ relation, requestId: relation==='PENDING'?mine.requestId:null, pendingRequestCount: relation==='OWNER'?pend.length:null }, createdAt:g.createdAt };
}
function evaluate(s, g) {
  const o = travellers.get(g.ownerId); const seeker = travellers.get(s.travellerId);
  const sn = Math.max(0,(Math.min(+new Date(s.checkOut),+new Date(g.checkOut))-Math.max(+new Date(s.checkIn),+new Date(g.checkIn)))/864e5);
  const lo = Math.min(s.budgetInr,g.budgetInr), diff=Math.abs(s.budgetInr-g.budgetInr), limit=Math.round(lo*0.4);
  const shared = s.interests.filter(i=>o.interests.includes(i));
  const gOk = (s.genderPreference==='ANY'||o.gender===seeker.gender)&&(o.genderPreference==='ANY'||o.gender===seeker.gender);
  const free = g.maxSize-g.memberIds.length-1;
  const checks=[
    {rule:'SAME_CITY',passed:s.city===g.city,message:s.city===g.city?`Both going to ${g.city}`:`${g.city} vs ${s.city}`},
    {rule:'DATES_OVERLAP',passed:sn>=2,sharedNights:sn,message:`${sn} shared nights`},
    {rule:'BUDGET',passed:diff<=limit,diffInr:diff,limitInr:limit,message:`Budgets differ by ₹${diff}; the limit is ₹${limit}`},
    {rule:'SHARED_INTERESTS',passed:shared.length>=2,shared,message:`${shared.length} shared interests`},
    {rule:'GENDER',passed:gOk,message:gOk?'Female only ↔ female only':'Gender preferences don\'t match'},
    {rule:'GROUP_SIZE',passed:free>=0,freeAfterJoin:Math.max(free,0),message:`${Math.max(free,0)} place left after you join`}];
  const failed=checks.filter(c=>!c.passed).map(c=>c.rule);
  const from = s.checkIn>g.checkIn?s.checkIn:g.checkIn, to=s.checkOut<g.checkOut?s.checkOut:g.checkOut;
  return { eligible:!failed.length, checks, failed, reasons:{ sharedNights:sn, sharedFrom:from, sharedTo:to, sharedInterests:shared, budgetDiffInr:diff, budgetLimitInr:limit, gender:'Female only ↔ female only', spotsAfterJoin:Math.max(free,0) },
    score: Math.round(40*shared.length/Math.max(1,s.interests.length)+30*Math.min(1,sn/5)+30*(1-diff/Math.max(1,limit))) };
}
function matches(s, q) {
  let items=[...groups.values()].filter(g=>g.status==='OPEN'&&g.ownerId!==s.travellerId&&!g.memberIds.includes(s.travellerId)).map(g=>({g,e:evaluate(s,g)})).filter(x=>x.e.eligible);
  const si=[].concat(q.getAll?.('sharedInterest')??[]); if(si.length) items=items.filter(x=>si.every(i=>x.e.reasons.sharedInterests.includes(i)));
  items.sort((a,b)=>b.e.score-a.e.score);
  const page=+(q.get?.('page')??1), limit=+(q.get?.('limit')??20);
  const card = ({g,e})=>{const last=[...requests.values()].filter(r=>r.groupId===g.groupId&&r.seekerId===s.travellerId).at(-1);
    return { groupId:g.groupId,name:g.name,city:g.city,checkIn:g.checkIn,checkOut:g.checkOut,memberCount:g.memberIds.length,maxSize:g.maxSize,freeSpots:g.maxSize-g.memberIds.length,budgetInr:g.budgetInr,
      owner:{travellerId:g.ownerId,name:travellers.get(g.ownerId).name},score:e.score,reasons:e.reasons,viewerRequestStatus:last?.status??null };};
  const hints = items.length?[]:[{type:'WIDEN_DATES',message:'Kyoto Spring Temples shares only 1 night; a check-out of 12 Apr would share 2.',groupId:'G-01'}];
  return { matches:{ items:items.slice((page-1)*limit,page*limit).map(card), page, limit, total:items.length }, emptyStateHints:hints };
}
function price(g, room, party) { const n=nightsOf(g.checkIn,g.checkOut); const rn=Math.ceil(party/room.maxAdults); const total=room.pricePerNightInr*rn*n.length;
  return { roomsNeeded:rn, nights:n.length, totalInr:total, perMemberInr:Math.round(total/party*100)/100, available:n.every(d=>left(room.roomId,d)>=rn), minRoomsLeft:Math.min(...n.map(d=>left(room.roomId,d))) }; }
const findRoom = (id)=>{for(const h of hotels){const r=h.rooms.find(r=>r.roomId===id); if(r) return {h,r};} return null;};
const hotelDto = ({rooms,...h})=>h;
function optDto(o,g){ const {h,r}=findRoom(o.roomId); const live=price(g,r,g.memberIds.length);
  return { optionId:o.optionId, groupId:g.groupId, hotel:hotelDto(h), room:r, savedBy:o.savedBy, createdAt:o.createdAt, votes:o.votes, voteCount:o.votes.length, memberCount:g.memberIds.length, allAgree:o.votes.length===g.memberIds.length,
    snapshot:o.snapshot, live:{roomsNeeded:live.roomsNeeded,totalInr:live.totalInr,perMemberInr:live.perMemberInr,available:live.available}, stale:o.snapshot.memberCount!==g.memberIds.length }; }

const reviews = [];
const messages = []; // group chat (E33–E34)
const ratingOf = (id) => { const rs=reviews.filter(r=>r.revieweeId===id); return rs.length?{average:Math.round(rs.reduce((a,r)=>a+r.rating,0)/rs.length*10)/10,count:rs.length}:{average:null,count:0}; };
const E = (res, status, code, message, details=[]) => send(res, status, { error:{ code, message, details, requestId:'req_mock' } });
function send(res, status, body) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(body)); }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8sKe+HgAFZQI3H6c+GQAAAABJRU5ErkJggg==','base64');

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname; const q = url.searchParams; const m = req.method;
  if (p.startsWith('/static/cities/')) { // the real backend's city photos, straight from server/assets
    const file = path.join(CITY_IMAGES, path.basename(p));
    if (fs.existsSync(file)) { res.writeHead(200,{'Content-Type':'image/jpeg'}); return res.end(fs.readFileSync(file)); }
  }
  if (p.startsWith('/static/')) {
    const file = process.env.HOTEL_IMAGES && path.join(process.env.HOTEL_IMAGES, path.basename(p));
    if (file && fs.existsSync(file)) { res.writeHead(200,{'Content-Type':'image/jpeg'}); return res.end(fs.readFileSync(file)); }
    res.writeHead(200,{'Content-Type':'image/png'}); return res.end(PNG);
  }
  let body = {}; if (m==='POST') { let s=''; for await (const c of req) s+=c; body = s?JSON.parse(s):{}; }
  const P = p.replace('/api/v1',''); const actor = req.headers['x-traveller-id']; const me = travellers.get(actor);
  let mt;
  if (P==='/health') return send(res,200,{status:'ok',db:'up',time:now()});
  if (P==='/meta/interests') return send(res,200,{items:interests});
  if (P==='/meta/destinations') return send(res,200,{cities,departureCities:dep,dataWindow:{from:'2027-04-01',to:'2027-04-20'}});
  if (P==='/travellers' && m==='POST') { if(!body.name||body.name.length<2) return E(res,400,'VALIDATION_ERROR','name too short',[{field:'name',issue:'must be 2–60 characters'}]);
    const t={travellerId:`T-${++tSeq}`,...body}; addT(t); return send(res,201,{traveller:travellers.get(t.travellerId)}); }
  if (P==='/travellers') { const s=(q.get('query')??'').toLowerCase(); const items=[...travellers.values()].filter(t=>t.name.toLowerCase().includes(s)).map(summ); return send(res,200,{items,page:1,limit:50,total:items.length}); }
  if (!me) return E(res,401,'UNAUTHENTICATED','Unknown traveller');
  // Group chat (E33–E34): members only, oldest first; ?after= for polling, ?before= for older
  if ((mt=P.match(/^\/groups\/([^/]+)\/messages$/))) { const g=groups.get(mt[1]); if(!g) return E(res,404,'NOT_FOUND','No such group'); if(!g.memberIds.includes(actor)) return E(res,403,'FORBIDDEN','Members only');
    const seq=(id)=>Number(String(id).slice(4));
    if (m==='POST') { const text=String(body.body??'').trim(); if(!text||text.length>2000) return E(res,400,'VALIDATION_ERROR','body: must be 1–2000 characters',[{field:'body',issue:'must be 1–2000 characters'}]);
      const msg={messageId:'MSG-'+(1001+messages.length),groupId:g.groupId,sender:{travellerId:actor,name:travellers.get(actor)?.name??null},body:text,createdAt:now()}; messages.push(msg); return send(res,201,{message:msg}); }
    const limit=Number(q.get('limit')??50), after=q.get('after'), before=q.get('before');
    let list=messages.filter(x=>x.groupId===g.groupId);
    if(after) list=list.filter(x=>seq(x.messageId)>seq(after)); if(before) list=list.filter(x=>seq(x.messageId)<seq(before));
    const items=after?list.slice(0,limit):list.slice(-limit);
    return send(res,200,{items,hasMore:list.length>limit}); }
  // Co-traveller reviews (E30–E32): open on check-out day (MOCK_TODAY=YYYY-MM-DD to simulate)
  if ((mt=P.match(/^\/groups\/([^/]+)\/reviews$/))) { const g=groups.get(mt[1]); if(!g) return E(res,404,'NOT_FOUND','No such group'); if(!g.memberIds.includes(actor)) return E(res,403,'FORBIDDEN','Members only');
    const open=(process.env.MOCK_TODAY??now().slice(0,10))>=g.checkOut;
    if (m==='POST') { if(!open) return E(res,422,'TRIP_NOT_ENDED',`You can rate your co-travellers from ${g.checkOut}, when this trip ends.`);
      if(reviews.some(r=>r.groupId===g.groupId&&r.reviewerId===actor&&r.revieweeId===body.revieweeId)) return E(res,409,'ALREADY_REVIEWED','Already rated');
      const r={reviewId:'RV-'+(1001+reviews.length),groupId:g.groupId,reviewerId:actor,revieweeId:body.revieweeId,rating:body.rating,comment:body.comment??null,createdAt:now()}; reviews.push(r); return send(res,201,{review:r}); }
    const others=g.memberIds.filter(id=>id!==actor).map(id=>travellers.get(id)).filter(Boolean);
    return send(res,200,{groupId:g.groupId,opensOn:g.checkOut,open,coTravellers:others.map(t=>({traveller:{...summ(t),rating:ratingOf(t.travellerId)},myReview:reviews.find(r=>r.groupId===g.groupId&&r.reviewerId===actor&&r.revieweeId===t.travellerId)??null}))}); }
  if ((mt=P.match(/^\/travellers\/([^/]+)\/reviews$/))) { if(!travellers.has(mt[1])) return E(res,404,'NOT_FOUND','No such traveller');
    const items=reviews.filter(r=>r.revieweeId===mt[1]).reverse().map(r=>{const g=groups.get(r.groupId);return {review:r,reviewer:travellers.has(r.reviewerId)?summ(travellers.get(r.reviewerId)):null,trip:g?{groupId:g.groupId,name:g.name,city:g.city,checkIn:g.checkIn,checkOut:g.checkOut}:null};});
    return send(res,200,{rating:ratingOf(mt[1]),items,page:1,limit:10,total:items.length}); }
  if ((mt=P.match(/^\/travellers\/([^/]+)$/))) { const t=travellers.get(mt[1]); if(!t) return E(res,404,'NOT_FOUND','No such traveller');
    return send(res,200,{traveller:t,groups:[...groups.values()].filter(g=>g.memberIds.includes(t.travellerId)).map(g=>({groupId:g.groupId,name:g.name,city:g.city,checkIn:g.checkIn,checkOut:g.checkOut,role:g.ownerId===t.travellerId?'OWNER':'MEMBER'}))}); }
  if (P==='/me') return send(res,200,{traveller:me});
  if (P==='/groups' && m==='POST') { if(!cities.some(c=>c.name===body.city)) return E(res,422,'OUT_OF_DATA_RANGE','We only have data for 5 cities',[{field:'city',issue:'not available'}]);
    const id=`G-${++gSeq}`; mkG({groupId:id,...body,ownerId:actor}); return send(res,201,{group:groupDto(groups.get(id),actor)}); }
  if (P==='/me/groups') { const all=[...groups.values()]; const owned=all.filter(g=>g.ownerId===actor).map(g=>groupDto(g,actor)); const memberOf=all.filter(g=>g.ownerId!==actor&&g.memberIds.includes(actor)).map(g=>groupDto(g,actor));
    return send(res,200,{owned,memberOf,totalPendingRequests:owned.reduce((s,g)=>s+g.viewer.pendingRequestCount,0)}); }
  if (P==='/searches' && m==='POST') { const s={searchId:`S-${++sSeq}`,travellerId:actor,gender:me.gender,createdAt:now(),nights:nightsOf(body.checkIn,body.checkOut).length,...body}; delete s.limit; searches.set(s.searchId,s);
    return send(res,201,{search:s,...matches(s,new URLSearchParams({limit:String(body.limit??20)}))}); }
  if ((mt=P.match(/^\/searches\/([^/]+)$/))) { const s=searches.get(mt[1]); return s?send(res,200,{search:s}):E(res,404,'NOT_FOUND','nope'); }
  if ((mt=P.match(/^\/searches\/([^/]+)\/matches$/))) return send(res,200,matches(searches.get(mt[1]),q));
  if ((mt=P.match(/^\/searches\/([^/]+)\/groups\/([^/]+)\/evaluation$/))) { const {reasons,score,...ev}=evaluate(searches.get(mt[1]),groups.get(mt[2])); return send(res,200,ev); }
  if ((mt=P.match(/^\/groups\/([^/]+)$/))) { const g=groups.get(mt[1]); return g?send(res,200,{group:groupDto(g,actor)}):E(res,404,'NOT_FOUND','No such group'); }
  if ((mt=P.match(/^\/groups\/([^/]+)\/join-requests$/))) { const g=groups.get(mt[1]);
    if (m==='POST') { const s=searches.get(body.searchId); const e=evaluate(s,g); if(!e.eligible) return E(res,422,'NOT_ELIGIBLE',"You don't match this group.",e.checks.filter(c=>!c.passed).map(c=>({rule:c.rule,issue:c.message})));
      const r={requestId:`JR-${++rSeq}`,groupId:g.groupId,seekerId:actor,searchId:s.searchId,status:'PENDING',message:body.message??null,matchSnapshot:{sharedNights:e.reasons.sharedNights,sharedInterests:e.reasons.sharedInterests,budgetDiffInr:e.reasons.budgetDiffInr,score:e.score},createdAt:now(),decidedAt:null,decidedBy:null};
      requests.set(r.requestId,r); return send(res,201,{request:r,group:groupDto(g,actor)}); }
    const items=[...requests.values()].filter(r=>r.groupId===g.groupId&&r.status==='PENDING').map(r=>({request:r,seeker:travellers.get(r.seekerId)})); return send(res,200,{items,page:1,limit:50,total:items.length}); }
  if (P==='/me/join-requests') { const items=[...requests.values()].filter(r=>r.seekerId===actor).reverse().map(r=>{const g=groups.get(r.groupId);return{request:r,group:{groupId:g.groupId,name:g.name,city:g.city,checkIn:g.checkIn,checkOut:g.checkOut,owner:{name:travellers.get(g.ownerId).name}}};}); return send(res,200,{items,page:1,limit:50,total:items.length}); }
  if ((mt=P.match(/^\/join-requests\/([^/]+)\/(approve|reject|withdraw)$/))) { const r=requests.get(mt[1]); const g=groups.get(r.groupId);
    if(r.status!=='PENDING') return E(res,409,'REQUEST_NOT_PENDING','Not pending');
    r.status={approve:'APPROVED',reject:'REJECTED',withdraw:'WITHDRAWN'}[mt[2]]; r.decidedAt=now(); r.decidedBy=actor; const closed=[];
    if(mt[2]==='approve'){ g.memberIds.push(r.seekerId); if(g.memberIds.length===g.maxSize){ g.status='FULL'; for(const o of requests.values()) if(o.groupId===g.groupId&&o.status==='PENDING'){o.status='CLOSED';closed.push(o.requestId);} } return send(res,200,{request:r,group:groupDto(g,actor),closedRequestIds:closed}); }
    return send(res,200,{request:r}); }
  if ((mt=P.match(/^\/groups\/([^/]+)\/hotels$/))) { const g=groups.get(mt[1]); const party=q.get('planFor')==='MAX'?g.maxSize:g.memberIds.length;
    const items=hotels.filter(h=>h.city===g.city).map(h=>{const opts=h.rooms.map(r=>{const pr=price(g,r,party);const saved=[...options.values()].find(o=>o.groupId===g.groupId&&o.roomId===r.roomId);
      return {...r,...pr,budgetSharePct:Math.round(pr.perMemberInr/g.budgetInr*1000)/10,savedOptionId:saved?.optionId??null};}).filter(o=>o.available).map(({available,...o})=>o).sort((a,b)=>a.perMemberInr-b.perMemberInr);
      return {hotel:hotelDto(h),cheapestPerMemberInr:opts[0]?.perMemberInr,options:opts};}).filter(x=>x.options.length);
    return send(res,200,{context:{groupId:g.groupId,city:g.city,checkIn:g.checkIn,checkOut:g.checkOut,nights:nightsOf(g.checkIn,g.checkOut),partySize:party,budgetInr:g.budgetInr,timezone:'Asia/Tokyo'},page:1,limit:10,total:items.length,items}); }
  if ((mt=P.match(/^\/groups\/([^/]+)\/saved-options$/))) { const g=groups.get(mt[1]);
    if(m==='POST'){ const {r}=findRoom(body.roomId); const pr=price(g,r,g.memberIds.length); const o={optionId:`OPT-${++oSeq}`,groupId:g.groupId,roomId:r.roomId,savedBy:actor,votes:[actor],createdAt:now(),snapshot:{memberCount:g.memberIds.length,roomsNeeded:pr.roomsNeeded,totalInr:pr.totalInr,perMemberInr:pr.perMemberInr}}; options.set(o.optionId,o); return send(res,201,{option:optDto(o,g)}); }
    return send(res,200,{items:[...options.values()].filter(o=>o.groupId===g.groupId).map(o=>optDto(o,g)).sort((a,b)=>b.voteCount-a.voteCount)}); }
  if ((mt=P.match(/^\/groups\/([^/]+)\/saved-options\/([^/]+)\/vote$/))) { const g=groups.get(mt[1]); const o=options.get(mt[2]); o.votes=o.votes.filter(v=>v!==actor); if(m==='POST') o.votes.push(actor); return send(res,200,{option:optDto(o,g)}); }
  if ((mt=P.match(/^\/groups\/([^/]+)\/saved-options\/([^/]+)$/)) && m==='DELETE') { options.delete(mt[2]); return send(res,200,{deleted:mt[2]}); }
  if ((mt=P.match(/^\/groups\/([^/]+)\/booking\/quote$/))) { const g=groups.get(mt[1]); const o=options.get(body.optionId); const {h,r}=findRoom(o.roomId); const pr=price(g,r,g.memberIds.length);
    return send(res,200,{optionId:o.optionId,hotelName:h.name,roomName:r.name,checkIn:g.checkIn,checkOut:g.checkOut,nights:pr.nights,roomsNeeded:pr.roomsNeeded,memberCount:g.memberIds.length,pricePerNightInr:r.pricePerNightInr,totalInr:pr.totalInr,perMemberInr:pr.perMemberInr,available:pr.available,members:g.memberIds.map(id=>({travellerId:id,name:travellers.get(id).name}))}); }
  if ((mt=P.match(/^\/groups\/([^/]+)\/booking$/))) { const g=groups.get(mt[1]);
    if(m==='POST'){ if(bookings.has(g.groupId)) return E(res,409,'ALREADY_BOOKED','Already booked'); const o=options.get(body.optionId); const {h,r}=findRoom(o.roomId); const pr=price(g,r,g.memberIds.length);
      const b={bookingId:`BK-2027-${String(++bSeq).padStart(6,'0')}`,groupId:g.groupId,optionId:o.optionId,hotel:hotelDto(h),room:r,roomsBooked:pr.roomsNeeded,nights:nightsOf(g.checkIn,g.checkOut),memberIds:[...g.memberIds],totalInr:pr.totalInr,perMemberInr:pr.perMemberInr,status:'CONFIRMED',bookedBy:actor,createdAt:now()};
      bookings.set(g.groupId,b); g.status='BOOKED'; return send(res,201,{booking:b,group:groupDto(g,actor)}); }
    const b=bookings.get(g.groupId); return b?send(res,200,{booking:b}):E(res,404,'NOT_FOUND','This group has no booking yet.'); }
  E(res,404,'NOT_FOUND',`No route ${m} ${P}`);
}).listen(4000, () => console.log('Fake backend running on http://localhost:4000 (dev only)'));
