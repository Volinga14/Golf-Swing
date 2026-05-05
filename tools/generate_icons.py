from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app" / "assets"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        make_icon(size).save(OUT / f"icon-{size}.png")
        make_icon(size, maskable=True).save(OUT / f"icon-maskable-{size}.png")


def make_icon(size: int, maskable: bool = False) -> Image.Image:
    bg = "#163832"
    fg = "#f7f2dc"
    gold = "#c99432"
    img = Image.new("RGBA", (size, size), bg)
    draw = ImageDraw.Draw(img)
    pad = int(size * (0.18 if maskable else 0.12))
    stroke = max(5, size // 28)
    # Club shaft
    draw.line(
        [(pad * 1.15, size - pad * 1.25), (size * 0.62, pad * 0.85)],
        fill=fg,
        width=stroke,
        joint="curve",
    )
    # Ground line
    draw.line(
        [(pad * 0.9, size - pad), (size - pad * 0.85, size - pad)],
        fill=fg,
        width=stroke,
    )
    # Club head
    draw.arc(
        [pad * 0.75, size - pad * 1.55, pad * 1.85, size - pad * 0.65],
        start=20,
        end=175,
        fill=gold,
        width=stroke,
    )
    # Ball
    r = size * 0.055
    cx = size * 0.72
    cy = size - pad * 1.35
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fg)
    return img


if __name__ == "__main__":
    main()
