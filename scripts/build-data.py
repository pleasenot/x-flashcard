#!/usr/bin/env python3
"""Build site data and optimized media from /workspace/x-archive."""

from __future__ import annotations

import json
import re
import html
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ARCHIVE = Path("/workspace/x-archive")
SITE = Path("/workspace/x-flashcards-site")
MEDIA = SITE / "media"
DATA = SITE / "data"
ARTICLES = DATA / "articles"

MAX_EXTRAS = 6
COVER_MAX = 1400
GALLERY_MAX = 1100
WEBP_QUALITY = 82

BODY_HEADINGS = ("## Article 全文", "## 正文")
STOP_HEADINGS = ("## 图片", "## 图片/媒体", "## 代码块")


def extract_body(md: str) -> tuple[str, bool]:
    """Return (plain body text, omitted_code_blocks)."""
    omitted_code = False
    lines = md.replace("\r\n", "\n").split("\n")

    start = None
    for i, line in enumerate(lines):
        if line.strip() in BODY_HEADINGS or line.strip().startswith("## Article") or line.strip() == "## 正文":
            start = i + 1
            break
    if start is None:
        # Archived thread dumps start at the first section heading.
        for i, line in enumerate(lines):
            if line.startswith("## "):
                start = i
                break
    if start is None:
        # skip title + metadata list
        i = 0
        if lines and lines[0].startswith("# "):
            i = 1
        while i < len(lines) and (lines[i].startswith("- ") or lines[i].strip() == ""):
            i += 1
        start = i

    body_lines = []
    for line in lines[start:]:
        stripped = line.strip()
        if any(stripped.startswith(s) for s in STOP_HEADINGS) or stripped.startswith("## 代码块"):
            if "代码" in stripped:
                omitted_code = True
            break
        body_lines.append(line)

    text = "\n".join(body_lines).strip()
    # collapse 3+ newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Thread archives often title each tweet with id and like count; keep only 1/12.
    text = re.sub(
        r"^##\s+Thread\s+(\d+\s*/\s*\d+)(?:\s+[·•]\s+\d+)?(?:\s+[·•]\s+赞\s+\d+)?\s*$",
        r"## \1",
        text,
        flags=re.M,
    )
    # Keep ATX headings in their own markdown blocks so they render as <h2>.
    text = re.sub(r"^(#{2,4} .+)$", r"\n\1\n", text, flags=re.M)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text, omitted_code


def md_to_html(text: str) -> str:
    """Conservative markdown-to-HTML for archived post bodies."""
    text = text.replace("\r\n", "\n").strip()
    if not text:
        return ""

    def fmt_inline(s: str) -> str:
        s = html.escape(s)
        s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener noreferrer">\1</a>', s)
        s = re.sub(r"(?<!href=\")(?<!>)(https?://[^\s<]+)", r'<a href="\1" target="_blank" rel="noopener noreferrer">\1</a>', s)
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<em>\1</em>", s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        return s

    blocks = re.split(r"\n\n+", text)
    out = []
    for block in blocks:
        raw = block.strip("\n")
        if not raw.strip():
            continue
        first = raw.lstrip()
        # fenced code
        if first.startswith("```"):
            code = re.sub(r"^```[^\n]*\n?", "", raw)
            code = re.sub(r"\n?```$", "", code)
            out.append(f"<pre><code>{html.escape(code)}</code></pre>")
            continue
        # heading
        m = re.match(r"^(#{2,4})\s+(.+)$", first, re.S)
        if m and "\n" not in raw.strip():
            level = min(len(m.group(1)), 4)
            out.append(f"<h{level}>{fmt_inline(m.group(2).strip())}</h{level}>")
            continue
        lines = raw.split("\n")
        # unordered list
        if all(re.match(r"^\s*([-*•]|▸)\s+", ln) or not ln.strip() for ln in lines if ln.strip()):
            items = [re.sub(r"^\s*([-*•]|▸)\s+", "", ln) for ln in lines if ln.strip()]
            out.append("<ul>" + "".join(f"<li>{fmt_inline(it)}</li>" for it in items) + "</ul>")
            continue
        # ordered list
        if all(re.match(r"^\s*\d+[.)、]\s+", ln) or not ln.strip() for ln in lines if ln.strip()):
            items = [re.sub(r"^\s*\d+[.)、]\s+", "", ln) for ln in lines if ln.strip()]
            out.append("<ol>" + "".join(f"<li>{fmt_inline(it)}</li>" for it in items) + "</ol>")
            continue
        para = "<br>".join(fmt_inline(ln) for ln in lines)
        out.append(f"<p>{para}</p>")
    return "\n".join(out)


