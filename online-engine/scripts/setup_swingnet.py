from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTERNAL = ROOT / "external"
GOLFDB = EXTERNAL / "golfdb"
MODELS = GOLFDB / "models"
SWINGNET_FILE_ID = "1MBIDwHSM8OKRbxS8YfyRLnUBAdt0nupW"
SWINGNET_OUT = MODELS / "swingnet_1800.pth.tar"


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print("$", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(cwd) if cwd else None)


def clone_repo(force: bool = False) -> None:
    EXTERNAL.mkdir(parents=True, exist_ok=True)
    if GOLFDB.exists() and (GOLFDB / "MobileNetV2.py").exists() and not force:
        print(f"GolfDB repo already present: {GOLFDB}")
        return
    if GOLFDB.exists() and force:
        import shutil
        shutil.rmtree(GOLFDB)
    run(["git", "clone", "https://github.com/wmcnally/golfdb.git", str(GOLFDB)])


def install_gdown() -> None:
    try:
        import gdown  # noqa: F401
    except Exception:
        run([sys.executable, "-m", "pip", "install", "gdown>=5.2.0"])


def download_weights() -> None:
    install_gdown()
    import gdown
    MODELS.mkdir(parents=True, exist_ok=True)
    if SWINGNET_OUT.exists() and SWINGNET_OUT.stat().st_size > 1024:
        print(f"SwingNet weights already present: {SWINGNET_OUT}")
        return
    url = f"https://drive.google.com/uc?id={SWINGNET_FILE_ID}"
    print(f"Downloading SwingNet pretrained weights to {SWINGNET_OUT}")
    gdown.download(url, str(SWINGNET_OUT), quiet=False)
    if not SWINGNET_OUT.exists() or SWINGNET_OUT.stat().st_size < 1024:
        raise SystemExit(
            "Weights download did not complete. Google Drive may require browser confirmation. "
            "Open the GolfDB README link manually and place swingnet_1800.pth.tar in external/golfdb/models/."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Install optional GolfDB/SwingNet assets for Swing Lab backend.")
    parser.add_argument("--force-clone", action="store_true", help="Delete and re-clone external/golfdb.")
    parser.add_argument("--download-weights", action="store_true", help="Download pretrained SwingNet weights from the GolfDB README link.")
    args = parser.parse_args()
    clone_repo(force=args.force_clone)
    if args.download_weights:
        download_weights()
    print("\nDone. Next checks:")
    print("  python -m pip install -r requirements-ml.txt")
    print("  python -m uvicorn main:app --host 0.0.0.0 --port 8000")
    print("  open http://localhost:8000/api/research/swingnet/status")


if __name__ == "__main__":
    main()
