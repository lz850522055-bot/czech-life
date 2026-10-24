# 来源、原创范围与第三方依赖

核验日期：2026-10-22。本工程的代码、中文讲解、捷语课文、对话、任务、题目和样例答案为本轮新制作。新闻、会议、报价、公交安排、人物与业务案例是原创教学情境，不代表实际新闻、即时价格或正式办事要求。没有把外部教材整章复制进工程，也没有使用旧项目数据库或账号。

## 语言与能力框架

CEFR是能力描述框架。本工程把语法和情境分配到各级，是自己的教学编排；不能说成欧洲委员会官方强制语法目录，也不承诺完成86课等于达到C2所有真实能力。

| 第一方资料 | 核验用途 | 对应记录 |
|---|---|---|
| [欧洲委员会等级说明](https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions) | 能力等级、跨技能组织、非课程认证 | 各级目标与测评 |
| [CEFR Companion Volume](https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-descriptors) | 互动、转述、语用等描述的组织原则 | sources各分段核验记录 |
| [ÚJČ Internetová jazyková příručka](https://prirucka.ujc.cas.cz/) | 捷语音系、词形、语序、数词、语域和适用边界 | 逐课sources与核验说明 |
| [CzechEncy](https://www.czechency.org/) | 高阶语法、语用、篇章与风格概念 | 高阶来源与未审校说明 |

实际打开的具体页面、成功核验点与不能打开的页面分别记在 `content/sources/foundation-verification.md`、`intermediate-verification.md`、`advanced-verification.md`。课程中每条来源说明核验的是规则或编排，不冒充外部机构认可了原创例句。没有逐句母语审校，不能以来源列表替代内容质量工作。

## 技术

| 依赖/资料 | 使用方式 | 随包情况 |
|---|---|---|
| Node.js 24.17.0/24.19.0 | 原生HTTP、crypto、SQLite和测试；[目标版本官方SQLite文档](https://nodejs.org/download/release/v24.17.0/docs/api/sqlite.html) | 不随包包含Node二进制；应用运行零npm依赖 |
| SQLite | Node内置绑定、WAL与一致性backup | 无额外数据库服务 |
| Playwright 1.51.1 | 浏览器验收驱动；测试package-lock锁定 | 仅声明，不附node_modules或浏览器 |
| Chromium 133.0.6943.0 / @sparticuz/chromium 133.0.0 | 云环境实际浏览器验收；官方默认下载不可用时的独立测试运行时 | 不随包分发 |
| Noto Sans SC测试字体 | 云环境截图显示中文；应用仍使用系统字体 | 不随包分发测试字体 |
| MDN | Service Worker、MediaRecorder、SpeechSynthesis行为核验 | 链接与自行编写实现 |
| [Tailscale Funnel官方说明](https://tailscale.com/kb/1223/funnel) 与 [CLI](https://tailscale.com/docs/reference/tailscale-cli/funnel) | 本地部署候选、状态读取、独立路由及撤回说明 | 未安装、未登录、未开通用户入口 |

## 音频来源

本轮使用 [OHF-Voice Piper](https://github.com/OHF-Voice/piper1-gpl) 1.3.0、ONNX Runtime1.21.0 和 `cs_CZ-jirka-medium` 生成原创捷语脚本的音频。Piper仓库标注GPLv3；[模型卡](https://huggingface.co/rhasspy/piper-voices/blob/main/cs/cs_CZ/jirka/medium/MODEL_CARD) 把训练数据列为CC0，记录捷语、单说话者和22,050Hz。模型卡的训练沿革包含从其他语言模型微调的说明，但实际使用的语言配置明确为捷语cs，未启用英语朗读回退。

本包仅包含原创脚本的生成音频、元数据、制作与校验脚本，不包含Piper引擎、模型、FFmpeg或它们的第三方二进制。模型、引擎和训练数据的权利是不同层次；这里如实记录来源和其声明，没有代第三方作额外授权，也没有把机器解码检查当真人声音听审。日后商业化时应保留实际声音来源和录音授权链。

## 隐私与交付内容

工程ZIP不含用户账号、真实密码、API密钥、会话、私人学习数据库或录音。测试只有明确标注的临时fixture账号和仿真麦克风数据，测试目录在结束后移除；截图中没有交付可用恢复码。运行后的私有数据和控制口令不属于源码包。
