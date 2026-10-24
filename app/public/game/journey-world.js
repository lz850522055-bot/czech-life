// The same cast becomes the active counterpart on this specific journey.
// Teaching locations come from the authored mission, never from a UI offset.
export function journeyAdventure(adventure,mission,task){
  const destination=task?.kind==='travel'?task.travel.target:mission?.city_excursion&&task?.kind==='dialogue'?task.at_place:null;
  if(!(mission?.journey_story||mission?.city_excursion)||!destination)return adventure;
  const actor=mission.city_excursion?(task.npc_id||mission.city_excursion.npc_id):task.key==='pickup-walk'?'petr':'jana',summary={id:mission.id,origin:mission.npc,journey_current:true,title:mission.city_excursion?task.title:task.key==='pickup-walk'?'和彼得核对包裹':'把24号包裹交给雅娜',goal:task.prompt,done:0,total:mission.tasks.length,complete:false};
  return {...adventure,npcs:adventure.npcs.map(n=>n.id!==actor?n:{...n,xy:[...destination.xy],next:summary,nextId:mission.id,missions:[summary],stage:'continuing',greeting:mission.city_excursion?'到了以后，咱们核对这次留言里的条件。':task.key==='pickup-walk'?'到了门口，再和我核对给谁、哪个编号。':'到我身边后，咱们把编号再核实一遍。',total:1,done:0})};
}
