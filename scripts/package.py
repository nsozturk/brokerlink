#!/usr/bin/env python3
"""Build installable packages into dist/: brokerlink-chrome-<v>.zip, brokerlink-firefox-<v>.xpi and,
when a signing key is given, brokerlink-chrome-<v>.crx.
Usage: python3 scripts/package.py [--key /path/to/key.pem]    (the key stays outside the repo)"""
import json, os, shutil, subprocess, sys, tempfile, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT, DIST = os.path.join(ROOT, "extension"), os.path.join(ROOT, "dist")
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
manifest = json.load(open(os.path.join(EXT, "manifest.json")))
v = manifest["version"]
os.makedirs(DIST, exist_ok=True)


def zip_dir(src, out):
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(src):
            for f in sorted(files):
                if f != ".DS_Store":
                    full = os.path.join(base, f)
                    z.write(full, os.path.relpath(full, src))
    print(os.path.relpath(out, ROOT))


zip_dir(EXT, os.path.join(DIST, f"brokerlink-chrome-{v}.zip"))

# Firefox: MV3 background is an event page (scripts), and the add-on needs a gecko id.
tmp = tempfile.mkdtemp(prefix="brokerlink-ff-")
shutil.copytree(EXT, tmp, dirs_exist_ok=True)
ff = dict(manifest)
ff["background"] = {"scripts": ["background.js"]}
ff["browser_specific_settings"] = {"gecko": {"id": "brokerlink@nsozturk.github.io", "strict_min_version": "121.0"}}
json.dump(ff, open(os.path.join(tmp, "manifest.json"), "w"), indent=2)
zip_dir(tmp, os.path.join(DIST, f"brokerlink-firefox-{v}.xpi"))
shutil.rmtree(tmp)

if "--key" in sys.argv:
    key = sys.argv[sys.argv.index("--key") + 1]
    tmp = tempfile.mkdtemp(prefix="brokerlink-crx-")
    src = os.path.join(tmp, "brokerlink")
    shutil.copytree(EXT, src)
    args = [CHROME, f"--pack-extension={src}"] + ([f"--pack-extension-key={key}"] if os.path.exists(key) else [])
    subprocess.run(args, check=True, capture_output=True)
    if not os.path.exists(key):                      # first run: Chrome generated the key next to the folder
        os.makedirs(os.path.dirname(key), exist_ok=True)
        shutil.move(src + ".pem", key)
        os.chmod(key, 0o600)
    out = os.path.join(DIST, f"brokerlink-chrome-{v}.crx")
    shutil.move(src + ".crx", out)
    shutil.rmtree(tmp)
    print(os.path.relpath(out, ROOT))
