# 课程声音、生成与替换

## 本包实际声音

播放使用随包的捷语 MP3，不要求用户设备预装捷语 TTS。正文、独立听力、词汇例句、带声音的题目和发音对比各有脚本与轨道；正常/清晰慢速分别生成。句子和段落通过采样数建立时间定位，多处引用共用同一文件，主动下载时仅保存本课所需文件。

生成引擎为 Piper 1.3.0，模型 `cs_CZ-jirka-medium`，22,050Hz单声道、64kbps MP3。模型配置明确 `espeak.voice=cs`；代码遇到非捷语配置会拒绝生成，不使用英语朗读。慢速用 `length_scale=1.18` 重新合成，播放率为1，未作后期劣化拉伸。界面“正常速度”指该捷语合成声音的正常版本，不等于真人自然访谈或C2快速多人对话。

准确数量和实际时长看 `evidence/audio-validation.json`；逐条脚本看 `content/audio/SCRIPT_IDS.csv`；缺失看 `MISSING_AUDIO.csv`。文件有实际解码、非静音、哈希与时间边界检查；这些检查不能证明捷语读音、重音、分词、自然度和语用全部正确。**尚未进行整套逐句捷语母语听审。除单声线合成教材外，现有22段真人原声素材；全部高级题材、自然快速语流和地域口音覆盖仍未完成。**

## 当前媒体与高级听力入口（2026-10-23）

当前545条合成音轨对应1090个正常/慢速文件，另保留14个历史版本文件供旧教材记录使用。当前引用与历史文件分开计数，不把句段切点重复算成实体文件。真人听辨另有22段原声（10段通话窗口、12段公开讨论），合计1119.814秒；部分窗口来源重叠，该总数不是去重后的原始录音总时长。

B2、C1、C2的40课可从“先听再答”播放完整课文。B2-U06、C1-U05、C2-U12有指定听后任务与逐段证据；C1综合测评使用第3题、第4题的两段会后更新，未将505词的阅读材料冒作该听力音源。其余高级课可以保存自己的听后概述。全文、译文和解析先收起，提交后主动展开；正常与清晰慢速按各自时间边界回听。完整课文仍是新编合成训练，不标成真人录音。

准确当前数量见 `docs/CONTENT_STATISTICS.md`；每条真人素材的来源、许可、转写和摘要见 `content/authentic/manifest.json`。以下带明确日期的旧记录保留当时事实，不代表当前总数。

## 文件组织

| 文件 | 作用 |
|---|---|
| `scripts.json` | 原创文本、稳定track ID、课程/版本、段落及分句、文本SHA256 |
| `files/*.mp3` | 实际正常与慢速媒体，文件名含文本摘要 |
| `track-metadata/*.json` | 每轨可重用检查点、逐句/段落正常与慢速时间、模型与音频摘要 |
| `manifest.json` | 服务器播放索引；一个物理轨道与多个asset_id引用 |
| `generation-report.json` | 实际生成/复用/失败和超时重试状态 |
| `MISSING_AUDIO.csv` | 未生成引用，只有表头表示当前无缺失项 |

`audio_refs` 是每课可直接加载的引用，不把音频二进制写进JSON。新版教材使用新版track ID；定稿脚本保留旧版本索引，备份也保留历史正文引用的媒体。

## 从文本重新生成

应用本身不依赖 Python、Piper、FFmpeg 或模型。只有重新制作声音才需要这些工具。请在E盘建立独立虚拟环境和模型目录，临时目录、pip缓存也设在本项目E盘，避免改动全局Python环境。

```powershell
$root = (Get-Location).Path
Set-Location $root
New-Item -ItemType Directory -Force cache\tmp, cache\pip, cache\models | Out-Null
$env:TEMP = Join-Path $root 'cache\tmp'
$env:TMP = $env:TEMP
python -m venv cache\audio-venv
& cache\audio-venv\Scripts\python.exe -m pip install --cache-dir cache\pip -r scripts\audio-requirements.txt
node scripts\build-audio-scripts.mjs
& cache\audio-venv\Scripts\python.exe scripts\generate-audio.py --model cache\models\cs_CZ-jirka-medium.onnx --ffmpeg 'ffmpeg'
node scripts\finalize-audio.mjs
python scripts\validate-audio.py
node scripts\validate-content.mjs --verify-media-hashes
```

FFmpeg路径是明确示例，须指向本机确有的文件；验证脚本还要求 `ffprobe` 可执行。上述Windows生成步骤未在本轮运行。本轮实际生成使用Python3.12.14、Piper1.3.0与ONNX Runtime1.21.0，依赖锁定在 `audio-requirements.txt`；目标Python3.12.10的生成环境尚未实测。

模型和配置分别来自官方模型仓库：

