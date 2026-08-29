from typing import Dict, Iterator, Optional

from backend.platforms.registry import download_for_platform


def download_media(
    platform: str,
    user_id: str,
    cookie: str,
    output_dir: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    concurrent: int = 3,
    naming_template: Optional[str] = None,
    deep_backtrack: bool = False,
    include_replies: bool = False,
    replies_media_only: bool = False,
    include_quotes: bool = False,
    include_quoted: bool = False,
    include_reels: bool = False,
    include_stories: bool = False,
    include_bookmarks: bool = False,
    include_likes: bool = False,
) -> Iterator[Dict]:
    yield from download_for_platform(
        platform,
        user_id=user_id,
        cookie=cookie,
        output_dir=output_dir,
        start_date=start_date,
        end_date=end_date,
        concurrent=concurrent,
        naming_template=naming_template,
        deep_backtrack=deep_backtrack,
        include_replies=include_replies,
        replies_media_only=replies_media_only,
        include_quotes=include_quotes,
        include_quoted=include_quoted,
        include_reels=include_reels,
        include_stories=include_stories,
        include_bookmarks=include_bookmarks,
        include_likes=include_likes,
    )
