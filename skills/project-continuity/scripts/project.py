"""Versioned project handoff and local dashboard."""
import argparse
from contextlib import contextmanager
import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import secrets
import sys
import subprocess
import tempfile
from urllib.parse import urlsplit
from uuid import uuid4

STATE = "project-state.json"
STATUS = "PROJECT_STATUS.md"
PROPOSAL = ".project-proposal.json"
CONFIG = ".project-config.json"
SYNC = ".project-sync.json"
STATES = ("todo", "active", "blocked", "done")
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}\Z")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read(path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write(path, content):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False, mode="w",
                                     encoding="utf-8") as stream:
        temp = Path(stream.name)
        try:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            temp.unlink(missing_ok=True)
            raise
    try:
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def save(path, value):
    write(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


@contextmanager
def locked(root):
    lock = root / ".project-lock"
    try:
        lock.mkdir()
    except FileExistsError:
        raise ValueError("项目正由另一个进程写入。若上次异常退出，确认无写入进程后再删除 .project-lock。")
    try:
        yield
    finally:
        lock.rmdir()


def require_text(value, name):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} 需要非空文本")
    return value


def require_id(value):
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise ValueError("ID 须为 1–64 位字母、数字、下划线或连字符")
    return value


def index(items):
    result = {}
    for item in items:
        key = require_id(item["id"])
        if key in result:
            raise ValueError(f"重复 ID {key}")
        result[key] = item
    return result


def ancestors(nodes, key):
    seen = set()
    while key is not None:
        if key in seen or key not in nodes:
            raise ValueError(f"里程碑父级无效或存在循环 {key}")
        seen.add(key)
        yield key
        key = nodes[key].get("parent")


def text_list(items, name):
    if not isinstance(items, list):
        raise ValueError(f"{name} 需要列表")
    for item in items:
        require_text(item, name)


def validate(state):
    nodes = index(state["milestones"])
    progress = state["progress"]
    for item in nodes.values():
        require_text(item["title"], "里程碑名称")
        require_text(item["criterion"], "完成标准")
        tuple(ancestors(nodes, item["id"]))
        if item["status"] not in STATES:
            raise ValueError("无效里程碑状态")
        if item["status"] == "done":
            require_text(item.get("evidence"), "完成依据")
            if any(child.get("parent") == item["id"] and child["status"] != "done"
                   for child in nodes.values()):
                raise ValueError("须先完成子里程碑")
    for rule in index(state["requirements"]).values():
        require_text(rule["text"], "要求")
        if rule.get("scope") is not None and rule["scope"] not in nodes:
            raise ValueError(f"要求的适用范围不存在 {rule['scope']}")
    active = progress["current"]
    if not isinstance(active, list) or any(key not in nodes or nodes[key]["status"] not in
                                          ("active", "blocked") for key in active):
        raise ValueError("当前里程碑须为进行中或受阻")
    for field in ("next", "blockers", "pending"):
        text_list(progress[field], field)


def applicable(state):
    nodes = index(state["milestones"])
    scopes = {parent for item in state["progress"]["current"] for parent in ancestors(nodes, item)}
    return sorted((rule for rule in state["requirements"]
                   if rule.get("scope") is None or rule["scope"] in scopes),
                  key=lambda rule: rule.get("scope") is None)


def line(value):
    return str(value).replace("\r", " ").replace("\n", " ")


def handoff(state):
    nodes = index(state["milestones"])
    progress = state["progress"]
    rows = [f"# {line(state['title'])}", "",
            f"项目 ID：{state['id']} · 修订 {state['revision']} · {state['updated']}", "",
            "计划及历史：[project-state.json](project-state.json)"]
    if state["page"]:
        rows.append(f"项目总览参考：{line(state['page'])}")
    sections = {
        "当前阶段及里程碑": [" → ".join(line(nodes[key]["title"]) for key in
                                      reversed(tuple(ancestors(nodes, item))))
                             for item in progress["current"]],
        "已完成及依据": [f"{line(m['title'])} · {line(m['evidence'])}"
                         for m in nodes.values() if m["status"] == "done"],
        "下一步": progress["next"], "阻塞": progress["blockers"], "待确认事项": progress["pending"],
        "当前适用要求": [
            f"{line(nodes[r['scope']]['title']) if r.get('scope') else '全项目'} · {line(r['text'])}"
            + (f" · 来源 {line(r['source'])}" if r.get("source") else "") for r in applicable(state)]
    }
    for title, items in sections.items():
        rows.extend(("", f"## {title}", ""))
        rows.extend(f"- {line(item)}" for item in (items or ["暂无"]))
    return "\n".join(rows) + "\n"


def git(root, *args, check=True):
    return subprocess.run(["git", "-C", str(root), *args], text=True, capture_output=True,
                          check=check, timeout=25, env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})


