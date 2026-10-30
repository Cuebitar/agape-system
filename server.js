import express from 'express';
import pg from 'pg';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {allocate} from './allocation.js';
const root=dirname(fileURLToPath(import.meta.url));
for (const name of ['DATABASE_URL','ADMIN_PASSWORD','SESSION_SECRET']) if (!process.env[name]) throw Error(`Missing ${name}`);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
await pool.query(await readFile(join(root,'schema.sql'),'utf8'));
const app=express();app.disable('x-powered-by');app.set('trust proxy',Number(process.env.TRUST_PROXY||1));app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'30kb'}));app.use(cookieParser());
const secure=process.env.NODE_ENV==='production';
const key=process.env.SESSION_SECRET;
function token(){const expiry=Date.now()+12*60*60*1000;const body=String(expiry);const sig=crypto.createHmac('sha256',key).update(body).digest('hex');return `${body}.${sig}`;}
function auth(req,res,next){const value=req.cookies.__session||'';const [exp,sig]=value.split('.');if(!exp||!sig||!/^[0-9a-f]{64}$/.test(sig)||Number(exp)<Date.now())return res.status(401).json({error:'Admin login required'});const expected=crypto.createHmac('sha256',key).update(exp).digest('hex');if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return res.status(401).json({error:'Admin login required'});next();}
function mutation(req,res,next){const origin=req.get('origin');if(origin){try{if(new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Invalid origin'});}catch{return res.status(403).json({error:'Invalid origin'});}}next();}
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const categories=['Personal','Family','Church','General'];
// Database clock is authoritative; round closing and allocation share a row lock.
async function finalizeRound(client,category){
 const round=(await client.query('SELECT * FROM rounds WHERE category=$1 FOR UPDATE',[category])).rows[0];
 if(!round?.started_at||round.closed_at)return round;
 const arts=(await client.query('SELECT * FROM artworks WHERE active=TRUE AND category=$1 ORDER BY id',[category])).rows;
 const offers=(await client.query('SELECT * FROM offers WHERE category=$1 ORDER BY created_at,id',[category])).rows;
 for(const winner of allocate(arts,offers)) await client.query('INSERT INTO allocations(artwork_id,slot,offer_id,amount) VALUES($1,$2,$3,$4) ON CONFLICT (artwork_id,slot) DO NOTHING',[winner.artworkId,winner.slot,winner.offerId,winner.amount]);
 await client.query('UPDATE rounds SET closed_at=NOW() WHERE category=$1',[category]);
 return (await client.query('SELECT * FROM rounds WHERE category=$1',[category])).rows[0];
}
async function syncExpired(){
 const client=await pool.connect();try{await client.query('BEGIN');
 const expired=(await client.query('SELECT category FROM rounds WHERE started_at IS NOT NULL AND closed_at IS NULL AND ends_at<=NOW() ORDER BY started_at FOR UPDATE')).rows;
 for(const r of expired)await finalizeRound(client,r.category);
 await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
app.get('/api/qr.svg',asyncRoute(async(req,res)=>{const url=new URL('/',process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`).toString();res.set('Cache-Control','no-store');res.type('image/svg+xml').send(await QRCode.toString(url,{type:'svg',margin:1,width:300,errorCorrectionLevel:'M'}));}));
app.get('/api/artworks',asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT id,title,category,description,image_url,quantity,minimum_amount FROM artworks WHERE active=TRUE ORDER BY id');res.json(rows);}));
app.get('/api/status',asyncRoute(async(req,res)=>{await syncExpired();const {rows}=await pool.query(`SELECT category,started_at,ends_at,closed_at,CASE WHEN started_at IS NOT NULL AND closed_at IS NULL AND ends_at>NOW() THEN TRUE ELSE FALSE END AS is_open, GREATEST(0,EXTRACT(EPOCH FROM (ends_at-NOW()))) AS seconds_left FROM rounds ORDER BY CASE category WHEN 'Personal' THEN 1 WHEN 'Family' THEN 2 WHEN 'Church' THEN 3 ELSE 4 END`);res.json({rounds:rows,active_category:rows.find(r=>r.is_open)?.category||null,server_time:new Date().toISOString()});}));
app.get('/api/stage',asyncRoute(async(req,res)=>{
 await syncExpired();const rounds=(await pool.query(`SELECT category,started_at,ends_at,closed_at,CASE WHEN started_at IS NOT NULL AND closed_at IS NULL AND ends_at>NOW() THEN TRUE ELSE FALSE END AS is_open,GREATEST(0,EXTRACT(EPOCH FROM (ends_at-NOW()))) AS seconds_left FROM rounds ORDER BY CASE category WHEN 'Personal' THEN 1 WHEN 'Family' THEN 2 WHEN 'Church' THEN 3 ELSE 4 END`)).rows;
 const artworks=(await pool.query('SELECT id,title,category,image_url,minimum_amount,quantity FROM artworks WHERE active=TRUE ORDER BY id')).rows;
 const results=(await pool.query(`SELECT a.id AS artwork_id,a.category,a.title,al.slot,al.amount,CASE WHEN o.allow_stage_name THEN COALESCE(NULLIF(o.stage_name,''),o.guest_name) ELSE '爱心奉献者' END AS display_name FROM allocations al JOIN artworks a ON a.id=al.artwork_id JOIN offers o ON o.id=al.offer_id JOIN rounds r ON r.category=a.category WHERE r.closed_at IS NOT NULL ORDER BY a.id,al.slot`)).rows;
 res.set('Cache-Control','no-store');res.json({rounds,artworks,results});
}));
app.post('/api/offers',mutation,rateLimit({windowMs:60*1000,limit:8,standardHeaders:'draft-7',legacyHeaders:false}),asyncRoute(async(req,res)=>{
 const {guest_name,phone,table_no='',amount,artwork_id,category,donate_if_unsuccessful=false,allow_stage_name=false,stage_name=''}=req.body||{};
 if(typeof guest_name!=='string'||!guest_name.trim()||guest_name.length>100||typeof phone!=='string'||phone.trim().length<6||phone.length>40||typeof table_no!=='string'||table_no.length>30||typeof stage_name!=='string'||stage_name.length>80||typeof allow_stage_name!=='boolean'||typeof donate_if_unsuccessful!=='boolean'||!categories.includes(category)||!/^\d+(\.\d{1,2})?$/.test(String(amount))||Number(amount)<=0||Number(amount)>10000000||!(artwork_id===null||/^\d+$/.test(String(artwork_id))))return res.status(400).json({error:'Please check all fields'});
 const client=await pool.connect();try{await client.query('BEGIN');const round=(await client.query('SELECT * FROM rounds WHERE category=$1 FOR UPDATE',[category])).rows[0];
 if(!round?.started_at||round.closed_at||new Date(round.ends_at).getTime()<=Date.now()){await client.query('ROLLBACK');return res.status(409).json({error:'This category is closed'});}
 if(artwork_id!==null){const art=await client.query('SELECT minimum_amount FROM artworks WHERE id=$1 AND active=TRUE AND category=$2',[artwork_id,category]);if(!art.rowCount){await client.query('ROLLBACK');return res.status(400).json({error:'Artwork not in active category'});}if(Number(amount)<Number(art.rows[0].minimum_amount)){await client.query('ROLLBACK');return res.status(400).json({error:'Below minimum offering amount'});}}
 else {const min=await client.query('SELECT MIN(minimum_amount) AS amount FROM artworks WHERE active=TRUE AND category=$1',[category]);if(min.rows[0].amount===null||Number(amount)<Number(min.rows[0].amount)){await client.query('ROLLBACK');return res.status(400).json({error:'Random amount below category minimum'});}}
 const result=await client.query('INSERT INTO offers(artwork_id,category,guest_name,phone,table_no,amount,donate_if_unsuccessful,allow_stage_name,stage_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,created_at',[artwork_id,category,guest_name.trim(),phone.trim(),table_no.trim(),amount,donate_if_unsuccessful,allow_stage_name,stage_name.trim()]);await client.query('COMMIT');res.status(201).json({id:result.rows[0].id,created_at:result.rows[0].created_at,message:'Offering intention recorded; no payment taken.'});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.post('/api/admin/login',mutation,rateLimit({windowMs:15*60*1000,limit:10}), (req,res)=>{const pass=String(req.body?.password||'');const expected=process.env.ADMIN_PASSWORD;const a=crypto.createHash('sha256').update(pass).digest();const b=crypto.createHash('sha256').update(expected).digest();if(!crypto.timingSafeEqual(a,b))return res.status(401).json({error:'Incorrect password'});res.cookie('__session',token(),{httpOnly:true,secure,sameSite:'strict',maxAge:12*60*60*1000,path:'/'}).json({ok:true});});
app.post('/api/admin/logout',mutation,auth,(req,res)=>res.clearCookie('__session',{path:'/'}).json({ok:true}));
app.get('/api/admin/data',auth,asyncRoute(async(req,res)=>{await syncExpired();const [art,off,alloc,state]=await Promise.all([pool.query('SELECT * FROM artworks ORDER BY id'),pool.query('SELECT * FROM offers ORDER BY created_at,id'),pool.query('SELECT * FROM allocations ORDER BY artwork_id,slot'),pool.query('SELECT * FROM settings WHERE id=1')]);const rounds=(await pool.query('SELECT * FROM rounds ORDER BY category')).rows;res.json({artworks:art.rows,offers:off.rows,allocations:alloc.rows,status:state.rows[0],rounds});}));
app.post('/api/admin/artworks',mutation,auth,asyncRoute(async(req,res)=>{const {title,category='General',description='',image_url='',quantity=1,minimum_amount=0}=req.body||{};const existing=await pool.query('SELECT 1 FROM rounds WHERE started_at IS NOT NULL LIMIT 1');if(existing.rowCount)return res.status(409).json({error:'Artwork changes locked once rounds begin'});if(typeof title!=='string'||!title.trim()||title.length>150||!['Personal','Family','Church','General'].includes(category)||typeof description!=='string'||description.length>3000||typeof image_url!=='string'||image_url.length>2000||(image_url&&!/^https:\/\//.test(image_url))||!Number.isInteger(Number(quantity))||Number(quantity)<1||Number(quantity)>100||!Number.isFinite(Number(minimum_amount))||Number(minimum_amount)<0)return res.status(400).json({error:'Invalid artwork details'});const {rows}=await pool.query('INSERT INTO artworks(title,category,description,image_url,quantity,minimum_amount) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[title.trim(),category,description,image_url,quantity,minimum_amount]);res.status(201).json(rows[0]);}));
app.post('/api/admin/round/start',mutation,auth,asyncRoute(async(req,res)=>{
 const {category}=req.body||{};if(!categories.includes(category))return res.status(400).json({error:'Invalid category'});
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT category FROM rounds ORDER BY category FOR UPDATE');
 const active=(await client.query('SELECT category FROM rounds WHERE started_at IS NOT NULL AND closed_at IS NULL')).rows;
 const current=(await client.query('SELECT * FROM rounds WHERE category=$1',[category])).rows[0];
 if(active.length||current.started_at){await client.query('ROLLBACK');return res.status(409).json({error:'Another round is active, or this round already started'});}
 const count=await client.query('SELECT COUNT(*)::int AS n FROM artworks WHERE category=$1 AND active=TRUE',[category]);if(!count.rows[0].n){await client.query('ROLLBACK');return res.status(409).json({error:'Add artwork to this category first'});}
 await client.query("UPDATE rounds SET started_at=NOW(),ends_at=NOW()+INTERVAL '2 minutes' WHERE category=$1",[category]);await client.query('COMMIT');res.json({ok:true,category});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.post('/api/admin/round/close',mutation,auth,asyncRoute(async(req,res)=>{
 const {category}=req.body||{};if(!categories.includes(category))return res.status(400).json({error:'Invalid category'});
 const client=await pool.connect();try{await client.query('BEGIN');const r=await finalizeRound(client,category);if(!r?.started_at){await client.query('ROLLBACK');return res.status(409).json({error:'Round has not started'});}await client.query('COMMIT');res.json({ok:true,category});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.post('/api/admin/payment',mutation,auth,asyncRoute(async(req,res)=>{const {offer_id,status}=req.body||{};if(!/^\d+$/.test(String(offer_id))||!['pending','paid','cancelled'].includes(status))return res.status(400).json({error:'Invalid payment update'});const result=await pool.query('UPDATE allocations SET payment_status=$1 WHERE offer_id=$2 RETURNING *',[status,offer_id]);if(!result.rowCount)return res.status(404).json({error:'Allocation not found'});res.json(result.rows[0]);}));
app.get('/api/admin/export.csv',auth,asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT o.id,o.guest_name,o.phone,o.table_no,o.amount,o.donate_if_unsuccessful,o.created_at,a.title AS selected_artwork,win.title AS allocated_artwork,al.payment_status FROM offers o LEFT JOIN artworks a ON a.id=o.artwork_id LEFT JOIN allocations al ON al.offer_id=o.id LEFT JOIN artworks win ON win.id=al.artwork_id ORDER BY o.created_at,o.id');const cols=['id','guest_name','phone','table_no','amount','donate_if_unsuccessful','created_at','selected_artwork','allocated_artwork','payment_status'];const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'").replaceAll('"','""')+'"';res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition','attachment; filename="agape-offers.csv"');res.send('\uFEFF'+cols.join(',')+'\n'+rows.map(r=>cols.map(c=>cell(r[c])).join(',')).join('\n'));}));
app.use(express.static(join(root,'public')));app.get('/stage',(req,res)=>res.sendFile(join(root,'public','stage.html')));
app.get('/admin',(req,res)=>res.sendFile(join(root,'public','admin.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Server error. Please contact the organizer.'});});
const port=Number(process.env.PORT||3000);app.listen(port,()=>console.log(`AGAPE running on port ${port}`));
