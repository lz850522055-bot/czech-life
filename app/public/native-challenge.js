// Native listening uses the existing append-only note event transport. Its own
// content version separates these records from the original lesson's progress.
export const CHALLENGE_PREFIX = '[原声进阶记录] ';
const ACTIONS = new Set(['draft', 'answer', 'exposure', 'selfcheck']);
export const isChallengeNote = text => typeof text === 'string' && text.startsWith(CHALLENGE_PREFIX);

export function parseChallengeNote(text) {
  if (!isChallengeNote(text)) return null;
  try {
    const x = JSON.parse(text.slice(CHALLENGE_PREFIX.length));
    if (x.schema !== 1 || !ACTIONS.has(x.action) || typeof x.record_id !== 'string'
        || typeof x.clip_id !== 'string' || typeof x.version !== 'string') return null;
    return x;
  } catch { return null; }
}

export function resolveChallengeRecord(clip, notes = [], pending = [], userId = null) {
  const c = clip?.c2_challenge;
  const out = { first: null, latest: null, draft: null, exposed: false, checks: {}, history: [], older_versions: 0 };
  if (!c) return out;
  const byId = new Map();
  const add = (text, at, pending, error = null) => {
    const a = parseChallengeNote(text);
    if (!a || a.clip_id !== clip.id || !Number.isFinite(Date.parse(at))) return;
    if (a.version !== c.version) { out.older_versions++; return; }
    const old = byId.get(a.record_id);
    if (!old || (old.pending && !pending)) byId.set(a.record_id, { ...a, at, pending, error });
  };
  for (const n of notes) add(n.text, n.created_at, false);
  for (const row of pending) {
    if (userId && row.user_id !== userId) continue;
    if (row.event?.kind === 'note') add(row.event.answer, row.event.occurred_at, true, row.error || null);
  }
  const events = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at) || a.record_id.localeCompare(b.record_id));
  const exposure = events.find(e => e.action === 'exposure');
  out.exposed = !!exposure; out.exposure = exposure || null;
  const validAnswers = e => c.tasks.every(t => typeof e.answers?.[t.id] === 'string'
    && e.answers[t.id].trim() && e.answers[t.id].length <= 2000);
  for (const e of events) {
    // An earlier offline disclosure arriving later must still mark later work as assisted.
    e.assisted = !!e.assisted || !!(exposure && exposure.at <= e.at);
    if (e.action === 'answer' && validAnswers(e)) {
      out.first ||= e; out.latest = e; out.history.push(e); out.draft = null;
    }
    if (e.action === 'draft' && e.answers && typeof e.answers === 'object') out.draft = e;
    if (e.action === 'selfcheck' && e.checks && typeof e.checks === 'object') { out.checks = e.checks; out.selfcheck = e; }
  }
  return out;
}

export function challengeNote(clip, action, input, record = {}, recordId = globalThis.crypto.randomUUID()) {
  const c = clip?.c2_challenge;
  if (!c || !ACTIONS.has(action)) throw new Error('这组原声训练不存在。');
  const payload = { schema: 1, clip_id: clip.id, version: c.version, record_id: recordId, action, assisted: !!record.exposed };
  if (action === 'answer' || action === 'draft') {
    payload.answers = {};
    for (const t of c.tasks) {
      const value = String(input?.answers?.[t.id] ?? '').trim();
      if (value.length > 2000) throw new Error('每题最多保存2000个字符。');
      if (action === 'answer' && !value) throw new Error('请为三个任务留下回答；没听清的地方可以写明疑问。');
      payload.answers[t.id] = value;
    }
  }
  if (action === 'exposure' && !record.first) throw new Error('先保存目前的回答，再展开原文和示范。');
  if (action === 'selfcheck') {
    if (!record.exposed) throw new Error('先看原文和依据，再对照自检。');
    payload.checks = {};
    for (const task of c.tasks) for (const [i] of task.criteria.entries()) {
      const key = task.id + ':' + i, value = input?.checks?.[key] || 'unrated';
      if (!['unrated', 'met', 'partial', 'retry'].includes(value)) throw new Error('自检选项无效。');
      payload.checks[key] = value;
    }
  }
  const text = CHALLENGE_PREFIX + JSON.stringify(payload);
  if (text.length > 10000) throw new Error('记录过长，请简化本次回答。');
  return text;
}

export function collectChallengeInput(root, clip) {
  const answers = {}, checks = {};
  for (const task of clip.c2_challenge.tasks) {
    answers[task.id] = root.querySelector(`[data-native-answer="${task.id}"]`)?.value || '';
    for (const [i] of task.criteria.entries()) {
      const key = task.id + ':' + i;
      checks[key] = root.querySelector(`[data-native-check="${key}"]`)?.value || 'unrated';
    }
  }
  return { answers, checks };
}

