"""One-time migration: move old flat archives into platform/ subdirectories.

Usage:
    python backend/migrate_archives.py <output_dir> [--apply]

Without --apply, only shows what would be moved.
"""
import argparse
import json
import os
import re
import shutil
import sys

PLATFORMS = {"weibo", "twitter", "instagram"}


def detect_platform(user_dir: str) -> str:
    profile_path = os.path.join(user_dir, "_profile.json")
    if os.path.exists(profile_path):
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                profile = json.load(f) or {}
            p = (profile.get("platform") or "").strip().lower()
            if p in PLATFORMS:
                return p
        except Exception:
            pass

    posts_root = os.path.join(user_dir, "_posts")
    if os.path.isdir(posts_root):
        for date_dir in os.listdir(posts_root):
            date_path = os.path.join(posts_root, date_dir)
            if not os.path.isdir(date_path):
                continue
            for fname in os.listdir(date_path):
                if not fname.endswith(".json"):
                    continue
                fpath = os.path.join(date_path, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        meta = json.load(f) or {}
                    url = str(meta.get("url") or "")
                    if "weibo" in url:
                        return "weibo"
                    if re.search(r"x\.com|twitter\.com", url):
                        return "twitter"
                    if "instagram" in url:
                        return "instagram"
                except Exception:
                    continue

    return ""


def migrate(output_dir: str, apply: bool) -> int:
    if not os.path.isdir(output_dir):
        print(f"目录不存在: {output_dir}", file=sys.stderr)
        return 1

    candidates = []
    for name in sorted(os.listdir(output_dir)):
        full = os.path.join(output_dir, name)
        if not os.path.isdir(full):
            continue
        if name in PLATFORMS:
            continue
        posts_dir = os.path.join(full, "_posts")
        if not os.path.isdir(posts_dir):
            continue

        platform = detect_platform(full)
        if not platform:
            print(f"跳过（无法识别平台）: {name}")
            continue

        dest = os.path.join(output_dir, platform, name)
        if os.path.exists(dest):
            print(f"跳过（目标已存在）: {name} -> {platform}/{name}")
            continue

        candidates.append((name, platform, full, dest))

    if not candidates:
        print("没有需要迁移的旧存档。")
        return 0

    print(f"发现 {len(candidates)} 个待迁移存档:\n")
    for name, platform, src, dest in candidates:
        print(f"  {name:30s}  ->  {platform}/{name}")

    if not apply:
        print("\n这是预览模式。加上 --apply 才会实际移动。")
        return 0

    print("\n开始迁移...\n")
    ok = 0
    fail = 0
    for name, platform, src, dest in candidates:
        os.makedirs(os.path.join(output_dir, platform), exist_ok=True)
        try:
            shutil.move(src, dest)
            print(f"  已迁移: {name} -> {platform}/{name}")
            ok += 1
        except Exception as e:
            print(f"  失败: {name} ({e})", file=sys.stderr)
            fail += 1

    print(f"\n完成: {ok} 个成功, {fail} 个失败")
    return 1 if fail else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="迁移旧存档到平台子目录")
    parser.add_argument("output_dir", help="存档根目录")
    parser.add_argument("--apply", action="store_true", help="实际执行迁移（不加则只预览）")
    args = parser.parse_args()
    return migrate(args.output_dir, args.apply)


if __name__ == "__main__":
    sys.exit(main())