def make_excerpt(text: str, limit: int = 420) -> str:
    lines = text.replace("\r\n", "\n").split("\n")
    while lines and (not lines[0].strip() or lines[0].lstrip().startswith("#")):
        lines.pop(0)
    compact = re.sub(r"\n{2,}", "\n\n", "\n".join(lines)).strip()
    if len(compact) <= limit:
        return compact
    cut = compact[:limit]
    # break at paragraph or sentence
    for sep in ["\n\n", "。", "！", "？", ". ", "\n"]:
        i = cut.rfind(sep)
        if i >= limit * 0.55:
            cut = cut[: i + (0 if sep == "\n\n" or sep == "\n" else len(sep))]
            break
    return cut.strip()


def optimize_image(src: Path, dest: Path, max_side: int) -> dict:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if os.environ.get("SKIP_MEDIA") == "1" and dest.is_file():
        try:
            with Image.open(dest) as im:
                return {"width": im.size[0], "height": im.size[1], "bytes": dest.stat().st_size}
        except OSError:
            pass
    with Image.open(src) as im:
        if im.mode in ("P", "RGBA", "LA"):
            rgba = im.convert("RGBA")
            bg = Image.new("RGB", rgba.size, (231, 236, 245))
            bg.paste(rgba, mask=rgba.split()[-1])
            im = bg
        elif im.mode != "RGB":
            im = im.convert("RGB")
        w, h = im.size
        scale = min(1.0, max_side / max(w, h))
        if scale < 1:
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
        im.save(dest, "WEBP", quality=WEBP_QUALITY, method=6)
        ow, oh = im.size
    return {"width": ow, "height": oh, "bytes": dest.stat().st_size}


def make_icons():
    """Simple seal-like favicon and apple touch icon."""
    def seal(size: int, path: Path, radius_ratio=0.28):
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        # azurite rounded square chop
        r1 = int(size * 0.38)
        r2 = int(size * 0.14)
        # We'll draw a simple rounded rect
        pad = int(size * 0.06)
        d.rounded_rectangle(
            [pad, pad, size - pad, size - pad],
            radius=r1,
            fill=(33, 86, 164, 255),
        )
        # character 藏
        try:
            font = ImageFont.truetype(
                "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc",
                int(size * 0.52),
            )
        except OSError:
            try:
                font = ImageFont.truetype(
                    "/usr/share/fonts/truetype/noto/NotoSerifCJK-Bold.ttc",
                    int(size * 0.52),
                )
            except OSError:
                font = ImageFont.load_default()
        text = "藏"
        bbox = d.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (size - tw) / 2 - bbox[0]
        y = (size - th) / 2 - bbox[1] - size * 0.03
        d.text((x, y), text, font=font, fill=(245, 248, 252, 255))
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path, "PNG")

    # find a CJK font
    font_candidates = list(Path("/usr/share/fonts").rglob("*Serif*CJK*")) + list(
        Path("/usr/share/fonts").rglob("*NotoSerifSC*")
    ) + list(Path("/usr/share/fonts").rglob("*NotoSansCJK*")) + list(
        Path("/usr/share/fonts").rglob("*NotoSansSC*")
    ) + list(Path("/usr/share/fonts").rglob("*WenQuanYi*")) + list(
        Path("/usr/share/fonts").rglob("*SourceHan*")
    )
    seal(32, SITE / "favicon.png")
    seal(180, SITE / "apple-touch-icon.png")
    print("icons fonts found:", len(font_candidates), font_candidates[:5])


