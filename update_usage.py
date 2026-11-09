#!/usr/bin/env python3
"""Fetch Muse usage via `subscription-status status` and publish usage.json.

Runs on Muse's VM. Commits and pushes usage.json only when it changed
(the updated_at timestamp is excluded from the change check).
"""
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

JST = timezone(timedelta(hours=9))
REPO = Path(__file__).resolve().parent
JSON_PATH = REPO / "usage.json"

SSH_CMD = (
    "ssh -o ProxyCommand='nc -X connect -x hatch-egress-proxy:3128 %h %p'"
    " -i /home/hatch/.ssh/id_ed25519 -o IdentitiesOnly=yes"
    " -o UserKnownHostsFile=/home/hatch/.ssh/known_hosts"
    " -o StrictHostKeyChecking=accept-new"
)

MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


def parse_brief(text: str, now: datetime) -> dict:
    data = {"raw": text.strip()}
    data["plan"] = "free" if "does not have a subscription" in text else "subscription"

    m = re.search(r"Usage:\s*(\d+(?:\.\d+)?)%", text)
    weekly = {"used_percent": float(m.group(1)) if m else None}
    if weekly["used_percent"] is not None and weekly["used_percent"].is_integer():
        weekly["used_percent"] = int(weekly["used_percent"])

    m = re.search(r"resets\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+at\s+"
                  r"(\d{1,2}):(\d{2})\s*(AM|PM)", text)
    if m:
        mon, day, hh, mm, ap = m.groups()
        hour = int(hh) % 12 + (12 if ap == "PM" else 0)
        reset = datetime(now.year, MONTHS[mon], int(day), hour, int(mm), tzinfo=JST)
        if reset < now - timedelta(days=1):
            reset += timedelta(days=7)
        weekly["resets_at"] = reset.isoformat()
        weekly["resets_text"] = m.group(0).replace("resets ", "") + " JST"
    data["weekly"] = weekly

    m = re.search(r"Additional tokens:\s*(\d+(?:\.\d+)?)%\s*used\s*\(([^)]*)\)", text)
    if m:
        pct = float(m.group(1))
        data["additional_tokens"] = {
            "used_percent": int(pct) if pct.is_integer() else pct,
            "remaining_text": m.group(2),
        }
    return data


def git(*args: str) -> subprocess.CompletedProcess:
    import os
    env = dict(os.environ)
    env["GIT_SSH_COMMAND"] = SSH_CMD
    return subprocess.run(["git", "-C", str(REPO), *args],
                          capture_output=True, text=True, env=env)


def main() -> int:
    now = datetime.now(JST)
    out = subprocess.run(["subscription-status", "status"],
                         capture_output=True, text=True, timeout=120)
    if out.returncode != 0 or "Usage:" not in out.stdout:
        print("subscription-status failed:", out.stdout, out.stderr, file=sys.stderr)
        return 1
    data = parse_brief(out.stdout, now)

    previous = None
    if JSON_PATH.exists():
        try:
            previous = json.loads(JSON_PATH.read_text())
        except Exception:
            previous = None
    prev_cmp = {k: v for k, v in (previous or {}).items() if k != "updated_at"}
    new_cmp = {k: v for k, v in data.items() if k != "updated_at"}
    if previous is not None and prev_cmp == new_cmp:
        print("no change")
        return 0

    data["updated_at"] = now.isoformat(timespec="seconds")
    JSON_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    git("add", "usage.json")
    commit = git("commit", "-m", f"usage update {data['updated_at']}")
    if commit.returncode != 0:
        print("commit failed:", commit.stdout, commit.stderr, file=sys.stderr)
        return 1
    push = git("push", "origin", "HEAD")
    if push.returncode != 0:
        print("push failed:", push.stdout, push.stderr, file=sys.stderr)
        return 1
    print("pushed:", data["updated_at"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
