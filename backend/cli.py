import argparse
import io
import json
import os
import sys


def _force_utf8_stdio():
    os.environ["PYTHONIOENCODING"] = "utf-8"
    os.environ["PYTHONUTF8"] = "1"
    for name in ("stdout", "stderr"):
        stream = getattr(sys, name, None)
        if stream is None:
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
            continue
        except (AttributeError, OSError, ValueError):
            pass
        buf = getattr(stream, "buffer", None)
        if buf is None:
            continue
        wrapped = io.TextIOWrapper(buf, encoding="utf-8", errors="replace", line_buffering=True)
        setattr(sys, name, wrapped)


_force_utf8_stdio()

if len(sys.argv) > 1 and sys.argv[1] == "--run-gallery-dl":
    import gallery_dl
    sys.argv = ["gallery-dl", *sys.argv[2:]]
    raise SystemExit(gallery_dl.main())

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.downloader import download_media
from backend.gallery_dl_runner import normalize_concurrent


def _emit(event):
    line = json.dumps(event, ensure_ascii=False) + "\n"
    buf = getattr(sys.stdout, "buffer", None)
    if buf is not None:
        buf.write(line.encode("utf-8"))
        buf.flush()
        return
    print(line, end="", flush=True)


def _read_cookie(args):
    cookie = args.cookie or ""
    if args.cookie_file:
        try:
            with open(args.cookie_file, encoding="utf-8") as handle:
                cookie = handle.read().strip()
        except OSError as e:
            _emit({"type": "error", "msg": f"无法读取 Cookie 文件: {e}"})
            sys.exit(1)
    if not cookie:
        cookie = os.environ.get("SOCIAL_ARCHIVER_COOKIE", "")
    return cookie


def _run_download_job(job):
    cookie = job.get("cookie") or ""
    cookie_file = job.get("cookie_file") or ""
    if cookie_file:
        try:
            with open(cookie_file, encoding="utf-8") as handle:
                cookie = handle.read().strip()
        except OSError as e:
            _emit({"type": "error", "msg": f"无法读取 Cookie 文件: {e}"})
            return 1
    if not job.get("platform") or not job.get("user_id") or not job.get("output_dir"):
        _emit({"type": "error", "msg": "批处理任务缺少 platform / user_id / output_dir"})
        return 1
    failed = False
    try:
        for event in download_media(
            platform=job["platform"],
            user_id=job["user_id"],
            cookie=cookie,
            output_dir=job["output_dir"],
            start_date=job.get("start_date") or None,
            end_date=job.get("end_date") or None,
            concurrent=normalize_concurrent(job.get("concurrent") or 3),
            naming_template=job.get("naming_template") or None,
            deep_backtrack=bool(job.get("deep_backtrack")),
            include_replies=bool(job.get("include_replies")),
            replies_media_only=bool(job.get("replies_media_only")),
            include_quotes=bool(job.get("include_quotes")),
            include_quoted=bool(job.get("include_quoted")),
            include_reels=bool(job.get("include_reels")),
            include_stories=bool(job.get("include_stories")),
            include_bookmarks=bool(job.get("include_bookmarks")),
            include_likes=bool(job.get("include_likes")),
        ):
            _emit(event)
            if event.get("type") == "error":
                failed = True
    except Exception as e:
        _emit({"type": "error", "msg": str(e)})
        return 1
    return 1 if failed else 0