- [捷语模型目录](https://huggingface.co/rhasspy/piper-voices/tree/main/cs/cs_CZ/jirka/medium)
- [模型卡](https://huggingface.co/rhasspy/piper-voices/blob/main/cs/cs_CZ/jirka/medium/MODEL_CARD)
- 模型SHA256：`cbd5c900acacc8e8cbecd64347abb8de39c00a9d3104bed06fee92e4f319efc8`
- 配置SHA256：`fb38b1799b7354808227c065efa97b1ffa2b0cde59505babb56a36d35af9c637`

下载后应比对上述摘要，不把HTML错误页当模型。引擎及模型权利见 `SOURCES_AND_LICENSES.md`；本包不分发引擎或模型二进制。

生成器逐轨运行隔离进程，对卡住的本地调用设超时并重试，已成功的摘要匹配轨道直接复用。不能因为退出码为0就假设全部正常，应同时检查生成报告、缺失表和解码报告。不要在正在制作/变动的课程文件上做最终验收。

## 导入人工重录或另一捷语引擎的文件

为了不改写历史，请先停止本项目，对要改的课程提高版本，重新建立scripts。准备一个JSON描述文件并使用 `node scripts/import-audio.mjs descriptor.json --dry-run` 校验；去掉 `--dry-run` 才写文件。描述项：

```json
{
  "track_id": "A1-U01-L01--2026.10.22.2--text",
  "normal_file": "真实存在的正常音频文件.mp3",
  "slow_file": "真实存在的慢速音频文件.mp3",
  "voice_label": "实际录音来源与声音标识",
  "rights_note": "说明使用者对该录音的授权或自录情况",
  "duration_seconds": 12.4,
  "slow_duration_seconds": 15.1,
  "cues": [
    {
      "text": "须与对应脚本单元的捷语文本完全一致",
      "start": 0,
      "end": 12.1,
      "slow_start": 0,
      "slow_end": 14.8,
      "sentences": [
        {"text":"与脚本part一致","start":0,"end":12.1,"slow_start":0,"slow_end":14.8}
      ]
    }
  ]
}
```

这段是格式示例，不能直接当真实轨道使用。cues数量和文本必须与scripts精确对应；时长和时间点需要实际测量。已在SQLite发布的同版本导入会被拒绝。随后运行finalize、实际解码和听审，再用内容管理导入新版教材。当前全量解码校验器针对本包22,050Hz单声道MP3；导入其他格式时应同步扩展明确的校验规则，不能把未校验文件标通过。

## 缺失声音与录音

文件缺失时才尝试系统捷语TTS。`getVoices()`只接受cs或cs-CZ，优先本地声音；离线只有联网声音时明确拒绝。不会改用默认英语声音。用户系统语音试播与课程文件播放是两个独立能力。

录音使用MediaRecorder，按浏览器支持选择WebM/MP4/Ogg。每段最多10分钟或约18MiB，先保存本机再上传服务器；可即时回放并在能力页回听。浏览器测试使用仿真麦克风，不能据此宣称已验证用户真机麦克风、扬声器、蓝牙耳机或声学质量。

依据：[Piper Python API](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_PYTHON.md)、[Piper引擎仓库](https://github.com/OHF-Voice/piper1-gpl)、MDN [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) 与 [getVoices](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices)。核验日期2026-10-22。

## 文件落盘与续作校验

最终生成器不仅按文字摘要和模型摘要判断可复用，还重新读取正常/慢速文件核对已记录SHA-256与最小有效字节数。编码先写同目录的临时MP3，完成后fsync，再原子替换；元数据也以临时文件fsync后替换。父进程在工作进程退出后再次核对两个声音摘要，再把该轨记为完成。最终发布仍须全文件解码与切点检查，不能用“进程退出0”代替媒体完整性。

本轮最终化曾检出7个声音摘要不一致（含空/截断文件），保留在`evidence/audio-hash-first-failure.json`，重制记录在`evidence/audio-generation-repair.log`。以`evidence/audio-validation.json`和最终manifest为交付依据，不把此前失败文件当作已通过。

七级分支节点从`content/scenarios.json`加入统一生成脚本，与关联课一起下载。场景音轨引用同时携带场景ID、场景版本与节点ID；接口还比对节点原文，避免升版后读到旧句。更改声音文本时同时提升关联课发布版本及场景版本，并保留旧资源。


历史记录（2026-10-22）：当时真人听辨有10段真实通话窗口，合计871.27秒、234条原文与译注；其中7个较长窗口共773.23秒，来自7个来源会话。新增三轮听辨、逐题原文证据、深度解析、复述和立场转换，以及逐句定位播放。全部音频已在本机生成并完整解码；不是把缺失音频列在清单里假交付。来源和完整边界见 docs/真人听辨.txt。
