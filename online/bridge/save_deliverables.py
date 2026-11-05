"""Save confirmed online project deliverables into a selected local directory."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def api(site, token, path, payload=None):
    request = Request(site + path, headers={
        "OAI-Sites-Authorization": "Bearer " + token,
        "Content-Type": "application/json", "Origin": site
    }, data=json.dumps(payload).encode() if payload is not None else None)
    with urlopen(request, timeout=40) as response:
        return response.read()


def target_path(root, relative):
    parts = PurePosixPath(relative).parts
    if not parts or relative.startswith("/") or "\\" in relative or any(
            p in (".", "..") or ":" in p for p in parts):
        raise ValueError("成果路径无效")
    target = root.joinpath(*parts)
    if not target.resolve().is_relative_to(root.resolve()):
        raise ValueError("成果路径超出目标目录")
    return target


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temp = Path(stream.name)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def save_one(root, artifact, data, receipts):
    if hashlib.sha256(data).hexdigest() != artifact["sha256"]:
        raise ValueError("下载文件校验失败")
    target = target_path(root, artifact["path"])
    if target.exists():
        current = hashlib.sha256(target.read_bytes()).hexdigest()
        if current != artifact["sha256"] and current != receipts.get(artifact["path"]):
            return "conflict", target
    metadata = artifact.get("provenanceText")
    if metadata:
        raw = metadata.encode("utf-8")
        metadata_path = artifact["path"] + ".provenance.json"
        metadata_target = target_path(root, metadata_path)
        digest = hashlib.sha256(raw).hexdigest()
        if metadata_target.exists():
            current = hashlib.sha256(metadata_target.read_bytes()).hexdigest()
            if current not in (digest, receipts.get(metadata_path)):
                return "conflict", metadata_target
        atomic_write(metadata_target, raw)
        receipts[metadata_path] = digest
    atomic_write(target, data)
    receipts[artifact["path"]] = artifact["sha256"]
    return "saved", target


def run_once(site, token, root):
    state = json.loads(api(site, token, "/api/project"))["project"]
    files = {}
    for artifact in state.get("artifacts", []):
        files[artifact["path"]] = artifact
    receipt_path = root / ".continuity-receipts.json"
    receipts = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
    for artifact in files.values():
        target = target_path(root, artifact["path"])
        if (artifact.get("local", {}).get("status") == "saved"
                and artifact["local"].get("path") == str(target)
                and (not artifact.get("provenanceText") or (
                    target_path(root, artifact["path"] + ".provenance.json").exists()
                    and target_path(root, artifact["path"] + ".provenance.json").read_bytes() == artifact["provenanceText"].encode("utf-8")))
                and target.exists()
                and hashlib.sha256(target.read_bytes()).hexdigest() == artifact["sha256"]):
            continue
        data = api(site, token, "/api/files/" + artifact["id"])
        status, target = save_one(root, artifact, data, receipts)
        atomic_write(receipt_path, json.dumps(receipts).encode())
        for attempt in range(3):
            latest = json.loads(api(site, token, "/api/project"))["project"]
            try:
                api(site, token, "/api/project", {
                    "type": "local_receipt", "revision": latest["revision"],
                    "artifactId": artifact["id"], "sha256": artifact["sha256"],
                    "status": status, "path": str(target)
                })
                break
            except HTTPError as error:
                if error.code != 409 or attempt == 2:
                    raise
        print(status, target, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", required=True)
    parser.add_argument("--folder", type=Path, required=True)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    site = args.site.rstrip("/")
    parsed = urlparse(site)
    if parsed.scheme != "https" or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise SystemExit("请提供 HTTPS 站点根地址")
    token = os.environ.get("CONTINUITY_ACCESS_TOKEN")
    if not token:
        raise SystemExit("请在本机环境变量 CONTINUITY_ACCESS_TOKEN 中配置站点服务访问凭据")
    root = args.folder.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    while True:
        try:
            run_once(site, token, root)
        except Exception as error:
            print("本地保存失败", type(error).__name__, flush=True)
            if args.once:
                raise SystemExit(1) from None
        if args.once:
            break
        time.sleep(5)


if __name__ == "__main__":
    main()
