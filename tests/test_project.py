import json
import re
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

SCRIPT = Path(__file__).resolve().parents[1] / "skills/project-continuity/scripts/project.py"


class ProjectTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "project"
        self.run_cli("init", "示例项目")
        self.plan = {
            "milestones": [
                {"id": "phase", "title": "第一阶段", "criterion": "全部完成"},
                {"id": "sample", "parent": "phase", "title": "样本", "criterion": "提交结果"},
                {"id": "leaf", "parent": "sample", "title": "筛选", "criterion": "提交记录"},
                {"id": "later", "title": "第二阶段", "criterion": "完成复核"},
            ],
            "requirements": [
                {"id": "all", "text": "全局规则"},
                {"id": "first", "scope": "phase", "text": "阶段规则"},
                {"id": "second", "scope": "later", "text": "复核规则"},
            ],
        }

    def run_cli(self, *args, ok=True, root=None):
        result = subprocess.run([sys.executable, SCRIPT, root or self.root, *map(str, args)],
                                capture_output=True, text=True, timeout=35)
        if not ok:
            self.assertNotEqual(result.returncode, 0)
            return result.stderr
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def put(self, value):
        path = self.base / "input.json"
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def confirm_plan(self):
        proposal = self.run_cli("propose", self.put(self.plan))
        return self.run_cli("confirm", proposal["id"])

    def activate(self):
        return self.run_cli("progress", self.put({
            "updates": [{"id": "leaf", "status": "active"}], "current": ["leaf"],
            "next": ["筛选样本"], "pending": ["确认样本范围"]
        }), "--revision", 2)

    def git(self, root, *args):
        return subprocess.run(["git", "-C", str(root), *map(str, args)], check=True,
                              capture_output=True, text=True).stdout.strip()

    def identity(self, root):
        self.git(root, "config", "user.name", "Test")
        self.git(root, "config", "user.email", "test@example.invalid")

    def test_plan_and_handoff(self):
        proposal = self.run_cli("propose", self.put(self.plan))
        self.assertEqual(self.run_cli("show")["project"]["milestones"], [])
        self.run_cli("confirm", "wrong", ok=False)
        self.run_cli("confirm", proposal["id"])
        self.activate()
        snapshot = self.run_cli("show")
        self.assertEqual([r["id"] for r in snapshot["requirements"]], ["first", "all"])
        status = (self.root / "PROJECT_STATUS.md").read_text()
        for item in ("第一阶段 → 样本 → 筛选", "筛选样本", "确认样本范围", "阶段规则"):
            self.assertIn(item, status)
        self.assertNotIn("复核规则", status)
        self.run_cli("progress", self.put({"updates": [{"id": "leaf", "status": "done"}]}),
                     "--revision", 3, ok=False)
        self.run_cli("progress", self.put({"updates": [
            {"id": "leaf", "status": "done", "evidence": "成果表"},
            {"id": "later", "status": "active"}], "current": ["later"]}), "--revision", 3)
        self.assertEqual([r["id"] for r in self.run_cli("show")["requirements"]], ["second", "all"])
        self.plan["milestones"][2]["title"] = "新标题"
        self.confirm_plan()
        self.assertIn("新标题 · 成果表", (self.root / "PROJECT_STATUS.md").read_text())

    def test_stale_writes_invalid_tree_and_isolation(self):
        proposal = self.run_cli("propose", self.put(self.plan))
        self.run_cli("progress", self.put({"next": ["准备"]}), "--revision", 1)
        self.run_cli("confirm", proposal["id"], ok=False)
        self.run_cli("progress", self.put({"next": ["覆盖"]}), "--revision", 1, ok=False)
        self.plan["milestones"][0]["parent"] = "leaf"
        self.run_cli("propose", self.put(self.plan), ok=False)
        other = self.base / "other"
        self.run_cli("init", "另一项目", root=other)
        self.assertEqual(self.run_cli("show", root=other)["project"]["progress"]["next"], [])
        self.assertEqual(self.run_cli("show")["project"]["progress"]["next"], ["准备"])

    def test_git_handoff_conflict_and_retry(self):
        remote = self.base / "remote"
        remote.mkdir()
        self.git(remote, "init", "--bare", "-b", "main")
        self.git(self.root, "init", "-b", "main")
        self.identity(self.root)
        self.confirm_plan()
        self.assertEqual(self.run_cli("configure-git", remote, "main")["status"], "synced")
        self.assertEqual(self.activate()["status"], "synced")
        clone = self.base / "clone"
        self.git(self.base, "clone", remote, clone)
        self.assertIn("筛选样本", (clone / "PROJECT_STATUS.md").read_text())
        self.assertEqual(self.run_cli("show", root=clone)["requirements"][0]["id"], "first")
        self.identity(clone)
        self.assertEqual(self.run_cli("configure-git", remote, "main", root=clone)["status"], "synced")
        self.assertEqual(self.run_cli("progress", self.put({"next": ["远端编辑"]}),
                                     "--revision", 3, root=clone)["status"], "synced")
        self.assertEqual(self.run_cli("progress", self.put({"next": ["本地编辑"]}),
                                     "--revision", 3)["status"], "conflict")
        self.assertIn("本地编辑", (self.root / "PROJECT_STATUS.md").read_text())
        self.assertEqual(self.run_cli("configure-git", self.base / "missing", "main")["status"], "pending")
        self.assertEqual(self.run_cli("configure-local")["status"], "local")

    def test_live_dashboard(self):
        self.confirm_plan()
        with subprocess.Popen([sys.executable, SCRIPT, self.root, "serve", "--port", "0"],
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True) as server:
            try:
                url = server.stdout.readline().strip()
                with urlopen(url, timeout=3) as response:
                    self.assertIn("长程项目看板", response.read().decode())
                self.activate()
                with urlopen(url + "/state.json", timeout=3) as response:
                    data = json.load(response)
                self.assertEqual(data["project"]["revision"], 3)
                self.assertEqual(data["requirements"][0]["id"], "first")
            finally:
                server.terminate()

    def test_dashboard_storage_controls(self):
        remote = self.base / "remote"
        remote.mkdir()
        self.git(remote, "init", "--bare", "-b", "main")
        self.git(self.root, "init", "-b", "main")
        self.identity(self.root)
        with subprocess.Popen([sys.executable, SCRIPT, self.root, "serve", "--port", "0"],
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True) as server:
            try:
                url = server.stdout.readline().strip()
                with urlopen(url, timeout=3) as response:
                    board = response.read().decode()
                token = re.search(r"const token = '([0-9a-f]{64})'", board).group(1)

                def post(payload, auth=token):
                    request = Request(url + "/storage", data=json.dumps(payload).encode(), headers={
                        "Content-Type": "application/json", "X-Project-Token": auth})
                    with urlopen(request, timeout=5) as response:
                        return json.load(response)

                with self.assertRaises(HTTPError) as denied:
                    post({"mode": "local"}, "")
                self.assertEqual(denied.exception.code, 403)
                with self.assertRaises(HTTPError) as invalid:
                    post({"mode": "git", "remote": "ext::touch", "branch": "main"})
                self.assertEqual(invalid.exception.code, 400)
                self.assertEqual(post({"mode": "git", "remote": str(remote),
                                       "branch": "main"})["status"], "synced")
                with urlopen(url + "/state.json", timeout=3) as response:
                    self.assertEqual(json.load(response)["storage"],
                                     {"directory": str(self.root),
                                      "git": {"remote": str(remote), "branch": "main"}})
                self.assertEqual(post({"mode": "retry"})["status"], "synced")
                self.assertEqual(post({"mode": "local"})["status"], "local")
                with urlopen(url + "/state.json", timeout=3) as response:
                    self.assertIsNone(json.load(response)["storage"]["git"])
            finally:
                server.terminate()
