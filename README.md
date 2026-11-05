# 长程项目看板

[打开公开示例看板](https://project-continuity-board.fantasticpopcorn.chatgpt.site)

Codex 插件维护已确认计划、多级里程碑、阶段适用要求和可交接的进展。需要 Python 3.11+，Git 模式另需 Git 和可推送的专用远端。

## 安装

在支持 Codex 自定义 marketplace 的客户端中运行 `codex plugin marketplace add https://github.com/xiahaotian-xingchuan/project-continuity.git`。若当前客户端无法访问托管 Git URL，先克隆仓库，再执行 `codex plugin marketplace add <源码目录的绝对路径>`。在桌面端插件目录中安装 **长程项目看板**。也可直接运行下列命令。插件通过技能在具备本地文件访问能力的会话中调用命令。

## 使用

令 `SCRIPT` 指向安装包中的 `skills/project-continuity/scripts/project.py`。令 `PROJECT` 指向独立项目目录。首次初始化：

```sh
python3 "$SCRIPT" "$PROJECT" init "项目名"
python3 "$SCRIPT" "$PROJECT" propose plan.json
# 核对提案，并取得项目负责人的明确确认后使用返回的 ID
python3 "$SCRIPT" "$PROJECT" confirm PROPOSAL_ID
python3 "$SCRIPT" "$PROJECT" show
python3 "$SCRIPT" "$PROJECT" progress progress.json --revision 2
python3 "$SCRIPT" "$PROJECT" serve
```

计划文件结构示例：

```json
{
  "page": "已有总览 Page 的链接",
  "milestones": [
    {"id":"review","title":"复核阶段","criterion":"所有子项通过复核"},
    {"id":"sample","parent":"review","title":"样本复核","criterion":"形成带证据链接的复核表"}
  ],
  "requirements":[
    {"id":"trace","scope":"review","text":"逐项附证据链接","source":"已确认复核方案"}
  ]
}
```

计划是完整版本，以稳定 ID 对应旧里程碑。要求的 scope 省略或设为 null 表示全项目。可用 progress 文件示例：

```json
{
  "updates":[{"id":"sample","status":"active"}],
  "current":["sample"],
  "next":["复核第一批样本"],
  "blockers":[],
  "pending":["是否补抽样本"]
}
```

状态可为 todo、active、blocked、done。done 需提供 evidence 文本或成果链接。父项完成前须完成全部直接子项。状态修改使用 show 输出的当前修订号，避免旧会话覆盖新进展。propose 输出待确认 ID 和基准修订号；若基准修订变动，重新核对并确认。此确认流程由插件技能执行，命令行调用者自行核验负责人授权。

## 本地保存与 Git 同步

默认仅本地保存。可在本地看板中切换「仅本地保存」和「Git 同步」，打开项目文件夹或复制路径。Git 模式显示仓库地址和分支，并支持手动重试。HTTPS 或标准 Git SSH 地址可尝试跳转至对应仓库网页。启用 Git 前准备一个专用且空的远端，或先克隆已有的专用项目仓库。每台编辑设备设置自己的 Git 身份及认证。执行：

```sh
python3 "$SCRIPT" "$PROJECT" configure-git REMOTE_URL BRANCH
python3 "$SCRIPT" "$PROJECT" sync
python3 "$SCRIPT" "$PROJECT" configure-local
```

配置保存在项目目录的本地文件中。Git 同步只暂存项目状态及交接文件，检查待推送历史文件范围，并正常推送。项目仓库的分支须与指定分支一致。远端分叉时，在专用项目仓库审阅两份状态，人工解决后再执行 sync。同步失败保留本地记录，可重试。切回本地模式不删除已推送历史。

接续智能体先读取 `PROJECT_STATUS.md`，再读 `project-state.json` 核对当前修订及已确认计划。若两文件修订号因进程中断不一致，以 JSON 为准，并运行 sync 修复交接文件。Git 接续先获取目标分支最新提交。新克隆默认是本地模式，需要显式配置写入远端。待确认提案及本地同步状态只留在发起设备；跨设备待办可写入进展的 pending 列表。

打开 serve 输出的本地 URL 即可查看实时看板。支持访问该 localhost 地址的桌面内置浏览器可以与会话分屏。浏览器每三秒读取已保存数据。托管 Sites 版本展示虚构示例，真实项目看板由本地服务提供。

## 测试

```sh
python3 -m unittest discover -s tests -v
```

## 在线版 0.2.0

在线版将项目保存在私有 Sites 数据库中，网页和桌面调用同一套工具。服务端和界面实现位于 online/，基于 Sites Vinext starter。部署后会生成个人在线插件，提供打开看板、读取项目和更新项目三个工具。通过项目入口打开实时界面。

已验证在线插件读写、双浏览器窗口自动刷新、修订冲突保护。桌面客户端尚待实机验证。在线 Git 需要在站点运行时配置 GITHUB_TOKEN，文件导出已实现。正式插件市场送审仍需发布主体认证。

## 成果文件保存与同步 0.3.0

保存对象包括已确认的总纲、治理规则及报告原始文件。在线版以版本、确认依据和 SHA-256 管理文件，并展示文件下载链接。Git 同步将实际成果文件提交至选定仓库目录。新增长期运行的本地保存连接程序 online/bridge/save_deliverables.py，按项目指令保存已确认文件后自动获取并写入指定本机目录，核对内容并报告具体路径。保留人工修改并报告冲突。

实际电脑目录、成果仓库地址和相应授权需由使用者配置。10 项自动化验证已通过，其中 Git 文件内容验证采用模拟接口；实际私有成果文件上传尚待明确授权。
