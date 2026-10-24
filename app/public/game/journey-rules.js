export const journeyNear=(player,target)=>Array.isArray(player)&&player.length===2&&player.every(Number.isFinite)&&Math.hypot(player[0]-target.xy[0],player[1]-target.xy[1])<=(target.radius||24);
const keyed=(mission,key)=>mission.tasks.find(t=>t.key===key);
export function missingJourneyRequirements(task,mission,states,attempt){
  return (task.requires||[]).filter(r=>{const t=keyed(mission,r.key),s=states?.[t?.id];if(r.kind==='answer')return !(s?.last_listen?.attempt_id===attempt&&s.last_listen.answer===t.answer);if(r.kind==='checkout'){const a=s?.last_checkout;return !(a?.attempt_id===attempt&&a.quantity===t.answer.quantity&&a.total===t.answer.total);}return r.kind==='arrival'?!(s?.last_arrival?.attempt_id===attempt):!(s?.dialogue_attempt===attempt&&s.dialogue_node===r.terminal);});
}
export function missingJourneyEvents(task,mission,events,attempt,before=Infinity){
  return (task.requires||[]).filter(r=>{const t=keyed(mission,r.key);return !events.some(e=>e.attempt_id===attempt&&e.task_id===t?.id&&Date.parse(e.occurred_at)<=before&&(r.kind==='answer'?e.kind==='answer'&&e.feedback?.score===1:r.kind==='checkout'?e.kind==='answer'&&e.feedback?.evidence==='quantity_price_simulation'&&e.feedback.score===1:r.kind==='arrival'?e.kind==='answer'&&e.feedback?.evidence==='city_arrival'&&e.feedback.score===1:e.kind==='dialogue'&&e.feedback?.complete&&e.feedback.next===r.terminal));});
}
export function parcelState(mission,states,attempt){
  const story=mission.journey_story;if(!story)return null;
  const pickup=states?.[keyed(mission,story.pickup_key)?.id],handoff=states?.[keyed(mission,story.handoff_key)?.id];
  const delivered=handoff?.dialogue_attempt===attempt&&handoff.dialogue_node===story.delivered_node,carrying=pickup?.dialogue_attempt===attempt&&pickup.dialogue_node===story.packed_node;
  return {state:delivered?'delivered':carrying?'carrying':'empty',label:delivered?'已送达雅娜':carrying?'给雅娜的24号包裹':'还没有领取包裹'};
}
export function activeParcel(catalog,progress){
  for(const m of catalog.missions.filter(m=>m.journey_story)){
    const states=progress.missions.find(s=>s.id===m.id)?.tasks,run=progress.journey_runs?.[m.id],attempt=run?.attempt_id||states?.[keyed(m,m.journey_story.pickup_key)?.id]?.dialogue_attempt;
    if(attempt){const parcel=parcelState(m,states,attempt);if(parcel?.state==='carrying')return {mission:m,attempt,...parcel};}
  }
  return null;
}