def sync(root, state):
    config = read(root / CONFIG)
    result = {"status": "local", "revision": state["revision"]}
    if config:
        result["status"] = "pending"
        save(root / SYNC, result)
        try:
            branch = config["branch"]
            if git(root, "symbolic-ref", "--short", "HEAD").stdout.strip() != branch:
                raise ValueError("当前分支与绑定分支不同")
            git(root, "add", "--", STATE, STATUS)
            if git(root, "diff", "--cached", "--quiet", "--", STATE, STATUS, check=False).returncode == 1:
                git(root, "commit", "--only", "-m", f"Project revision {state['revision']}",
                    "--", STATE, STATUS)
            commit = git(root, "rev-parse", "HEAD").stdout.strip()
            remote = config["remote"]
            ref = f"refs/heads/{branch}"
            published = git(root, "ls-remote", "--heads", remote, ref).stdout.strip()
            if published:
                git(root, "fetch", "--no-tags", remote, ref)
                base = git(root, "rev-parse", "FETCH_HEAD").stdout.strip()
                if git(root, "merge-base", "--is-ancestor", base, commit, check=False).returncode:
                    result["status"] = "conflict"
                    raise ValueError("远端已分叉。请在专用项目仓库人工合并后重试。")
                paths = git(root, "log", "--format=", "--name-only", f"{base}..{commit}").stdout
            else:
                paths = git(root, "log", "--format=", "--name-only", commit).stdout
            if set(paths.split()) - {STATE, STATUS}:
                raise ValueError("待推送历史含其他文件，请使用专用项目仓库")
            git(root, "push", remote, f"{commit}:{ref}")
            result["status"] = "synced"
            result["commit"] = commit
        except (subprocess.SubprocessError, OSError, ValueError) as error:
            result["message"] = str(error) if isinstance(error, ValueError) else "Git 同步失败，请检查远端、认证及分支。"
    save(root / SYNC, result)
    return result


def persist(root, state, event):
    validate(state)
    state["revision"] += 1
    state["updated"] = now()
    state["history"].append({"revision": state["revision"], "time": state["updated"], **event})
    save(root / STATE, state)
    write(root / STATUS, handoff(state))
    return sync(root, state)


def proposed(state, plan):
    result = copy.deepcopy(state)
    previous = index(state["milestones"])
    nodes = []
    for item in plan["milestones"]:
        key = require_id(item["id"])
        old = previous.get(key, {})
        node = {field: item[field] for field in ("id", "title", "criterion")}
        node["parent"] = item.get("parent")
        node["status"] = old.get("status", "todo")
        if old.get("criterion") != node["criterion"] and node["status"] == "done":
            node["status"] = "todo"
        if node["status"] == "done":
            node["evidence"] = old["evidence"]
            node["completedRevision"] = old.get("completedRevision", 0)
        nodes.append(node)
    result["milestones"] = nodes
    result["requirements"] = plan["requirements"]
    if "page" in plan:
        result["page"] = plan["page"]
    kept = {item["id"] for item in nodes}
    result["progress"]["current"] = [key for key in result["progress"]["current"] if key in kept]
    validate(result)
    return result


def update_progress(state, change):
    nodes = index(state["milestones"])
    for item in change.get("updates", []):
        node = nodes[item["id"]]
        node["status"] = item["status"]
        node.pop("evidence", None)
        node.pop("completedRevision", None)
        if item["status"] == "done":
            node["evidence"] = require_text(item.get("evidence"), "完成依据")
            node["completedRevision"] = state["revision"] + 1
    for field in ("current", "next", "blockers", "pending"):
        if field in change:
            state["progress"][field] = change[field]


def configure_storage(root, state, mode, remote=None, branch=None):
    if mode == "git":
        require_text(remote, "远端")
        require_text(branch, "分支")
        url = urlsplit(remote)
        if (remote.startswith("-") or "::" in remote or url.password
                or (url.scheme in ("http", "https") and (url.username or url.query or url.fragment))):
            raise ValueError("请输入无凭据的仓库地址")
        git(root, "check-ref-format", "refs/heads/" + branch)
        if not (root / ".git").exists():
            git(root, "init", "-b", branch)
        if git(root, "rev-parse", "--show-toplevel").stdout.strip() != str(root):
            raise ValueError("须使用专用项目仓库")
        save(root / CONFIG, {"remote": remote, "branch": branch})
    elif mode == "local":
        (root / CONFIG).unlink(missing_ok=True)
    elif mode != "retry":
        raise ValueError("无效的保存模式")
    write(root / STATUS, handoff(state))
    return sync(root, state)


def view(root, state):
    return {"project": state, "requirements": applicable(state),
            "pendingProposal": read(root / PROPOSAL),
            "sync": read(root / SYNC, {"status": "unknown"}),
            "storage": {"directory": str(root), "git": read(root / CONFIG)}}