def main():
    parser = argparse.ArgumentParser(description="Social Archiver Backend")
    parser.add_argument("--platform", choices=["twitter", "weibo", "instagram"])
    parser.add_argument("--user-id", default="")
    parser.add_argument("--cookie", default="")
    parser.add_argument("--cookie-file", default="")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--start-date", default="")
    parser.add_argument("--end-date", default="")
    parser.add_argument("--concurrent", type=int, default=3)
    parser.add_argument("--naming-template", default="{post_id}_{index}")
    parser.add_argument("--deep-backtrack", action="store_true")
    parser.add_argument("--include-replies", action="store_true", help="X：同时缓存回复时间线")
    parser.add_argument("--replies-media-only", action="store_true", help="X：回复仅保留带媒体的帖")
    parser.add_argument("--include-quotes", action="store_true", help="X：同时缓存引用帖")
    parser.add_argument("--include-quoted", action="store_true", help="微博：收录带评论转发并标注引用")
    parser.add_argument("--include-reels", action="store_true", help="Instagram：同时缓存 Reels")
    parser.add_argument("--include-stories", action="store_true", help="Instagram：同时缓存 Stories")
    parser.add_argument("--include-bookmarks", action="store_true", help="X：同时缓存登录账号书签")
    parser.add_argument("--include-likes", action="store_true", help="X：同时缓存该用户点赞时间线")
    parser.add_argument("--verify", action="store_true", help="校验存档完整性")
    parser.add_argument("--check-cookie", action="store_true", help="预检 Cookie 是否有效")
    parser.add_argument("--import-browser-cookies", action="store_true", help="从浏览器导入 Cookie")
    parser.add_argument("--browser", default="edge", help="浏览器：edge / chrome / firefox / brave 等")
    parser.add_argument("--batch-config", default="", help="批处理 JSON 配置文件")
    parser.add_argument("--probe-ffmpeg", action="store_true", help="检测系统 ffmpeg 是否可用")
    parser.add_argument("--transcode", action="store_true", help="将 HEVC 视频转码为 H.264")
    parser.add_argument("--generate-posters", action="store_true", help="为视频生成封面图")
    parser.add_argument("--repair-weibo-media", action="store_true", help="删除微博损坏的实况 mp4")
    args = parser.parse_args()

    if args.probe_ffmpeg:
        from backend.transcode import probe_ffmpeg
        result = probe_ffmpeg()
        _emit({"type": "ffmpeg-probe", **result})
        sys.exit(0 if result.get("available") else 1)

    if args.transcode:
        if not args.output_dir:
            _emit({"type": "error", "msg": "转码需要 --output-dir"})
            sys.exit(1)
        from backend.transcode import transcode_output_dir
        failed = False
        try:
            for event in transcode_output_dir(
                args.output_dir,
                platform=args.platform or None,
                user_id=args.user_id or None,
            ):
                _emit(event)
                if event.get("type") == "error":
                    failed = True
                if event.get("type") == "summary" and not event.get("ok"):
                    failed = True
        except Exception as e:
            _emit({"type": "error", "msg": str(e)})
            sys.exit(1)
        sys.exit(1 if failed else 0)

    if args.generate_posters:
        if not args.output_dir:
            _emit({"type": "error", "msg": "生成封面需要 --output-dir"})
            sys.exit(1)
        from backend.transcode import generate_posters_output_dir
        failed = False
        try:
            for event in generate_posters_output_dir(
                args.output_dir,
                platform=args.platform or None,
                user_id=args.user_id or None,
            ):
                _emit(event)
                if event.get("type") == "error":
                    failed = True
                if event.get("type") == "summary" and not event.get("ok"):
                    failed = True
        except Exception as e:
            _emit({"type": "error", "msg": str(e)})
            sys.exit(1)
        sys.exit(1 if failed else 0)

    if args.repair_weibo_media:
        if not args.output_dir:
            _emit({"type": "error", "msg": "修复需要 --output-dir"})
            sys.exit(1)
        from backend.repair import repair_output_dir
        failed = False
        try:
            for event in repair_output_dir(
                args.output_dir,
                platform=args.platform or None,
                user_id=args.user_id or None,
            ):
                _emit(event)
                if event.get("type") == "error":
                    failed = True
        except Exception as e:
            _emit({"type": "error", "msg": str(e)})
            sys.exit(1)
        sys.exit(1 if failed else 0)

    if args.batch_config:
        try:
            with open(args.batch_config, encoding="utf-8") as handle:
                payload = json.load(handle) or {}
        except OSError as e:
            _emit({"type": "error", "msg": f"无法读取批处理配置: {e}"})
            sys.exit(1)
        except ValueError as e:
            _emit({"type": "error", "msg": f"批处理配置不是有效 JSON: {e}"})
            sys.exit(1)
        jobs = payload.get("jobs") or []
        if not jobs:
            _emit({"type": "error", "msg": "批处理配置中没有 jobs"})
            sys.exit(1)
        exit_code = 0
        for index, raw in enumerate(jobs, start=1):
            job = dict(raw)
            job["output_dir"] = job.get("output_dir") or payload.get("output_dir") or ""
            job["concurrent"] = job.get("concurrent") or payload.get("concurrent") or args.concurrent
            job["naming_template"] = job.get("naming_template") or payload.get("naming_template") or args.naming_template
            _emit({
                "type": "status",
                "msg": f"批处理 {index}/{len(jobs)}: {job.get('platform')} / {job.get('user_id')}",
            })
            code = _run_download_job(job)
            if code != 0:
                exit_code = code
        sys.exit(exit_code)

    if args.check_cookie:
        if not args.platform:
            _emit({"type": "error", "msg": "预检 Cookie 需要 --platform"})
            sys.exit(1)
        cookie = _read_cookie(args)
        from backend.cookie_check import check_cookie
        result = check_cookie(args.platform, cookie)
        _emit({"type": "cookie-check", **result})
        sys.exit(0 if result.get("valid") else 1)

    if args.import_browser_cookies:
        from backend.browser_cookies import import_browser_cookies
        result = import_browser_cookies(args.browser, args.platform or None)
        if not result.get("ok"):
            _emit({"type": "error", "msg": result.get("error") or "导入失败"})
            sys.exit(1)
        for platform_name, row in (result.get("results") or {}).items():
            _emit({
                "type": "browser-cookie-import",
                "platform": platform_name,
                "cookie": row.get("cookie") or "",
                "valid": bool(row.get("valid")),
                "message": row.get("message") or "",
            })
        sys.exit(0)

    if args.verify:
        if not args.output_dir:
            _emit({"type": "error", "msg": "校验需要 --output-dir"})
            sys.exit(1)
        from backend.verify import verify_output_dir
        try:
            for event in verify_output_dir(
                args.output_dir,
                platform=args.platform or None,
                user_id=args.user_id or None,
            ):
                _emit(event)
        except Exception as e:
            _emit({"type": "error", "msg": str(e)})
            sys.exit(1)
        return

    if not args.platform or not args.user_id or not args.output_dir:
        _emit({"type": "error", "msg": "下载需要 --platform、--user-id、--output-dir"})
        sys.exit(1)

    cookie = _read_cookie(args)

    try:
        for event in download_media(
            platform=args.platform,
            user_id=args.user_id,
            cookie=cookie,
            output_dir=args.output_dir,
            start_date=args.start_date or None,
            end_date=args.end_date or None,
            concurrent=normalize_concurrent(args.concurrent),
            naming_template=args.naming_template or None,
            deep_backtrack=args.deep_backtrack,
            include_replies=args.include_replies,
            replies_media_only=args.replies_media_only,
            include_quotes=args.include_quotes,
            include_quoted=args.include_quoted,
            include_reels=args.include_reels,
            include_stories=args.include_stories,
            include_bookmarks=args.include_bookmarks,
            include_likes=args.include_likes,
        ):
            _emit(event)
    except Exception as e:
        _emit({"type": "error", "msg": str(e)})
        sys.exit(1)


if __name__ == "__main__":
    main()
