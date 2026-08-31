"""Platform download registry — add a platform by registering one module."""
import inspect
from typing import Any, Callable, Dict, Iterator, List

PlatformDownloader = Callable[..., Iterator[Dict]]

PLATFORMS: List[str] = ["twitter", "weibo", "instagram"]


def _load_downloaders() -> Dict[str, PlatformDownloader]:
    from backend.instagram import download_instagram_media
    from backend.twitter import download_twitter_media
    from backend.weibo import download_weibo_media

    return {
        "twitter": download_twitter_media,
        "weibo": download_weibo_media,
        "instagram": download_instagram_media,
    }


def _filter_kwargs(downloader: PlatformDownloader, kwargs: Dict[str, Any]) -> Dict[str, Any]:
    params = inspect.signature(downloader).parameters
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values()):
        return kwargs
    return {key: value for key, value in kwargs.items() if key in params}


def download_for_platform(platform: str, **kwargs: Any) -> Iterator[Dict]:
    downloader = _load_downloaders().get(platform)
    if not downloader:
        raise ValueError(f"Unsupported platform: {platform}")
    yield from downloader(**_filter_kwargs(downloader, kwargs))
