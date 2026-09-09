import zlib, struct, os, math

def load_png(path):
    with open(path, 'rb') as f: data = f.read()
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
    return w, h, pixels

def write_png(filename, width, height, rgba_data):
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    def make_chunk(ctype, data):
        crc = zlib.crc32(ctype + data) & 0xffffffff
        return struct.pack('>I', len(data)) + ctype + data + struct.pack('>I', crc)
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw.extend(rgba_data[y * width * 4 : (y + 1) * width * 4])
    compressed = zlib.compress(bytes(raw))
    png = b'\x89PNG\r\n\x1a\n' + make_chunk(b'IHDR', ihdr) + make_chunk(b'IDAT', compressed) + make_chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, 'wb') as f: f.write(png)

def crop_and_scale(pixels, w, h, target_h=62):
    opaque = [(x, y) for y in range(h) for x in range(w) if pixels[y][x][3] > 0]
    if not opaque: return []
    min_x, max_x = min(pt[0] for pt in opaque), max(pt[0] for pt in opaque)
    min_y, max_y = min(pt[1] for pt in opaque), max(pt[1] for pt in opaque)
    cw = max_x - min_x + 1
    ch = max_y - min_y + 1
    cropped = [[pixels[min_y + y][min_x + x] for x in range(cw)] for y in range(ch)]
    target_w = int(cw * (target_h / ch))
    downscaled = [[None]*target_w for _ in range(target_h)]
    for dy in range(target_h):
        sy = int(dy * ch / target_h)
        for dx in range(target_w):
            sx = int(dx * cw / target_w)
            downscaled[dy][dx] = cropped[sy][sx]
    return downscaled

def rotate_sprite(spr, angle_rad):
    sh = len(spr)
    sw = len(spr[0])
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    cx, cy = sw / 2.0, sh / 2.0
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
            ox = (nx - ncx)*cos_a + (ny - ncy)*sin_a + cx
            oy = -(nx - ncx)*sin_a + (ny - ncy)*cos_a + cy
            ix = int(round(ox))
            iy = int(round(oy))
            if 0 <= ix < sw and 0 <= iy < sh:
                res[ny][nx] = spr[iy][ix]
    return res

def create_frame(sprite, offset_x=0, offset_y=0, tint=None):
    frame_w, frame_h = 200, 200
    frame = [[[0,0,0,0] for _ in range(frame_w)] for _ in range(frame_h)]
    sh = len(sprite)
    sw = len(sprite[0])
    # Baseline feet at Y=124, center at X=100
    start_y = 124 - sh + offset_y
    start_x = 100 - sw // 2 + offset_x
    for sy in range(sh):
        for sx in range(sw):
            c = sprite[sy][sx]
            if c[3] > 0:
                fx = start_x + sx
                fy = start_y + sy
                if 0 <= fx < frame_w and 0 <= fy < frame_h:
                    if tint:
                        r = int(c[0] * (1 - tint[3]) + tint[0] * tint[3])
                        g = int(c[1] * (1 - tint[3]) + tint[1] * tint[3])
                        b = int(c[2] * (1 - tint[3]) + tint[2] * tint[3])
                        frame[fy][fx] = [r, g, b, c[3]]
                    else:
                        frame[fy][fx] = c
    return frame

def punch_extend(sprite, reach_px, punch_y_ratio=0.35):
    sh = len(sprite)
    sw = len(sprite[0])
    new_w = sw + reach_px
    res = [[[0,0,0,0] for _ in range(new_w)] for _ in range(sh)]
    for y in range(sh):
        for x in range(sw):
            res[y][x] = sprite[y][x]
    py_min = int(sh * 0.20)
    py_max = int(sh * 0.55)
    for step in range(1, reach_px + 1):
        for y in range(py_min, py_max):
            right_x = -1
            for x in range(sw - 1, -1, -1):
                if sprite[y][x][3] > 0:
                    right_x = x
                    break
            if right_x > sw * 0.6:
                col = sprite[y][right_x]
                nx = min(new_w - 1, right_x + step)
                res[y][nx] = col
    fist_color_skin = [238, 172, 126, 255]
    fist_color_outline = [43, 27, 23, 255]
    fist_cx = new_w - 4
    fist_cy = int(sh * punch_y_ratio)
    for dy in range(-3, 4):
        for dx in range(-4, 4):
            fy = fist_cy + dy
            fx = fist_cx + dx
            if 0 <= fy < sh and 0 <= fx < new_w:
                is_outline = abs(dy) == 3 or abs(dx) == 4
                res[fy][fx] = fist_color_outline if is_outline else fist_color_skin
    return res

def assemble_spritesheet(frames):
    num_frames = len(frames)
    frame_w, frame_h = 200, 200
    total_w = frame_w * num_frames
    sheet = bytearray(total_w * frame_h * 4)
    for f_idx, frame in enumerate(frames):
        for y in range(frame_h):
            for x in range(frame_w):
                dst_x = f_idx * frame_w + x
                dst_idx = (y * total_w + dst_x) * 4
                col = frame[y][x]
                sheet[dst_idx : dst_idx + 4] = bytearray(col)
    return total_w, frame_h, sheet

# Main execution
w1, h1, p1 = load_png('/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/top_left.png')
w2, h2, p2 = load_png('/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/bot_left.png')
w3, h3, p3 = load_png('/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/top_center.png')

