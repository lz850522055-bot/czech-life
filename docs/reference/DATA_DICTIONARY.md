# 数据字典与追溯

实际 SQL 以 `app/migrations/001.sql` 为准；以下解释字段用途与不变量。

| 表 | 主键/唯一性 | 保存内容 |
|---|---|---|
| users | id；username唯一 | scrypt密码、恢复码哈希、创建UTC时间、JSON偏好 |
| sessions | token_hash | 用户、CSRF、创建与过期时间；客户端只有随机Cookie |
| curriculum_units | id | 单元、级别、中文名、顺序与先修单元 |
| content_versions | content_id+version | 不可变JSON的规范化SHA256、导入时间 |
| lessons | id+version；每ID一个active | 课/单元测评/级别测评及完整内容快照 |
| skills | id | listening/speaking/reading/writing/interaction/mediation |
| lesson_skill_links | lesson_id+version+skill | 课程版本与能力关联 |
| exercises | id+version | 课内原题快照、标准答案/样例、知识点和评分依据 |
| attempt_events | seq；user_id+event_id唯一 | 不可变原始事件、设备、课程版本、答案、反馈、发生/接收UTC、请求摘要 |
| mastery_evidence | id | 原事件、能力、知识点、nullable分数、独立标志、错因、证据类型 |
| review_queue | user+skill+knowledge_point | 从全部已接受客观证据重建的间隔和到期UTC |
| recordings | id；user+event唯一 | 文件相对路径、格式、字节、SHA256、课程版本；二进制不放SQLite |
| notes | id | 关联课程、文本、事件与UTC |
| sync_cursors | user+device | 设备最新已读取seq，仅增不减 |
| ai_usage | id | requested/success/failed、实际供应商token、可空费用估算 |
| schema_migrations | version | 已应用迁移及时间 |

## 文件目录

`data/czech-study.sqlite` 为主库，运行时可有 `-wal`/`-shm`。`uploads/<userId>/<recordingId>.<ext>` 为不可变录音；`backups/backup-.../` 是自含内容版本和资源的一致性快照。`logs/` 和 `cache/` 为本项目独立数据。初次口令在创建账号后删除；控制口令仅用于本机精确停止。

`content/lessons/<level>/*.json`、`content/assessments/*.json` 为逐课文件；`units.json` 是86单元骨架。`content/audio/files/` 是实际文件，`manifest.json` 是播放/备份索引；`scripts.json`、`SCRIPT_IDS.csv`、`track-metadata/` 用于重建和核验。`MISSING_AUDIO.csv` 是逐项缺失表，有表头但无数据行表示当前清单无缺失，而不是没有脚本。

## 版本与删除原则

已发布课程版本不能原地改写。事件保留当时 `content_version`，评分使用相同版本，不随新版答案自动变更。历史的 JSON 和音频必须随备份保留。删除浏览器下载只释放该设备缓存，不删除服务器事件；退出前清理待同步内容会明确提示，尚未上传的浏览器数据不能由服务器备份还原。

规范化比较保留捷语变音符，只统一Unicode NFC、大小写、空白与句末句号/问号/感叹号。`mame` 不等同 `máme`。开放表达不做字符串相等打分，其他合理表述由量规核对。

备份 `backup-manifest.json` 逐文件记录相对路径、bytes、sha256，拒绝绝对路径、`..`、符号链接。独立恢复还检查 SQLite integrity_check、foreign_key_check 和关联录音。完整备份含私人学习数据，应由使用者保管。
