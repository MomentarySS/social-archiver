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


def _emit(event):
    line = json.dumps(event, ensure_ascii=False) + "\n"
    buf = getattr(sys.stdout, "buffer", None)
    if buf is not None:
        buf.write(line.encode("utf-8"))
        buf.flush()
        return
    print(line, end="", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Social Archiver Backend")
    parser.add_argument("--platform", required=True, choices=["twitter", "weibo", "instagram"])
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--cookie", default="")
    parser.add_argument("--cookie-file", default="")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--start-date", default="")
    parser.add_argument("--end-date", default="")
    parser.add_argument("--concurrent", type=int, default=3)
    parser.add_argument("--naming-template", default="{post_id}_{index}")
    args = parser.parse_args()

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

    try:
        for event in download_media(
            platform=args.platform,
            user_id=args.user_id,
            cookie=cookie,
            output_dir=args.output_dir,
            start_date=args.start_date or None,
            end_date=args.end_date or None,
            concurrent=args.concurrent,
            naming_template=args.naming_template or None,
        ):
            _emit(event)
    except Exception as e:
        _emit({"type": "error", "msg": str(e)})
        sys.exit(1)


if __name__ == "__main__":
    main()
