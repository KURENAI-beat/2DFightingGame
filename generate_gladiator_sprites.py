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

def crop_and_scale(pixels, w, h, target_h):
    opaque = [(x, y) for y in range(h) for x in range(w) if pixels[y][x][3] > 0]
    if not opaque:
        return 0, 0, []
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
    return target_w, target_h, downscaled

print('Helper functions loaded successfully.')