def open_folder(root):
    if sys.platform == "win32":
        os.startfile(str(root))
        return
    command = "open" if sys.platform == "darwin" else "xdg-open"
    result = subprocess.run([command, str(root)], timeout=8, capture_output=True)
    if result.returncode:
        raise ValueError("无法打开目录，请复制路径后在文件管理器中打开。")


def serve(root, port):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    board = Path(__file__).with_name("board.html")
    token = secrets.token_hex(32)

    class Handler(BaseHTTPRequestHandler):
        def respond(self, content, kind, status=200):
            self.send_response(status)
            self.send_header("Content-Type", f"{kind}; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Frame-Options", "DENY")
            self.end_headers()
            self.wfile.write(content.encode("utf-8"))

        def send_json(self, data, status=200):
            self.respond(json.dumps(data, ensure_ascii=False), "application/json", status)

        def local_host(self):
            return self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"

        def do_GET(self):
            if not self.local_host():
                self.send_error(403)
                return
            path = urlsplit(self.path).path
            if path == "/":
                self.respond(board.read_text(encoding="utf-8").replace("__BOARD_TOKEN__", token), "text/html")
            elif path == "/state.json":
                self.send_json(view(root, read(root / STATE)))
            else:
                self.send_error(404)

        def do_POST(self):
            if not self.local_host() or not secrets.compare_digest(
                    self.headers.get("X-Project-Token", "").encode(), token.encode()):
                self.send_error(403)
                return
            try:
                if self.path == "/open-folder":
                    open_folder(root)
                    self.send_json({"opened": True})
                elif self.path == "/storage":
                    size = int(self.headers.get("Content-Length", "0"))
                    if not 0 < size <= 8192 or self.headers.get_content_type() != "application/json":
                        raise ValueError("无效的配置请求")
                    data = json.loads(self.rfile.read(size))
                    with locked(root):
                        state = read(root / STATE)
                        result = configure_storage(root, state, data["mode"], data.get("remote"), data.get("branch"))
                    self.send_json(result)
                else:
                    self.send_error(404)
            except (ValueError, KeyError, TypeError) as error:
                self.send_json({"error": str(error)}, 400)
            except (OSError, subprocess.SubprocessError):
                self.send_json({"error": "操作失败，请检查目录、Git 配置和本地权限。"}, 400)

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"http://127.0.0.1:{server.server_port}", flush=True)
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init").add_argument("title")
    commands.add_parser("show")
    commands.add_parser("propose").add_argument("file", type=Path)
    commands.add_parser("confirm").add_argument("proposal_id")
    progress = commands.add_parser("progress")
    progress.add_argument("file", type=Path)
    progress.add_argument("--revision", type=int, required=True)
    commands.add_parser("sync")
    configure = commands.add_parser("configure-git")
    configure.add_argument("remote")
    configure.add_argument("branch")
    commands.add_parser("configure-local")
    commands.add_parser("serve").add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    root = args.directory.resolve()
    action = args.command
    if action == "init":
        root.mkdir(parents=True, exist_ok=True)
    if action == "serve":
        if not read(root / STATE):
            raise ValueError("项目尚未初始化")
        serve(root, args.port)
        return
    with locked(root):
        state = read(root / STATE)
        if action == "init":
            if state:
                raise ValueError("项目已经存在")
            state = {"schema": 1, "id": uuid4().hex, "title": require_text(args.title, "项目名称"),
                     "revision": 0, "page": "", "milestones": [], "requirements": [],
                     "progress": {"current": [], "next": [], "blockers": [], "pending": []},
                     "history": []}
            result = persist(root, state, {"type": "init"})
        elif not state:
            raise ValueError("项目尚未初始化")
        elif action == "show":
            result = view(root, state)
        elif action == "propose":
            plan = read(args.file)
            proposed(state, plan)
            result = {"id": uuid4().hex, "revision": state["revision"], "plan": plan}
            save(root / PROPOSAL, result)
        elif action == "confirm":
            proposal = read(root / PROPOSAL)
            if not proposal or proposal["id"] != args.proposal_id or proposal["revision"] != state["revision"]:
                raise ValueError("提案不存在或基于旧修订，请重新核对并确认")
            result = persist(root, proposed(state, proposal["plan"]),
                             {"type": "plan", "proposal": proposal})
            (root / PROPOSAL).unlink()
        elif action == "progress":
            if args.revision != state["revision"]:
                raise ValueError("修订已变化，请重新读取进展")
            change = read(args.file)
            update_progress(state, change)
            result = persist(root, state, {"type": "progress", "change": change})
        else:
            modes = {"configure-git": "git", "configure-local": "local", "sync": "retry"}
            result = configure_storage(root, state, modes[action],
                                       getattr(args, "remote", None), getattr(args, "branch", None))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        raise SystemExit(f"操作失败：{exc}") from None
