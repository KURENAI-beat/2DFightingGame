import zlib, struct, os, math

# Load top_left
with open('/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/top_left.png', 'rb') as f: data = f.read()
w, h = struct.unpack('>II', data[16:24])
pos = 8
idat = []
while pos < len(data):
    l, ct = struct.unpack('>I4s', data[pos:pos+8])
    if ct == b'IDAT': idat.append(data[pos+8:pos+8+l])
    pos += 8 + l + 4
decomp = zlib.decompress(b''.join(idat))
stride = 1 + w * 4
pixels = []
for y in range(h):
    row = decomp[y*stride+1:(y+1)*stride]
    pixels.append([list(row[x*4:x*4+4]) for x in range(w)])

# Find bounds
opaque = [(x, y) for y in range(h) for x in range(w) if pixels[y][x][3] > 0]
min_x, max_x = min(pt[0] for pt in opaque), max(pt[0] for pt in opaque)
min_y, max_y = min(pt[1] for pt in opaque), max(pt[1] for pt in opaque)
cw = max_x - min_x + 1
ch = max_y - min_y + 1

cropped = [[pixels[min_y + y][min_x + x] for x in range(cw)] for y in range(ch)]
target_h = 62
target_w = int(cw * (target_h / ch))
downscaled = [[None]*target_w for _ in range(target_h)]
for dy in range(target_h):
    sy = int(dy * ch / target_h)
    for dx in range(target_w):
        sx = int(dx * cw / target_w)
        downscaled[dy][dx] = cropped[sy][sx]

def rotate_sprite(spr, angle_rad):
    sh = len(spr)
    sw = len(spr[0])
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    cx, cy = sw / 2.0, sh / 2.0
    # Determine new bounds
    corners = [(0, 0), (sw, 0), (0, sh), (sw, sh)]
    rot_corners = [( (x - cx)*cos_a - (y - cy)*sin_a, (x - cx)*sin_a + (y - cy)*cos_a ) for x, y in corners]
    min_rx = min(p[0] for p in rot_corners)
    max_rx = max(p[0] for p in rot_corners)
    min_ry = min(p[1] for p in rot_corners)
    max_ry = max(p[1] for p in rot_corners)
    nw = int(math.ceil(max_rx - min_rx))
    nh = int(math.ceil(max_ry - min_ry))
    ncx = nw / 2.0
    ncy = nh / 2.0
    res = [[[0,0,0,0] for _ in range(nw)] for _ in range(nh)]
    for ny in range(nh):
        for nx in range(nw):
            # Inverse map
            ox = (nx - ncx)*cos_a + (ny - ncy)*sin_a + cx
            oy = -(nx - ncx)*sin_a + (ny - ncy)*cos_a + cy
            ix = int(round(ox))
            iy = int(round(oy))
            if 0 <= ix < sw and 0 <= iy < sh:
                res[ny][nx] = spr[iy][ix]
    return res

rotated = rotate_sprite(downscaled, math.radians(-75))
print('Rotated shape:', len(rotated[0]), 'x', len(rotated))
