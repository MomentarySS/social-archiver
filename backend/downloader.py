from typing import Dict, Iterator, Optional


def download_media(
    platform: str,
    user_id: str,
    cookie: str,
    output_dir: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    concurrent: int = 3,
    naming_template: Optional[str] = None,
) -> Iterator[Dict]:
    kwargs = {
        "user_id": user_id,
        "cookie": cookie,
        "output_dir": output_dir,
        "start_date": start_date,
        "end_date": end_date,
        "concurrent": concurrent,
        "naming_template": naming_template,
    }
    if platform == "twitter":
        from backend.twitter import download_twitter_media
        yield from download_twitter_media(**kwargs)
    elif platform == "weibo":
        from backend.weibo import download_weibo_media
        yield from download_weibo_media(**kwargs)
    elif platform == "instagram":
        from backend.instagram import download_instagram_media
        yield from download_instagram_media(**kwargs)
    else:
        raise ValueError(f"Unsupported platform: {platform}")