export function challengePage(index, clip, record, { esc, button }) {
  const c = clip.c2_challenge, revealed = !!record.exposed;
  const status = e => e?.error ? '留在本机，尚未同步：' + e.error : e?.pending ? '已保存在本机，等待联网同步' : e ? '已同步到账号' : '';
  const fields = record.draft?.answers || record.latest?.answers || {};
  const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
  const segmentMap = new Map(clip.transcript.map((t, i) => [t.segment_id, { ...t, index: i + 1 }]));
  const seek = id => { const t = segmentMap.get(id); return t ? button('native-seek', `回听第${t.index}段 · ${t.start.toFixed(1)}–${t.end.toFixed(1)}秒`, 'secondary small', `data-segment="${esc(id)}"`) : ''; };
  const detailedEvidence = quotes => `<div class="native-evidence">${quotes.map(q => `<blockquote lang="cs">${esc(q.cs)}</blockquote>${seek(q.segment_id)}`).join('')}</div>`;
  const evidence = task => task.evidence?.length ? detailedEvidence(task.evidence) : `<div class="native-evidence">${task.evidence_cs.map(q => `<blockquote lang="cs">${esc(q)}</blockquote>`).join('')}${button('native-seek','回听整段原声','secondary small',`data-segment="${esc(c.source_segment_id)}"`)}</div>`;
  const tasks = c.tasks.map((task, i) => `<section class="card"><p class="small">任务 ${i + 1} / ${c.tasks.length}</p><h3>${esc(task.prompt_zh)}</h3><label class="form-label" for="native-answer-${task.id}">你的回答<textarea id="native-answer-${task.id}" data-native-answer="${task.id}" rows="6" maxlength="2000" lang="cs">${esc(fields[task.id] || '')}</textarea></label>${revealed ? `<h4>这题要听准什么</h4><p>${esc(task.focus_zh)}</p>${evidence(task)}<p>${esc(task.explanation_zh)}</p><h4>新编捷语示范 · 不是原录音</h4><div class="sentence"><div><p lang="cs">${esc(task.sample_cs)}</p><p>${esc(task.sample_zh)}</p></div></div><h4>逐项自检</h4>${task.criteria.map((r, j) => { const key = task.id + ':' + j; return `<div class="note"><strong>${esc(r.label_zh)}</strong><p>做到：${esc(r.met_zh)}</p><p>还差一点：${esc(r.partial_zh)}</p><p>需要重听：${esc(r.retry_zh)}</p><label>我这一项<select data-native-check="${key}"><option value="unrated" ${!record.checks[key] || record.checks[key] === 'unrated' ? 'selected' : ''}>还没判断</option><option value="met" ${record.checks[key] === 'met' ? 'selected' : ''}>已做到</option><option value="partial" ${record.checks[key] === 'partial' ? 'selected' : ''}>还差一点</option><option value="retry" ${record.checks[key] === 'retry' ? 'selected' : ''}>需要重听</option></select></label></div>`; }).join('')}` : ''}</section>`).join('');
  const first = record.first ? `<details><summary>回看首次保存的回答</summary><p class="small">${esc(status(record.first))} · ${record.first.assisted ? '已见提示后的回答' : '本训练展开提示前的回答'} · ${esc(record.first.at)}</p>${c.tasks.map((task, i) => `<h4>任务 ${i + 1}</h4><p class="native-note-text">${esc(record.first.answers[task.id])}</p>`).join('')}</details>` : '';
  const transcript = revealed ? `<section class="card"><h2>原转写与中文</h2>${clip.transcript.map((t, i) => `<div class="sentence"><div>${c.long_form ? `<strong>第${i + 1}段 · ${esc(t.speaker)}</strong><div class="button-row">${seek(t.segment_id)}</div>` : ''}<p lang="cs">${esc(t.cs)}</p><p>${esc(t.zh)}</p>${c.long_form && t.note_zh ? `<p class="note">${esc(t.note_zh)}</p>` : ''}</div></div>`).join('')}<p>${esc(c.objective_zh)}</p>${button('native-challenge-standard',c.long_form?'查看完整学习材料与迁移练习':'查看原有完整听辨教材','secondary')}</section>` : '';
  const preparation = !revealed && c.pre_listening_zh?.length ? `<section class="card"><h2>先这样听</h2><ol>${c.pre_listening_zh.map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>` : '';
  const unpacking = revealed && c.long_form ? `<section class="card"><h2>把长段拆开理解</h2>${(clip.deep_dive || []).map(d => `<details><summary>${esc(d.title_zh)}</summary><p>${esc(d.analysis_zh)}</p>${detailedEvidence(d.evidence_quotes || [])}<p class="note">自己试一下：${esc(d.learner_action_zh)}</p></details>`).join('')}</section>` : '';
  const sourceLinks = [ ['raw_alignment_item','原转写与对齐来源'], ['audio_collection_item','录音资料集与许可'], ['license_url','转写与教学许可'] ].filter(([key])=>safeUrl(clip.source[key])).map(([key,label])=>`<a href="${esc(safeUrl(clip.source[key]))}" target="_blank" rel="noreferrer">${esc(label)}</a>`).join(' · ');
  return `<section class="page-heading"><div><span class="eyebrow">真实原声 · C2分项延伸</span><h1>${esc(revealed ? c.title_zh : c.blind_title_zh)}</h1><p>${esc(c.intro_zh)}</p></div></section><div class="authentic-layout"><aside class="card"><h2>选择原声</h2><div class="native-menu">${index.clips.map(other => `<a class="native-clip ${other.id === clip.id ? 'active' : ''}" href="#authentic/${esc(other.id)}"><strong>${esc(other.c2_challenge?.blind_title_zh || other.title_zh)}</strong><small>${esc(other.genre_zh || '日常对话')} · 原速</small></a>`).join('')}</div></aside><article>
  <section class="card"><audio id="native-audio" controls preload="metadata" aria-label="真实原速完整片段" src="/api/v1/authentic/audio/${encodeURIComponent(clip.id)}"></audio><p class="audio-status">${esc(clip.audio_description_zh)}</p><div class="button-row">${button('native-download','下载原声供离线学习','secondary small',`data-id="${esc(clip.id)}"`)}</div><p class="notice" id="native-challenge-status" role="status">${revealed ? '原文与示范已展开。之后保存的修改均标为辅助作答，首次记录继续保留。' : record.first ? '首次回答已留存，可以继续复听，或展开原文核对。' : '原文、主题提示和示范尚未展开。先留下自己的回答。'} ${esc(status(record.draft || record.latest))}</p>${first}</section>
  ${preparation}${transcript}${unpacking}${tasks}<section class="card"><div class="button-row">${button('native-challenge-save', revealed ? '保存辅助修改' : record.first ? '另存本次回答（保留首次）' : '保存三个首次回答')}${button('native-challenge-draft','保存草稿','secondary')}${!revealed ? button('native-challenge-reveal','展开原文、示范与自检','secondary',record.first ? '' : 'disabled') : button('native-challenge-check','保存我的逐项自检','secondary')}</div>${record.selfcheck ? `<p class="small">自检${esc(status(record.selfcheck))}；这是自己的判断，不是系统自动评分。</p>` : ''}${record.older_versions ? '<p class="small">同素材旧训练版本的记录仍保留在学习记录导出中；本页只使用当前版本。</p>' : ''}<details><summary>来源、训练范围与原课程</summary><p>${esc(c.scope_zh)}</p><p class="small">“展开前”只记录本次训练是否查看提示，不证明从未见过材料，也不自动证明掌握等级。</p><p>${esc(clip.source.attribution)}</p><p>${esc(clip.source.processing)}</p><p><a href="${esc(safeUrl(clip.source.url))}" target="_blank" rel="noreferrer">原语料</a> · ${esc(clip.source.license)}</p><p>${sourceLinks}</p>${c.long_form?`<p>${esc(clip.source.license_notice_zh)}</p><p>本材料关联${esc(clip.level)}规律课，训练版本${esc(c.version)}。</p>`:`<p>原片段关联${esc(clip.level)}课程，未因新增训练而改级。训练版本${esc(c.version)}。</p>`}<a href="#lesson/${esc(clip.lesson_id)}">回到原有规律课</a></details></section></article></div>`;
}

// Injection points are existing queueEvent/sync/render functions. Persist before
// revealing; a queue failure leaves both first answers and the text hidden.
export async function handleChallengeAction(action, clip, record, root, effects) {
  const actions = { 'native-challenge-save': 'answer', 'native-challenge-draft': 'draft',
    'native-challenge-reveal': 'exposure', 'native-challenge-check': 'selfcheck' };
  const kind = actions[action];
  if (!kind) return false;
  if (kind === 'exposure' && record.exposed) { effects.render(); return true; }
  const input = collectChallengeInput(root, clip);
  // Do not discard changes typed after the first saved answer when opening help.
  if (kind === 'exposure' && record.first
      && JSON.stringify(input.answers) !== JSON.stringify(record.draft?.answers || record.latest?.answers || {})) {
    await effects.queue(challengeNote(clip, 'draft', input, record));
  }
  const text = challengeNote(clip, kind, input, record);
  await effects.queue(text);
  await effects.refresh();
  effects.render();
  await effects.sync();
  return true;
}
