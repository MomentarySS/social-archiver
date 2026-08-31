import json
import os
import tempfile
import unittest

from backend.weibo import (
    EXISTING_STREAK_STOP,
    _archive_post_complete,
    _collect_media,
    _cookie_session,
    _format_weibo_api_error,
    _forward_has_comment,
    _is_original,
    _is_pinned,
    _iter_mblog_cards,
    _livephoto_inner_url,
    _livephoto_play_url,
    _looks_like_media,
    _pagination_cursor,
    _pic_as_media,
    _read_user_profile,
    _session_cookie_string,
    _should_include_mblog,
    _video_url_candidates,
)


class WeiboHelpersTest(unittest.TestCase):
    def test_existing_streak_stop_is_small_positive(self):
        self.assertGreaterEqual(EXISTING_STREAK_STOP, 3)
        self.assertLessEqual(EXISTING_STREAK_STOP, 10)

    def test_is_original_skips_retweets(self):
        self.assertFalse(_is_original({"retweeted_status": {"id": "1"}, "user": {"id": "9"}}, "9"))
        self.assertTrue(_is_original({"user": {"id": "9"}}, "9"))

    def test_include_quoted_only_with_comment(self):
        pure_rt = {
            "retweeted_status": {"text": "inner post", "user": {"screen_name": "bob"}},
            "text": "inner post",
            "user": {"id": "9"},
        }
        comment_rt = {
            "retweeted_status": {"text": "inner post", "user": {"screen_name": "bob"}},
            "text": "my take // inner post",
            "user": {"id": "9"},
        }
        self.assertFalse(_should_include_mblog(pure_rt, "9", True))
        self.assertTrue(_should_include_mblog(comment_rt, "9", True))
        self.assertTrue(_forward_has_comment(comment_rt))
        self.assertFalse(_forward_has_comment(pure_rt))

    def test_is_pinned(self):
        self.assertTrue(_is_pinned({"isTop": "1"}))
        self.assertTrue(_is_pinned({"title": {"text": "置顶微博"}}))
        self.assertFalse(_is_pinned({"title": {"text": "普通"}}))

    def test_iter_mblog_cards_nested(self):
        cards = _iter_mblog_cards([
            {"card_type": "9", "mblog": {"id": "1"}},
            {"card_group": [{"card_type": "9", "mblog": {"id": "2"}}]},
            {"card_type": "11"},
        ])
        self.assertEqual([c["mblog"]["id"] for c in cards], ["1", "2"])

    def test_archive_complete_text_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            posts = os.path.join(tmp, "_posts", "2026-08-28")
            os.makedirs(posts)
            with open(os.path.join(posts, "111.json"), "w", encoding="utf-8") as handle:
                json.dump({"id": "111", "pics": []}, handle)
            self.assertTrue(_archive_post_complete(tmp, "2026-08-28", "111"))
            self.assertFalse(_archive_post_complete(tmp, "2026-08-28", "missing"))

    def test_archive_incomplete_when_media_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            posts = os.path.join(tmp, "_posts", "2026-08-28")
            os.makedirs(posts)
            with open(os.path.join(posts, "111.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "id": "111",
                    "pics": [{"filename": "111_1.jpg", "date_folder": "2026-08-28"}],
                }, handle)
            self.assertFalse(_archive_post_complete(tmp, "2026-08-28", "111"))

    def test_session_cookie_string_dedupes_and_serializes(self):
        session = _cookie_session("SUB=abc; SUBP=def")
        session.cookies.set("MLOGIN", "1", domain="m.weibo.cn")
        value = _session_cookie_string(session)
        self.assertIn("SUB=abc", value)
        self.assertIn("SUBP=def", value)
        self.assertIn("MLOGIN=1", value)
        self.assertEqual(value.count("SUB="), 1)

    def test_livephoto_inner_url_preserves_signed_query(self):
        signed = (
            "https://livephoto.us.sinaimg.cn/abc.mov"
            "?Expires=1731577114&ssig=oZXynRJKt2&KID=unistore,vi"
        )
        inner = _livephoto_inner_url(signed)
        self.assertIn("Expires=1731577114", inner)
        self.assertIn("ssig=oZXynRJKt2", inner)

    def test_livephoto_play_url_keeps_signature(self):
        signed = (
            "https://livephoto.us.sinaimg.cn/abc.mov"
            "?Expires=1731577114&ssig=abc%2Fdef"
        )
        play = _livephoto_play_url(signed)
        self.assertTrue(play.startswith("https://video.weibo.com/media/play?livephoto="))
        self.assertIn("Expires%3D1731577114", play)
        self.assertIn("ssig%3Dabc", play)

    def test_video_url_candidates_include_signed_inner(self):
        signed = "https://livephoto.us.sinaimg.cn/abc.mov?Expires=1&ssig=x"
        candidates = _video_url_candidates(signed)
        self.assertGreaterEqual(len(candidates), 2)
        self.assertTrue(any("Expires=1" in item for item in candidates))

    def test_collect_media_stores_raw_livephoto_video_url(self):
        signed = "https://livephoto.us.sinaimg.cn/abc.mov?Expires=1&ssig=x"
        items = _collect_media({
            "pics": [{
                "type": "livephoto",
                "url": "https://wx1.sinaimg.cn/large/still.jpg",
                "videoSrc": signed,
            }],
        })
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["type"], "livephoto")
        self.assertEqual(items[0]["video_url"], signed)

    def test_looks_like_media_rejects_m3u8(self):
        self.assertFalse(_looks_like_media(b"#EXTM3U\n#EXT-X-VERSION:3\n"))

    def test_pagination_cursor_prefers_since_id(self):
        payload = {
            "data": {
                "cardlistInfo": {"since_id": "123", "page": 2},
            }
        }
        since, page, has_more = _pagination_cursor(payload, 1, "")
        self.assertEqual((since, page, has_more), ("123", 2, True))

    def test_pagination_cursor_falls_back_to_page(self):
        payload = {
            "data": {
                "cardlistInfo": {"page": 2, "total": 110},
            }
        }
        since, page, has_more = _pagination_cursor(payload, 1, "")
        self.assertEqual((since, page, has_more), ("", 2, True))

    def test_pagination_cursor_handles_string_data(self):
        since, page, has_more = _pagination_cursor({"data": "bad"}, 1, "")
        self.assertEqual((since, page, has_more), ("", 1, False))

    def test_read_user_profile_returns_dict_when_file_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            profile = {"fetchStatus": "partial", "lastPage": 2}
            with open(os.path.join(tmp, "_profile.json"), "w", encoding="utf-8") as handle:
                json.dump(profile, handle)
            loaded = _read_user_profile(tmp)
            self.assertEqual(loaded, profile)

    def test_pic_as_media_accepts_url_string(self):
        kind, still, live = _pic_as_media("https://wx1.sinaimg.cn/large/example.jpg")
        self.assertEqual(kind, "image")
        self.assertEqual(still, "https://wx1.sinaimg.cn/large/example.jpg")
        self.assertEqual(live, "")

    def test_iter_mblog_cards_ignores_non_dicts(self):
        cards = _iter_mblog_cards("not-a-list")
        self.assertEqual(cards, [])
        cards = _iter_mblog_cards([
            "skip-me",
            {"card_type": "9", "mblog": {"id": "1"}, "card_group": "also-bad"},
        ])
        self.assertEqual([c["mblog"]["id"] for c in cards], ["1"])

    def test_collect_media_accepts_string_pics(self):
        items = _collect_media({
            "pics": [
                "https://wx1.sinaimg.cn/large/a.jpg",
                {"url": "https://wx2.sinaimg.cn/large/b.jpg"},
            ],
            "pic_ids": "not-a-list",
            "page_info": "not-a-dict",
        })
        urls = [item["url"] for item in items]
        self.assertIn("https://wx1.sinaimg.cn/large/a.jpg", urls)
        self.assertIn("https://wx2.sinaimg.cn/large/b.jpg", urls)

    def test_later_page_minus100_mentions_rate_limit(self):
        class Dummy:
            status_code = 200
        msg = _format_weibo_api_error(Dummy(), {"ok": -100}, 3)
        self.assertIn("风控", msg)
        self.assertNotIn("未登录", msg)

    def test_cookie_session_parses_pairs(self):
        session = _cookie_session("SUB=abc; MLOGIN=1")
        self.assertEqual(session.cookies.get("SUB"), "abc")
        self.assertEqual(session.cookies.get("MLOGIN"), "1")


if __name__ == "__main__":
    unittest.main()
