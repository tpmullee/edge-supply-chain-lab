from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
STAGE = BUILD / "lambda"
ZIP_PATH = BUILD / "eta-ml-v1-lambda.zip"

REQUIRED = [
    ROOT / "lambda_handler.py",
    ROOT / "src" / "__init__.py",
    ROOT / "src" / "runtime.py",
    ROOT / "artifacts" / "eta_model.json",
]


def package_lambda() -> Path:
    missing = [str(path.relative_to(ROOT)) for path in REQUIRED if not path.exists()]
    if missing:
        raise SystemExit(
            "Missing generated runtime files: "
            + ", ".join(missing)
            + ". Run python train.py first."
        )

    if BUILD.exists():
        shutil.rmtree(BUILD)
    (STAGE / "src").mkdir(parents=True)
    (STAGE / "artifacts").mkdir(parents=True)

    shutil.copy2(ROOT / "lambda_handler.py", STAGE / "lambda_handler.py")
    shutil.copy2(ROOT / "src" / "__init__.py", STAGE / "src" / "__init__.py")
    shutil.copy2(ROOT / "src" / "runtime.py", STAGE / "src" / "runtime.py")
    shutil.copy2(ROOT / "artifacts" / "eta_model.json", STAGE / "artifacts" / "eta_model.json")

    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(STAGE.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(STAGE))

    print(f"Built {ZIP_PATH} ({ZIP_PATH.stat().st_size:,} bytes)")
    return ZIP_PATH


if __name__ == "__main__":
    package_lambda()
