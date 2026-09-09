import urllib.request
import os
import ssl

ctx = ssl._create_unverified_context()

BASE_URL = "https://raw.githubusercontent.com/chriscourses/fighting-game/main/img"

assets = [
    ("background.png", f"{BASE_URL}/background.png"),
    ("shop.png", f"{BASE_URL}/shop.png"),
    ("samuraiMack/Idle.png", f"{BASE_URL}/samuraiMack/Idle.png"),
    ("samuraiMack/Run.png", f"{BASE_URL}/samuraiMack/Run.png"),
    ("samuraiMack/Jump.png", f"{BASE_URL}/samuraiMack/Jump.png"),
    ("samuraiMack/Fall.png", f"{BASE_URL}/samuraiMack/Fall.png"),
    ("samuraiMack/Attack1.png", f"{BASE_URL}/samuraiMack/Attack1.png"),
    ("samuraiMack/Take Hit.png", f"{BASE_URL}/samuraiMack/Take%20Hit.png"),
    ("kenji/Idle.png", f"{BASE_URL}/kenji/Idle.png"),
    ("kenji/Run.png", f"{BASE_URL}/kenji/Run.png"),
    ("kenji/Jump.png", f"{BASE_URL}/kenji/Jump.png"),
    ("kenji/Fall.png", f"{BASE_URL}/kenji/Fall.png"),
    ("kenji/Attack1.png", f"{BASE_URL}/kenji/Attack1.png"),
    ("kenji/Take hit.png", f"{BASE_URL}/kenji/Take%20hit.png"),
]

target_dir = "/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/public/assets"

for rel_path, url in assets:
    full_path = os.path.join(target_dir, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    print(f"Downloading {rel_path}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ctx) as response, open(full_path, 'wb') as out_file:
        out_file.write(response.read())

print("All assets downloaded successfully!")
