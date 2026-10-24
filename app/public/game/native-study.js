// View-only adaptation of authored teaching metadata. Never mutate an immutable
// task body, migrate an event, or infer mastery from opening a guide/example.
const listeningTitles={
 'native-groceries':'电话里的晚间安排','native-online-shop':'网购与页面浏览','native-traffic':'出行与车辆安排','native-long-navigation':'路口旁的两人电话','native-long-weather-trip':'一次郊游回顾','native-long-callback':'回拨通话说明','native-long-workshop':'活动、工作与阅读','native-long-sharing':'室友间的分享','native-long-traffic':'候车中的电话','native-long-briefing':'数据库培训见闻',
 'public-stance-change':'公开发言 · 立场变化','public-unsaid-allusion':'公开发言 · 话外联系','public-company-analogy':'公开发言 · 公司案例类比','public-counterfactual':'公开发言 · 比较假设后果','public-numbers-uncertainty':'公开发言 · 数字与对象','public-provisional-process':'公开发言 · 程序与职责','public-symbolic-function':'公开发言 · 任命的意义','public-responsibility-negation':'公开发言 · 住房条款','public-statistical-tradeoff':'公开发言 · 统计与养老','public-concession-principle':'公开发言 · 法律与不同意见','public-outsourcing-condition':'公开发言 · 采购与外包','public-quotation-commitment':'公开发言 · 协议中的表达','public-healthcare-continuous':'公开发言 · 医疗议程讨论'
};
export function nativeMissionTitle(mission){return mission?.native?listeningTitles[mission.id.slice(2)]||'城市电台 · 原声听辨':mission?.title||'';}
export function nativeTaskView(mission,task,data){
  if(!task||!mission?.native)return task;
  const view=data?.guides?.[mission.id]?.[task.id];
  return view?{...task,...view}:task;
}
