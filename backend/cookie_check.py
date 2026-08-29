"""Lightweight cookie validity checks without starting a full download."""
from typing import Dict, Optional

import requests


def _result(valid: bool, message: str) -> Dict:
    return {"valid": valid, "message": message}


def check_weibo_cookie(cookie: str) -> Dict:
    cookie = (cookie or "").strip()
    if not cookie:
        return _result(False, "未填写 Cookie")
    if "SUB=" not in cookie and "=" not in cookie:
        cookie = f"SUB={cookie}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 "
            "Mobile/15E148 Safari/604.1"
        ),
        "Cookie": cookie,
        "Referer": "https://m.weibo.cn/",
        "X-Requested-With": "XMLHttpRequest",
    }
    try:
        resp = requests.get(
            "https://m.weibo.cn/api/config",
            headers=headers,
            timeout=15,
        )
        data = resp.json()
        if data.get("ok") == 1:
            return _result(True, "Cookie 有效")
        msg = (data.get("msg") or data.get("message") or "").strip()
        return _result(False, msg or "Cookie 可能已失效")
    except requests.exceptions.RequestException as e:
        return _result(False, f"网络错误: {e}")
    except ValueError:
        return _result(False, "接口返回异常，Cookie 可能已失效")


def check_twitter_cookie(cookie: str) -> Dict:
    cookie = (cookie or "").strip()
    if not cookie:
        return _result(False, "未填写 Cookie")
    auth_token = ""
    ct0 = ""
    for part in cookie.split(";"):
        part = part.strip()
        if part.lower().startswith("auth_token="):
            auth_token = part.split("=", 1)[1].strip()
        elif part.lower().startswith("ct0="):
            ct0 = part.split("=", 1)[1].strip()
    if not auth_token or not ct0:
        return _result(False, "需要 auth_token 和 ct0")
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Cookie": f"auth_token={auth_token}; ct0={ct0}",
        "x-csrf-token": ct0,
        "Authorization": (
            "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs"
            "%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
        ),
    }
    try:
        resp = requests.get(
            "https://x.com/i/api/1.1/account/settings.json",
            headers=headers,
            timeout=15,
        )
        if resp.status_code == 200:
            try:
                data = resp.json()
                if isinstance(data, dict) and (data.get("screen_name") or data.get("protected") is not None):
                    return _result(True, "Cookie 有效")
            except ValueError:
                pass
            return _result(True, "Cookie 有效")
        if resp.status_code in (401, 403):
            return _result(False, "Cookie 已失效，请重新登录")
        return _result(False, f"校验失败（HTTP {resp.status_code}）")
    except requests.exceptions.RequestException as e:
        return _result(False, f"网络错误: {e}")


def check_instagram_cookie(cookie: str) -> Dict:
    cookie = (cookie or "").strip()
    sessionid = ""
    for part in cookie.split(";"):
        part = part.strip()
        if part.lower().startswith("sessionid="):
            sessionid = part.split("=", 1)[1].strip()
    if not sessionid and "=" not in cookie and ";" not in cookie:
        sessionid = cookie
    if not sessionid:
        return _result(False, "需要 sessionid")
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Cookie": f"sessionid={sessionid}",
        "X-IG-App-ID": "936619743392459",
    }
    try:
        resp = requests.get(
            "https://www.instagram.com/api/v1/accounts/current_user/",
            headers=headers,
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json()
            user = (data.get("user") or {}) if isinstance(data, dict) else {}
            if user.get("username"):
                return _result(True, f"Cookie 有效（@{user.get('username')}）")
            return _result(True, "Cookie 有效")
        if resp.status_code in (401, 403):
            return _result(False, "sessionid 已失效，请重新登录")
        return _result(False, f"校验失败（HTTP {resp.status_code}）")
    except requests.exceptions.RequestException as e:
        return _result(False, f"网络错误: {e}")


def check_cookie(platform: str, cookie: str) -> Dict:
    p = (platform or "").strip().lower()
    if p in ("twitter", "x"):
        return check_twitter_cookie(cookie)
    if p == "instagram":
        return check_instagram_cookie(cookie)
    return check_weibo_cookie(cookie)
