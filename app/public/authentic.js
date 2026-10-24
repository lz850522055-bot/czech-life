export function authenticNotes(clipId, notes, esc) {
  const prefix='[真人听辨 '+clipId+']';
  const recent=(notes||[]).filter(n=>n.text.startsWith(prefix)).slice(0,12);
  return recent.length ? recent.map(n=>`<div class="note"><small>${esc(n.created_at)}</small><p class="native-note-text">${esc(n.text.slice(prefix.length).trim())}</p></div>`).join('') : '<p class="muted">尚无记录。</p>';
}
export async function playNativeSegment(audio, segment) {
  if (!audio || !segment || !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start) throw new Error('这句音频的位置无效。');
  audio.pause(); audio.ontimeupdate = null; audio.currentTime = segment.start;
  audio.ontimeupdate = () => { if (audio.currentTime >= segment.end) { audio.pause(); audio.ontimeupdate = null; } };
  try { await audio.play(); } catch (error) { audio.ontimeupdate = null; throw error; }
}

export function authenticPage(index, selected, notes, {esc, button}) {
  const clips = index?.clips || [], clip = clips.find(x => x.id === selected) || clips[0];
  if (!clip) return '<h1>真人听辨</h1><p>尚未安装真人素材。</p>';
  const ready = clip.media.status !== 'pending_local_generation';
  const safeSource = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
  const licenseName = clip.source.license || 'CC BY-SA 3.0';
  const licenseUrl = safeSource(clip.source.license_url || 'https://creativecommons.org/licenses/by-sa/3.0/');
  const sourceUrl = safeSource(clip.source.url);
  const audioDescription = clip.audio_description_zh || '真人录音，A 在左声道，B 在右声道。原语料未提供的时间空档补零，未加速或合成对白。';
  const text = v => esc(String(v ?? '').replace(/\bsegment_id\b/g,'原句编号').replace(/\bs0*(\d{1,3})\b/g,(_,n)=>`第${Number(n)}句`));
  const segmentId = (t, i) => t.segment_id || `${clip.id}-s${String(i+1).padStart(3,'0')}`;
  const segments = new Map(clip.transcript.map((t,i) => [segmentId(t,i),t]));
  const list = values => `<ul>${(values || []).map(v => `<li>${esc(v)}</li>`).join('')}</ul>`;
  const seek = (id, label) => {
    const s = segments.get(id);
    return s && ready ? button('native-seek', esc(label || `听 ${s.start.toFixed(1)}–${s.end.toFixed(1)} 秒`), 'secondary small', `data-segment="${esc(id)}"`) : '';
  };
  const evidence = item => `<div class="native-evidence">${(item.evidence_quotes || []).map(q => `<blockquote><p lang="cs">${esc(q.cs)}</p>${seek(q.segment_id)}</blockquote>`).join('')}</div>`;
  const tasks = (clip.tasks || []).map((task, i) => typeof task === 'string'
    ? `<li>${esc(task)}</li>`
    : `<li><h4>第 ${i+1} 轮 · ${esc(task.title_zh)}</h4><p>${text(task.instructions_zh)}</p><p class="note">留下什么：${text(task.deliverable_zh)}</p><details><summary>定位这一轮的原句</summary><div class="button-row">${(task.focus_segment_ids || []).map(id => seek(id)).join('')}</div></details></li>`).join('');
  const questions = clip.question_details?.length
    ? clip.question_details.map(q => `<li><p>${esc(q.prompt_zh)}</p><details><summary>展开答案与原文依据</summary>${list(q.answer_points_zh)}${evidence(q)}${q.limits_zh ? `<p class="small muted">${esc(q.limits_zh)}</p>` : ''}</details></li>`).join('')
    : clip.questions.map(q => `<li>${esc(q)}</li>`).join('');
  const deep = (clip.deep_dive || []).map(d => `<details><summary>${esc(d.title_zh)}</summary><p>${text(d.analysis_zh)}</p>${evidence(d)}<p class="note">自己试一下：${text(d.learner_action_zh)}</p></details>`).join('');
  const transfer = (clip.transfer || []).map(item => typeof item === 'string'
    ? `<div class="note"><p>${esc(item)}</p></div>`
    : `<section class="native-transfer"><h4>${esc(item.title_zh)}</h4><p>${esc(item.prompt_zh)}</p>${list(item.constraints_zh)}<details><summary>对照标准自己检查</summary>${(item.rubric || []).map(r => `<h5>${esc(r.criterion_zh)}</h5><p>做到：${esc(r.met_zh)}</p><p>还差一点：${esc(r.partial_zh)}</p><p>需要再练：${esc(r.not_yet_zh)}</p>`).join('')}</details><details><summary>新编教学示例（不是原录音）</summary><p lang="cs">${esc(item.sample_response_cs)}</p><p>${esc(item.sample_response_zh)}</p></details></section>`).join('');
  return `<section class="page-heading"><div><span class="eyebrow">真实声音 · 自己的节奏</span><h1>听懂真实捷语</h1><p>从日常对话到公开讨论：抓住意思，再听语气、条件和言外之意。</p></div></section>
  <div class="authentic-layout"><aside class="card"><h2>选择片段 · ${clips.length}</h2><div class="native-menu">${clips.map(c => `<a class="native-clip ${c.id === clip.id ? 'active' : ''}" href="#authentic/${esc(c.id)}"><strong>${esc(c.title_zh)}</strong><small>${esc(c.genre_zh || '日常对话')} · ${Math.round(c.media.duration)} 秒 · 原速</small></a>`).join('')}</div><p class="small muted">公开研究语料中的真人录音。日常对话练话轮，公开讨论练长句、条件和立场。</p></aside>
  <article class="card"><h2>${esc(clip.title_zh)}</h2><p>${esc(clip.intro_zh || clip.context_zh)}</p>${ready ? `<audio id="native-audio" controls preload="metadata" src="/api/v1/authentic/audio/${encodeURIComponent(clip.id)}"></audio>` : '<p class="notice">音频待本地生成。</p>'}<p class="audio-status">${esc(audioDescription)}</p><div class="button-row">${ready ? button('native-download','下载这一段','secondary small',`data-id="${esc(clip.id)}"`) : ''}<a class="btn secondary small" href="#lesson/${esc(clip.lesson_id)}">回到对应规律课</a></div>
  <h3>这次抓住什么</h3><p>${esc(clip.focus_zh)}</p>${tasks ? `<h3>分轮听辨</h3><ol class="native-tasks">${tasks}</ol>` : ''}<h3>先听，再回答</h3><ol>${questions}</ol>
  <label class="form-label" for="native-note">你听到了什么？哪里没听懂？</label><textarea id="native-note" rows="5" maxlength="8000" placeholder="把每轮要点、答案或自己的捷语复述写在这里。"></textarea>${button('native-save','保存这次听辨','primary',`data-id="${esc(clip.id)}"`)}<p class="small muted">记录同步到同一账号。播放次数不作为听懂的判断。</p>
  <details><summary>听完后再看原文、中文与听辨线索</summary>${clip.transcript.map((t,i) => `<div class="sentence"><div><strong>第 ${i+1} 段 · ${esc(t.speaker)} · ${t.start.toFixed(1)}–${t.end.toFixed(1)} 秒</strong> ${seek(segmentId(t,i),'回听这一段')}<p lang="cs">${esc(t.cs)}</p><p>${esc(t.zh)}</p>${t.note_zh ? `<p class="note">${esc(t.note_zh)}</p>` : ''}${t.transcript_issues?.length ? `<div class="small muted">原转写疑点：${list(t.transcript_issues)}</div>` : ''}</div></div>`).join('')}<h3>核对关键点</h3>${list(clip.key_points)}</details>
  ${deep ? `<details><summary>进一步拆解 · ${clip.deep_dive.length} 个要点</summary>${deep}</details>` : ''}${transfer ? `<h3>换个角度，自己说出来</h3>${transfer}` : ''}
  <details><summary>训练范围与相关课程</summary><p>${esc(clip.scope_zh || '用短片段练习真实口语。')}</p><div class="button-row">${(clip.related_lesson_ids || []).map(id => `<a class="btn secondary small" href="#lesson/${esc(id)}">${esc(id)}</a>`).join('')}</div></details>
  <details><summary>这段声音的来源与处理</summary><p>${esc(clip.source.attribution)}</p><p>${esc(clip.source.processing)}</p><p><a href="${esc(sourceUrl)}" target="_blank" rel="noreferrer">查看语料来源</a> · <a href="${esc(licenseUrl)}" target="_blank" rel="noreferrer">${esc(licenseName)}</a></p><p class="small">${esc(clip.source.license_notice_zh || '原录音及转写、片段编辑、中文译注和训练内容按 CC BY-SA 3.0 提供。')}</p></details>
  <h3>之前的听辨记录</h3><div id="native-history">${authenticNotes(clip.id,notes,esc)}</div></article></div>`;
}
