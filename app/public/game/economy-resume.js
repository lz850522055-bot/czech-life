import {isSimulationActionCurrent,simulationTask} from './simulation-rules.js?business=2';
const TABS=['trade','build','ledger'];
const KINDS=['accept','procure','deliver','collect','site','plan','materials','foundation','walls','open'];
export const economyUiKey=user=>user+'|economy-ui:v1';
export const economyHelpKey=(state,active)=>[state.epoch,state.round,active?.kind||'',active?.target||''].join('|');
export function economyUiSnapshot(state,{tab='trade',active=null,help=false,feedback=null,helpedContexts=[]}={}){
 return {version:1,epoch:state.epoch,round:state.round,revision:state.revision,tab:TABS.includes(tab)?tab:'trade',active:active?{kind:active.kind,target:active.target||null}:null,help:!!help,feedback:feedback?structuredClone(feedback):null,helpedContexts:[...new Set(helpedContexts)].filter(k=>typeof k==='string'&&k.startsWith(state.epoch+'|'+state.round+'|')).slice(-60)};
}
export function restoreEconomyUi(snapshot,state){
 const empty={tab:'trade',active:null,help:false,feedback:null,helpedContexts:[],notice:null};
 if(snapshot?.version!==1||snapshot.epoch!==state.epoch||snapshot.round!==state.round)return empty;
 const tab=TABS.includes(snapshot.tab)?snapshot.tab:'trade',helpedContexts=Array.isArray(snapshot.helpedContexts)?snapshot.helpedContexts.filter(k=>typeof k==='string'&&k.startsWith(state.epoch+'|'+state.round+'|')).slice(-60):[];
 const a=snapshot.active;if(!a||!KINDS.includes(a.kind)||a.target!=null&&typeof a.target!=='string')return {...empty,tab,helpedContexts};
 const active={kind:a.kind,target:a.target||null},feedback=snapshot.feedback,done=feedback?.correct===true||feedback?.status==='needs_self_review';
 try{simulationTask(state,active);}catch{return {...empty,tab,helpedContexts,notice:'原委托已不在当前阶段，已显示最新账本。'};}
 if(!isSimulationActionCurrent(state,active)&&!(done&&snapshot.revision===state.revision))return {...empty,tab,helpedContexts,notice:'这份委托已经推进到下一步，已为你显示最新账本。原操作不会重复执行。'};
 return {tab,active,help:!!snapshot.help||helpedContexts.includes(economyHelpKey(state,active)),feedback:snapshot.revision===state.revision?feedback:null,helpedContexts,notice:null};
}
