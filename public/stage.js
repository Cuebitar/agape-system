const $=id=>document.getElementById(id);
const names={Personal:'个人系列 · Personal',Family:'家庭系列 · Family',Church:'教会系列 · Church',General:'综合系列 · General'};
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'RM '+Number(n).toLocaleString('en-MY',{maximumFractionDigits:2});
let state=null,serverOffset=0,previousCategory=null;
function image(a){return a.image_url?`<img src="${safe(a.image_url)}" alt="${safe(a.title)}">`:'<div class="blank">✦</div>'}
function artworkCard(a){return `<article class="art">${image(a)}<h3>${safe(a.title)}</h3><p>最低认献 · ${money(a.minimum_amount)}</p></article>`}
function render(){if(!state)return;const {rounds,artworks,results}=state;const active=rounds.find(r=>r.is_open);const lastClosed=[...rounds].reverse().find(r=>r.closed_at);const selected=active||lastClosed;const cat=selected?.category;
 $('rounds').innerHTML=rounds.map(r=>`<span class="pill ${r.is_open?'active':r.closed_at?'done':''}">${safe(r.category)} · ${r.closed_at?'✓':r.is_open?'LIVE':'—'}</span>`).join('');
 $('countdown').hidden=!active;$('progress').hidden=!active;$('invite').hidden=!active;$('results').hidden=true;$('closing').hidden=true;
 if(!selected){$('headline').textContent='爱加倍 · AGAPE';$('subheading').textContent='等待认献开始 · Waiting for the offering session';$('gallery').innerHTML='';return;}
 $('eyebrow').textContent=names[cat];$('headline').textContent=active?'让爱成为奉献 · Make an Offering':'爱的回应 · Offering Results';$('subheading').textContent=active?'本系列认献开放中 · Offerings are open':'本系列认献已截止 · Round closed';
 if(active){$('gallery').innerHTML=artworks.filter(a=>a.category===cat).map(artworkCard).join('');$('linktext').textContent=location.origin;$('qr').innerHTML='<img src="/api/qr.svg" alt="Scan QR code to offer">';}
 else {$('gallery').innerHTML='';$('results').hidden=false;const catArt=artworks.filter(a=>a.category===cat);const byId=new Map(catArt.map(a=>[String(a.id),a]));const wins=results.filter(r=>r.category===cat);$('results').innerHTML=wins.length?wins.map(w=>{const a=byId.get(String(w.artwork_id));return `<article class="result">${a?image(a):''}<div class="detail"><h3>${safe(w.title)}${Number(a?.quantity)>1?' · #'+(Number(w.slot)+1):''}</h3><div class="name">${safe(w.display_name)}</div><div class="amount">${money(w.amount)}</div></div></article>`}).join(''):'<div class="closing">本轮暂无成功认献 · No successful allocations</div>'}
}
function tick(){if(!state)return;const active=state.rounds.find(r=>r.is_open);if(!active)return;const remaining=Math.max(0,Math.ceil((new Date(active.ends_at).getTime()-(Date.now()+serverOffset))/1000));$('countdown').textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');$('bar').style.width=(remaining/120*100)+'%';if(remaining===0)$('subheading').textContent='时间到 · Finalising results…';}
async function refresh(){try{const t0=Date.now();const r=await fetch('/api/stage',{cache:'no-store'});if(!r.ok)throw Error('Unable to load stage');const d=await r.json();serverOffset=Date.parse(r.headers.get('date')||new Date())-((Date.now()+t0)/2);state=d;render();tick();}catch(e){$('subheading').textContent='连接中断 · Reconnecting…';}}
refresh();setInterval(refresh,1500);setInterval(tick,250);
