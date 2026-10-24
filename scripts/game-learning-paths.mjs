import {sourceContext} from '../app/public/game/learning-path.js';
const OPEN=new Set(['work','writing','speaking','interaction','mediation']);
export function buildLearningPaths(catalog,lessons,assessments){
  const lessonMap=new Map(lessons.map(l=>[l.id,l])),assessmentMap=new Map(assessments.map(a=>[a.id,a]));
  const units=[];
  for(const m of catalog.missions.filter(m=>!m.learning_parent)){
    const l=lessonMap.get(m.lesson_id),refs=[];
    const add=(owner,t,phase)=>{const ctx=sourceContext(owner,t);refs.push({mission_id:owner.id,task_id:t.id,phase,context_id:ctx?.context_id||owner.id,source_task_id:ctx?.source.id||null,open:OPEN.has(t.kind),kind:t.kind,skills:t.skills||[]});};
    for(const t of m.tasks)add(m,t,['source','learn'].includes(t.kind)?'teach':t.source_assessment||t.native_check?'challenge':'practice');
    for(const child of catalog.missions.filter(x=>x.learning_parent===m.id))for(const t of child.tasks)add(child,t,['source','learn'].includes(t.kind)?'teach':t.learning_phase);
    if(m.id.startsWith('G-')){
      const points=new Set(l.knowledge_points||[]);
      for(const a of catalog.missions.filter(a=>a.level===m.level&&a.id.startsWith('T-')))for(const t of a.tasks)if(t.source_assessment&&(t.knowledge_points||[]).some(k=>points.has(k)))add(a,t,'return');
    }
    const unit={id:m.id,mission_id:m.id,level:m.level,title:m.title,goal:m.goal,knowledge_points:m.foundation?[]:(l?.knowledge_points||[]),prerequisites:m.prerequisites||[],refs};
    unit.gaps=['teach','practice','challenge','return'].filter(phase=>!refs.some(r=>r.phase===phase));
    for(const r of refs)if(r.source_task_id){const a=assessmentMap.get(r.context_id)||(catalog.learning_contexts||[]).find(c=>c.id===r.context_id);if(!a)throw new Error('Learning context has no versioned author/source record: '+r.context_id);}
    units.push(unit);
  }
  return {version:1,catalog_version:catalog.version,definition:{seen:'查看过的示范步骤数',helped:'求助过或借助帮助完成的步骤数',independent:'无帮助完成的闭合练习次数，按具体练习类型保留',later:'至少隔24小时，在不同材料、任务和尝试中再次完成闭合练习',works:'开放作品只保存和自查，不自动转成掌握',schedule:'间隔只是补练建议，不规定学习期限'},units};
}
