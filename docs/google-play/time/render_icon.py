import zlib, struct, sys, math
N=int(sys.argv[2]); out=sys.argv[1]; k=N/108.0; SS=3
def hexc(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
BG,FACE,HAND,GOLD=hexc('#103E36'),hexc('#E7F2E9'),hexc('#103E36'),hexc('#D7A94B')
def segd(px,py,ax,ay,bx,by):
    dx,dy=bx-ax,by-ay; t=max(0,min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)))
    return math.hypot(px-(ax+t*dx),py-(ay+t*dy))
def color(x,y):
    c=BG
    if math.hypot(x-54,y-54)<=32: c=FACE
    if segd(x,y,54,34,54,55)<=3 or segd(x,y,54,55,69,64)<=3: c=HAND
    if math.hypot(x-79,y-29)<=9: c=GOLD
    return c
rows=[]
for j in range(N):
    row=bytearray([0])
    for i in range(N):
        r=g=b=0
        for sj in range(SS):
            for si in range(SS):
                x=(i+(si+.5)/SS)/k; y=(j+(sj+.5)/SS)/k
                c=color(x,y); r+=c[0]; g+=c[1]; b+=c[2]
        n=SS*SS; row+=bytes([r//n,g//n,b//n,255])
    rows.append(bytes(row))
raw=b''.join(rows)
def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',N,N,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
open(out,'wb').write(png)
