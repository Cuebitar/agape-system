// Category-scoped, deterministic allocation. Specific choices fill their own slots;
// Random choices fill empty slots or displace the lowest currently winning slot
// only when strictly higher. Minimum amounts apply to both routes.
export function allocate(artworks, offers) {
 const active=artworks.filter(a=>a.active!==false);
 const slots=active.flatMap(a=>Array.from({length:Number(a.quantity)},(_,slot)=>({artworkId:String(a.id),slot,min:Number(a.minimum_amount||0),offer:null})));
 const ordered=xs=>[...xs].sort((a,b)=>Number(b.amount)-Number(a.amount)||new Date(a.created_at)-new Date(b.created_at)||Number(a.id)-Number(b.id));
 for(const offer of ordered(offers.filter(o=>o.artwork_id!==null))){
  const slot=slots.find(s=>s.artworkId===String(offer.artwork_id)&&!s.offer&&Number(offer.amount)>=s.min);
  if(slot)slot.offer=offer;
 }
 for(const offer of ordered(offers.filter(o=>o.artwork_id===null))){
  const eligible=slots.filter(s=>Number(offer.amount)>=s.min&&(!s.offer||Number(offer.amount)>Number(s.offer.amount)));
  eligible.sort((a,b)=>(a.offer?Number(a.offer.amount):-Infinity)-(b.offer?Number(b.offer.amount):-Infinity)||Number(a.artworkId)-Number(b.artworkId)||a.slot-b.slot);
  if(eligible[0])eligible[0].offer=offer;
 }
 return slots.filter(s=>s.offer).map(s=>({artworkId:s.artworkId,slot:s.slot,offerId:s.offer.id,amount:Number(s.offer.amount)}));
}
