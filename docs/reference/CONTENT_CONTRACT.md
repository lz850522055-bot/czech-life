# 统一教材契约（本轮实现）

每课一个 UTF-8 JSON：`content/lessons/{level}/{unit_id}-L01.json`。本轮覆盖骨架所有 86 个单元，各单元至少一课，课内按听读、规律、主动练习、迁移拆步骤。所有内容原创，来源只作语言规则与能力框架依据；不得声称母语审校已完成。

```json
{
  "id":"A1-U01-L01", "level":"A1", "unit_id":"A1-U01", "order":1,
  "version":"2026.10.22.1", "title_zh":"具体课名", "title_cs":"Český název",
  "prerequisites":["Pre-A1-U06-L01"], "can_do":["可操作能力"],
  "scene":"日常交往", "skills":["listening","speaking","reading","writing","interaction","mediation"],
  "knowledge_points":["gender"], "intro_zh":"中文任务导入",
  "lesson_text":[{"id":"s01","cs":"Dobrý den.","zh":"您好。","note_zh":"语境/理解提示"}],
  "grammar":[{"id":"gender","rule_zh":"一句普通中文规律","detail_zh":"准确详细解释及边界","examples":[{"cs":"...","zh":"..."}],"pitfalls":["易错点"],"exceptions":["例外/限制"],"term":"术语"}],
  "vocabulary":[{"lemma":"den","pos":"名词，阳性无生","forms":"dne; dny","meaning_zh":"一天","collocation":"dobrý den","example_cs":"Dobrý den, pane Nováku.","example_zh":"您好，诺瓦克先生。","confusion_zh":"易混点"}],
  "listening":{"script":[{"cs":"...","zh":"..."}],"focus_zh":"听力重点","source":"original"},
  "pronunciation":{"focus_zh":"发音位置与操作步骤","contrast":[{"a":"...","b":"...","note_zh":"区别"}],"task_zh":"可录音跟读任务"},
  "exercises":[{"id":"A1-U01-L01-E01","type":"choice","prompt_zh":"题目","stimulus_cs":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."}],"answer":"a","accepted_answers":[],"explanation_zh":"为什么、常见错因与纠正","scoring_basis":"正确答案/量规","skill_ids":["reading"],"knowledge_points":["gender"],"error_category":"comprehension"}],
  "transfer_task":{"prompt_zh":"换条件独立完成的任务","model_answer_cs":"示范答案","rubric":["判据"]},
  "review_links":["Pre-A1-U06-L01"],
  "sources":[{"source_id":"LANG02","url":"https://prirucka.ujc.cas.cz/","scope":"具体核对规则","verification":"规则查核/例句原创未逐句母语审校"}],
  "content_status":"authored_crosschecked_not_native_reviewed",
  "quality_notes":["本课核验范围与实际限制"]
}
```

练习 type 可用 `choice`（含听选/辨音，prompt 写清，添加 audio_text_cs）、`fill`、`order`（options 数组为字符串块，answer 完整句）、`correct`（明确单一改错）、`writing`、`speaking`、`interaction`、`mediation`。fill/correct/order 的 accepted_answers 必须显式列出可接受形式；不能因答案不同就断言所有开放回答错误。开放题 answer 存示范答案，rubric 数组存 3–5 条判据，scoring_basis 明确人工自评/待反馈，系统不给假分。错误类别限 pronunciation/spelling/inflection/meaning/collocation/word_order/comprehension/fluency。所有题必须有 explanation_zh 和 answer，至少 10 道独立题，建议 12 道，并有主动组织语言、听力、理解与迁移。避免模板机械换名词。可以增加 useful fields，不删除必需字段。

每单元独立 assessment JSON `content/assessments/{unit_id}.json`：id=`{unit_id}-CHECK`, kind=`unit`, level, unit_id, title_zh, version, unseen_text=[{cs,zh}], exercises（同题型契约，3道以上，id=`{unit_id}-CHECK-E01`）, rubric, remediation=[{condition_zh,lesson_ids,action_zh}]。练习材料与课文不同。

每级单独 `content/assessments/{level}-FINAL.json`：id=`{level}-FINAL`, kind=`level`, level, title_zh, version, unseen_text, exercises（至少六道，覆盖六种能力；实际听力需 audio_text_cs；开放题量规和典型表现），rubric 与 remediation。不把完成评测叫官方认证。

来源事实核查记录各自写入 `content/sources/{levels}-verification.md`，列访问日期、具体URL、证据能支持什么、没核验什么。结构与媒体清单由 root 汇总生成；作者无需写 audio_refs，root 自动按句生成稳定ID与缺失音频清单。不要制作假音频或伪造审校。

词数目标作为深度下限而非能力认证：Pre-A1按声音序列；A1 80–160词，A2 140–230，B1 220–350，B2 300–450，C1 450–650，C2 550–850。高阶课至少多段连贯语篇和较深入中文讲解，允许分多文本。逐句/意义单元译文与正文对应。