def main():
    src = json.loads((ARCHIVE / "cards.json").read_text(encoding="utf-8"))
    cards_in = src["cards"]
    if not cards_in:
        raise SystemExit("archive cards.json has no cards")

    MEDIA.mkdir(parents=True, exist_ok=True)
    ARTICLES.mkdir(parents=True, exist_ok=True)

    def _wipe(root: Path) -> None:
        for p in root.glob("*"):
            if p.is_dir():
                for f in p.glob("*"):
                    if f.is_file():
                        f.unlink()
                p.rmdir()
            else:
                p.unlink()

    skip_media = os.environ.get("SKIP_MEDIA") == "1"
    if not skip_media:
        # clean previous media and article payloads (notes live in archive cards.json)
        _wipe(MEDIA)
    _wipe(ARTICLES)

    # Preserve handmade notes already on the site if the archive entry is empty.
    prev_notes = {}
    prev_path = DATA / "cards.json"
    if prev_path.is_file():
        try:
            prev = json.loads(prev_path.read_text(encoding="utf-8"))
            for old in prev.get("cards") or []:
                note = (old.get("note") or "").strip()
                if note:
                    prev_notes[str(old.get("id"))] = old.get("note") or ""
        except (OSError, json.JSONDecodeError):
            prev_notes = {}

    out_cards = []
    covers_copied = 0
    extras_copied = 0
    missing_cover = []
    missing_text = []
    has_article = 0

    for c in cards_in:
        cid = str(c["id"])
        archived = c.get("archived") or None
        cover = c.get("cover") or None
        card = {
            "id": cid,
            "url": c["url"],
            "author": c["author"],
            "handle": c["handle"],
            "date": c["date"],
            "title": c["title"],
            "summary": c["summary"],
            "note": (c.get("note") or "").strip() or prev_notes.get(cid, ""),
            "cat": c["cat"] or "待分类",
            "likes": c.get("likes"),
            "saves": c.get("saves"),
            "views": c.get("views"),
            "cover": None,
            "coverWidth": None,
            "coverHeight": None,
            "media": [],
            "excerpt": "",
            "hasArticle": False,
            "omittedCode": False,
        }

        arch_dir = ARCHIVE / archived if archived else None
        images = []
        if arch_dir and (arch_dir / "images").is_dir():
            images = sorted(
                [p for p in (arch_dir / "images").iterdir() if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif"}],
                key=lambda p: p.name,
            )

        dest_dir = MEDIA / cid
        if cover and arch_dir:
            src_cover = arch_dir / cover
            if src_cover.is_file():
                dest = dest_dir / "cover.webp"
                info = optimize_image(src_cover, dest, COVER_MAX)
                card["cover"] = f"media/{cid}/cover.webp"
                card["coverWidth"] = info["width"]
                card["coverHeight"] = info["height"]
                covers_copied += 1
            else:
                missing_cover.append(cid)

        # extras, skip the cover file
        cover_name = Path(cover).name if cover else None
        extras = [p for p in images if p.name != cover_name][:MAX_EXTRAS]
        for i, src_img in enumerate(extras, start=1):
            dest = dest_dir / f"{i}.webp"
            info = optimize_image(src_img, dest, GALLERY_MAX)
            card["media"].append({
                "src": f"media/{cid}/{i}.webp",
                "width": info["width"],
                "height": info["height"],
            })
            extras_copied += 1

        body = ""
        omitted = False
        md_path = arch_dir / "content.md" if arch_dir else None
        thread_path = arch_dir / "thread.md" if arch_dir else None
        source_md = None
        if thread_path and thread_path.is_file():
            source_md = thread_path
        elif md_path and md_path.is_file():
            source_md = md_path
        if source_md:
            body, omitted = extract_body(source_md.read_text(encoding="utf-8"))
        if not body:
            missing_text.append(cid)
        else:
            excerpt = make_excerpt(body, 420)
            card["excerpt"] = excerpt
            card["omittedCode"] = omitted
            # Always store full article if we have body longer than a short post,
            # or even for short posts so the back can show clean body without metadata.
            html_body = md_to_html(body)
            is_long = len(body) > 600
            card["hasArticle"] = is_long
            if is_long:
                (ARTICLES / f"{cid}.json").write_text(
                    json.dumps(
                        {
                            "id": cid,
                            "title": c["title"],
                            "html": html_body,
                            "omittedCode": omitted,
                        },
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                    encoding="utf-8",
                )
                has_article += 1
            else:
                # short posts: include bodyHtml in the card so the flip side can use it
                card["bodyHtml"] = html_body

        out_cards.append(card)

    payload = {
        "title": "X 帖子收藏卡",
        "updated": src.get("updated_at_beijing"),
        "count": len(out_cards),
        "cards": out_cards,
    }
    (DATA / "cards.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    if os.environ.get("SKIP_MEDIA") != "1":
        make_icons()
    print(
        json.dumps(
            {
                "cards": len(out_cards),
                "covers_copied": covers_copied,
                "extras_copied": extras_copied,
                "articles": has_article,
                "missing_cover_file": missing_cover,
                "no_body_text": missing_text,
                "media_bytes": sum(p.stat().st_size for p in MEDIA.rglob("*.webp")),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
