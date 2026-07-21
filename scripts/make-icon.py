import zlib, struct, math
N = 1024
# palette
BG   = (15, 23, 42, 255)     # slate-900 rounded tile
ACC  = (56, 189, 248, 255)   # sky-400 hub ring + center
DOT  = (125, 211, 252, 255)  # sky-300 connector dots
TRANSP = (0,0,0,0)
cx = cy = N/2
corner = 180              # rounded-tile radius
def in_tile(x,y):
    # rounded square: inside if within the inset rect, or within corner circles
    ix = min(max(x, corner), N-corner)
    iy = min(max(y, corner), N-corner)
    return (x-ix)**2 + (y-iy)**2 <= corner*corner
ring_out, ring_in = 360, 258
center_r = 118
dot_r, dot_dist = 46, 430
dots = [(cx, cy-dot_dist),(cx, cy+dot_dist),(cx-dot_dist, cy),(cx+dot_dist, cy)]
def px(x,y):
    if not in_tile(x,y): return TRANSP
    d = math.hypot(x-cx, y-cy)
    for dx,dy in dots:
        if math.hypot(x-dx, y-dy) <= dot_r: return DOT
    if d <= center_r: return ACC
    if ring_in <= d <= ring_out: return ACC
    return BG
raw = bytearray()
for y in range(N):
    raw.append(0)  # filter: none
    row = bytearray()
    for x in range(N):
        row += bytes(px(x+0.5, y+0.5))
    raw += row
def chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
ihdr = struct.pack('>IIBBBBB', N, N, 8, 6, 0, 0, 0)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
open('icon-src.png','wb').write(png)
print("wrote icon-src.png", N, "x", N)
