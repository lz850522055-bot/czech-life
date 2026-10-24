![捷语人生：在游戏里学捷语，探索布拉格，开始新的生活。愿景效果图。](docs/media/hero-vision.png)

# 捷语人生 · Czech Life

**在游戏里学捷语，提前开始你的捷克生活。** [English](README.md)

一个为零基础玩家设计的开源语言冒险：从辨别第一个声音开始，沿着真实布拉格的道路探索，问路、坐车、购物、结识邻居、经营自己的虚拟小店。语言、城市和生活相互连接，而不是把单词题目贴在地图上。

先做好布拉格的一个街区，再逐步扩展到更多街区和捷克生活场景。长期愿景包含贸易、买地建造、经营和多人互动；钱币与房产均为虚拟玩法。

## 当前是能运行的早期原型，邀请大家一起完善

已有声音关卡、首个街区故事、规则学习、复习、音频、存档及初步经营；细绘户外只有两块区域，地图仍有卡顿与缺陷。零基础至C2已有教材结构和内容，尚未完成逐句母语审校，也不代表玩完就通过C2。**联网玩法尚未实现。**

![语言与城市探索概念图](docs/media/learn-explore-concept.png)

上图是目标效果与美术方向；实际原型见[当前状态与实拍](docs/CURRENT_STATE.md)。

![未来经营和联机愿景，尚未全部实现](docs/media/community-economy-vision.png)

## 下载运行

安装Node.js 24+、Git，确保系统有tar。

```sh
git clone https://github.com/lz850522055-bot/czech-life.git
cd czech-life
npm run assets:fetch
npm start
```

首次运行资源约下载1.01GB，解压约1.13GB，验证SHA-256后安装。不需要买域名或开通付费API。打开终端给出的本机网址，用本机显示的初始化口令创建账号，再进入 `/game/?district=small-town`。没有公开默认密码。

[运行说明](docs/GETTING_STARTED.md) · [路线图](docs/ROADMAP.md) · [贡献指南](CONTRIBUTING.md) · [报告问题](https://github.com/lz850522055-bot/czech-life/issues/new/choose)

## 希望你帮忙的地方

地图与手机交互流畅度、捷语母语审校、将语言知识变成任务、细绘2D街景、真实城市数据与中捷地名、英文界面和无障碍。可以提Issue，也可以Fork后提交PR；维护者审查后决定是否合并。Git记录每次提交，后续可比较、追踪和回退。

代码采用[MIT](LICENSE)，允许修改和商用并保留署名；第三方地图和录音继续遵守各自许可，见[来源与许可](THIRD_PARTY_NOTICES.md)。宣传图标为概念/愿景，不冒充成品截图。项目由AI辅助建立，正在邀请真实玩家、老师和开发者一起打磨。
