"""Read login cookies from installed browsers via gallery-dl."""
from typing import Dict, Optional

from backend.cookie_check import check_cookie

SUPPORTED_BROWSERS = ("edge", "chrome", "chromium", "brave", "firefox", "opera")


def _find_cookie(jar, name: str, domain_parts: tuple) -> str:
    for cookie in jar:
        cookie_name = getattr(cookie, "name", "") or ""
        cookie_domain = getattr(cookie, "domain", "") or ""
        cookie_value = getattr(cookie, "value", "") or ""
        if cookie_name != name:
            continue
        if any(part in cookie_domain for part in domain_parts):
            return str(cookie_value)
    return ""


def build_instagram_cookie(jar) -> str:
    parts = []
    seen = set()
    for cookie in jar:
        cookie_domain = getattr(cookie, "domain", "") or ""
        cookie_name = getattr(cookie, "name", "") or ""
        cookie_value = getattr(cookie, "value", "") or ""
        if "instagram.com" not in cookie_domain:
            continue
        if not cookie_name or not cookie_value or cookie_name in seen:
            continue
        seen.add(cookie_name)
        parts.append(f"{cookie_name}={cookie_value}")
    if parts:
        return "; ".join(parts)
    sessionid = _find_cookie(jar, "sessionid", ("instagram.com",))
    return f"sessionid={sessionid}" if sessionid else ""


def build_twitter_cookie(jar) -> str:
    auth_token = _find_cookie(jar, "auth_token", ("x.com", "twitter.com"))
    ct0 = _find_cookie(jar, "ct0", ("x.com", "twitter.com"))
    if auth_token and ct0:
        return f"auth_token={auth_token}; ct0={ct0}"
    return ""


def build_weibo_cookie(jar) -> str:
    sub = _find_cookie(jar, "SUB", ("weibo.cn", "weibo.com"))
    return f"SUB={sub}" if sub else ""


_PLATFORM_BUILDERS = {
    "instagram": build_instagram_cookie,
    "twitter": build_twitter_cookie,
    "weibo": build_weibo_cookie,
}


def import_browser_cookies(browser: str = "edge", platform: Optional[str] = None) -> Dict:
    browser_name = (browser or "edge").strip().lower()
    if browser_name not in SUPPORTED_BROWSERS:
        return {"ok": False, "error": f"不支持的浏览器：{browser_name}"}

    try:
        from gallery_dl.cookies import load_cookies
        jar = load_cookies([browser_name])
    except PermissionError:
        return {
            "ok": False,
            "error": (
                f"无法读取 {browser_name} 的 Cookie 数据库。"
                f"请先完全退出 {browser_name}（含后台进程）后再试。"
            ),
        }
    except Exception as exc:
        return {"ok": False, "error": f"读取 {browser_name} Cookie 失败：{exc}"}

    targets = [platform] if platform else list(_PLATFORM_BUILDERS.keys())
    results: Dict[str, Dict] = {}
    for name in targets:
        builder = _PLATFORM_BUILDERS.get(name)
        if not builder:
            continue
        cookie = builder(jar)
        if not cookie:
            results[name] = {
                "cookie": "",
                "valid": False,
                "message": f"在 {browser_name} 中未找到 {name} 的登录 Cookie",
            }
            continue
        checked = check_cookie(name, cookie)
        results[name] = {
            "cookie": cookie,
            "valid": bool(checked.get("valid")),
            "message": checked.get("message") or "",
        }

    return {"ok": True, "browser": browser_name, "results": results}
