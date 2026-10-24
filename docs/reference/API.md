# 同源 API v1

基础路径 `/api/v1`，默认本机 `http://127.0.0.1:8765`。除状态、初始化、登录/恢复、健康检查外都需服务端会话 Cookie。所有写请求均要求准确同源 `Origin`；登录后写请求还要求 `X-CSRF-Token`。不开放跨域 CORS。

| 方法与路径 | 输入/输出要点 |
|---|---|
| GET `/health` | 应用身份、API 版本、UTC 时间；不泄露数据库路径和账号 |
| GET `/auth/status` | 是否初始化、当前用户及本会话 CSRF |
| POST `/auth/setup` | `setup_token,username,password`；随机本地口令；返回只展示一次的恢复码 |
| POST `/auth/login` | `username,password`；创建独立会话 |
| GET `/auth/me` | 账号、偏好、CSRF；无密码哈希 |
| POST `/auth/logout` | 撤销本会话 |
| POST `/auth/password` | `old_password,new_password`；撤销全部会话 |
| POST `/auth/recover` | `username,recovery_code,new_password`；轮换恢复码与全部会话 |
| GET `/curriculum` | 7 级、86 单元、当前课/测评摘要和内容修订摘要 |
| GET `/lessons/:id?version=...` | 当前或指定历史 JSON 快照 |
| GET `/vocabulary?q=...&level=...` | 词形、搭配、例句、出处课及音频引用；最多显示100项并给总数 |
| POST `/events` | `events:[...]`，1–100项；逐项返回 `ok,seq,duplicate,feedback,received_at` 或错误 |
| GET `/sync?after=0&device=...` | 最多500条新事件、cursor、has_more；游标为服务端seq |
| GET `/progress` | 已接受记录计数、位置、最近回答、能力证据、复习、笔记、录音、推荐 |
| PUT `/settings` | 字号、兴趣、时区、讲解细度、意愿、音量/速度、间隔与提醒 |
| PUT `/recordings/:eventId` | 真实音频二进制；20MiB上限、格式头检查、ID与文件SHA256去重 |
| GET `/recordings/:id` | 本账号录音，支持 Range，不缓存 |
| GET `/audio/:assetId?speed=slow` | 课程正常/慢速实际文件；缺失404；支持 Range |
| GET `/content/report` | 各级真实课/题/字词、缺课与媒体统计 |
| POST `/content/import` | `{item,dry_run:true/false}`；同版本不同内容409 |
| GET `/export` | 完整事件与版本引用JSON；二进制录音在完整备份内 |
| POST `/backups` | 一致性备份并校验；返回项目备份ID与核验统计 |
| GET `/ai/status` | 是否配置、日限额、真实报告token与配置价格估算 |
| POST `/ai/feedback` | `lesson_id,content_version,exercise_id,answer`；未配置503，不制造评分 |

## 事件对象

```json
{
  "event_id": "由浏览器生成的UUID",
  "device_id": "本设备随机ID",
  "kind": "exercise",
  "lesson_id": "A1-U01-L01",
  "exercise_id": "A1-U01-L01-E01",
  "content_version": "2026.10.22.1",
  "answer": "具体回答或选择ID",
  "assisted": false,
  "occurred_at": "2026-10-22T09:00:00.000Z"
}
```

客户端不发送可直接采信的 user_id、score 或 mastery。用户由会话决定，能力/知识点由该版本练习决定。开放题 `score:null`。同 ID 内容冲突保留原记录；混合批次返回每项结果，不能因为 HTTP200 就丢弃整批队列。

普通事件支持 exercise、position、lesson_complete、feedback、note、self_review、transfer。recording 只由真实上传入口生成，不能经 `/events` 伪造。日期需合法、不早于2000年且最多超前5分钟；校验失败原本机事件留存供修正设备时间/导出排查。

录音头：`X-Lesson-Id`、`X-Content-Version`、`X-Device-Id`、`X-Occurred-At`。接受 audio/webm、audio/ogg、audio/mp4、audio/wav；浏览器按自身支持协商。上传重试复用 eventId。

## 错误与管理口

统一错误对象包含 `error` 与可选 `code`。常见状态400参数、401未登录、403来源/CSRF/恢复码错误、404资源缺失、409版本或事件冲突、413太大、415格式不支持、429限额、503 AI未配置。

`POST /__control/stop` 只供本项目 Windows 本机停止脚本使用，要求回环 Host、同源 Origin 和本项目 `cache/control-token.txt` 的 `X-CZ-Control`。配置的公网入口不允许该口。它不是浏览器用户功能；没有“杀死所有Node”操作。

## 分支对话与替代帮助

`GET /api/v1/scenarios` 返回已登录用户可选的七级场景索引；`GET /api/v1/scenarios/:id` 返回实际节点、选择、反馈、场景版本、关联课程版本及严格匹配ID/版本/节点原文的音频引用。没有匹配文件时不配旧音轨，播放模块按明确的捷语TTS能力处理。两种接口均需有效会话。

分支选择使用既有`transfer`事件保存JSON文字快照，含`activity=dialogue_branch`、`scenario_id`、`scenario_version`、节点、当时对方原话、所选回应、沟通反馈及下一节点。服务器不给分，不计入`mastery_evidence`，仍按事件ID去重。选择保存后可以在原始导出中追溯；当前路径和回放的继续位置存于本设备按账号和场景版本分开的IndexedDB，未实现跨设备恢复同一次分支运行。备份保留场景图文件及已同步选择事件。

替代提示由纯前端`coaching.js`按观察、对比、缩小任务三轮生成。它从准确关联的已有规则/例句取材，无法定位就改用题型操作；不复制解析或答案作为另一种提示。点过提示的当前题会标记`assisted=true`，服务端不计独立完成证据。