top_left = crop_and_scale(p1, w1, h1, 62)
bot_left = crop_and_scale(p2, w2, h2, 62)
top_center = crop_and_scale(p3, w3, h3, 62)

out_dir = '/Users/kurenai/.gemini/antigravity/scratch/phaser-fighter/public/assets/gladiator'

# A. Idle (4 frames)
idle_f0 = create_frame(bot_left, offset_x=0, offset_y=0)
idle_f1 = create_frame(bot_left, offset_x=0, offset_y=1)
idle_f2 = create_frame(top_left, offset_x=0, offset_y=0)
idle_f3 = create_frame(top_left, offset_x=0, offset_y=-1)
w, h, data = assemble_spritesheet([idle_f0, idle_f1, idle_f2, idle_f3])
write_png(f'{out_dir}/Idle.png', w, h, data)
print('Generated Idle.png (4 frames)')

# B. Run (8 frames)
run_frames = []
for i in range(8):
    bob = [ -2, 0, 2, 0, -2, 0, 2, 0 ][i]
    fwd = [ 0, 2, 4, 3, 0, 2, 4, 3 ][i]
    base_pose = bot_left if (i % 2 == 0) else top_left
    run_frames.append(create_frame(base_pose, offset_x=fwd, offset_y=bob))
w, h, data = assemble_spritesheet(run_frames)
write_png(f'{out_dir}/Run.png', w, h, data)
print('Generated Run.png (8 frames)')

# C. Jump (2 frames)
jump_f0 = create_frame(top_left, offset_x=0, offset_y=-5)
jump_f1 = create_frame(bot_left, offset_x=0, offset_y=-12)
w, h, data = assemble_spritesheet([jump_f0, jump_f1])
write_png(f'{out_dir}/Jump.png', w, h, data)
print('Generated Jump.png (2 frames)')

# D. Fall (2 frames)
fall_f0 = create_frame(bot_left, offset_x=0, offset_y=-8)
fall_f1 = create_frame(top_left, offset_x=0, offset_y=-2)
w, h, data = assemble_spritesheet([fall_f0, fall_f1])
write_png(f'{out_dir}/Fall.png', w, h, data)
print('Generated Fall.png (2 frames)')

# E. Attack1 (4 frames)
atk1_f0 = create_frame(bot_left, offset_x=-3, offset_y=0)
atk1_f1 = create_frame(punch_extend(top_left, 14), offset_x=4, offset_y=0)
atk1_f2 = create_frame(punch_extend(top_left, 24), offset_x=8, offset_y=0)
atk1_f3 = create_frame(top_left, offset_x=2, offset_y=0)
w, h, data = assemble_spritesheet([atk1_f0, atk1_f1, atk1_f2, atk1_f3])
write_png(f'{out_dir}/Attack1.png', w, h, data)
print('Generated Attack1.png (4 frames)')

# F. Attack2 (6 frames)
atk2_f0 = create_frame(top_center, offset_x=-6, offset_y=-2)
atk2_f1 = create_frame(top_left, offset_x=4, offset_y=0)
atk2_f2 = create_frame(punch_extend(top_left, 32), offset_x=12, offset_y=0)
atk2_f3 = create_frame(punch_extend(top_left, 36), offset_x=14, offset_y=0)
atk2_f4 = create_frame(punch_extend(top_left, 16), offset_x=6, offset_y=0)
atk2_f5 = create_frame(bot_left, offset_x=0, offset_y=0)
w, h, data = assemble_spritesheet([atk2_f0, atk2_f1, atk2_f2, atk2_f3, atk2_f4, atk2_f5])
write_png(f'{out_dir}/Attack2.png', w, h, data)
print('Generated Attack2.png (6 frames)')

# G. Take Hit (3 frames)
hit_f0 = create_frame(rotate_sprite(bot_left, math.radians(-12)), offset_x=-12, offset_y=-3, tint=[255, 100, 100, 0.4])
hit_f1 = create_frame(rotate_sprite(bot_left, math.radians(-8)), offset_x=-8, offset_y=-1)
hit_f2 = create_frame(top_left, offset_x=-3, offset_y=0)
w, h, data = assemble_spritesheet([hit_f0, hit_f1, hit_f2])
write_png(f'{out_dir}/Take Hit.png', w, h, data)
print('Generated Take Hit.png (3 frames)')

# H. Death (6 frames)
d_f0 = create_frame(rotate_sprite(bot_left, math.radians(-25)), offset_x=-14, offset_y=-10)
d_f1 = create_frame(rotate_sprite(bot_left, math.radians(-50)), offset_x=-25, offset_y=-14)
d_f2 = create_frame(rotate_sprite(bot_left, math.radians(-75)), offset_x=-36, offset_y=-4)
d_f3 = create_frame(rotate_sprite(bot_left, math.radians(-90)), offset_x=-42, offset_y=16)
d_f4 = create_frame(rotate_sprite(bot_left, math.radians(-90)), offset_x=-44, offset_y=13)
d_f5 = create_frame(rotate_sprite(bot_left, math.radians(-90)), offset_x=-45, offset_y=16)
w, h, data = assemble_spritesheet([d_f0, d_f1, d_f2, d_f3, d_f4, d_f5])
write_png(f'{out_dir}/Death.png', w, h, data)
print('Generated Death.png (6 frames)')

print('=== ALL 8 GLADIATOR SPRITESHEETS GENERATED SUCCESSFULLY! ===')
