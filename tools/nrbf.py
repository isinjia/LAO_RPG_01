"""최소한의 .NET BinaryFormatter(MS-NRBF) 해석기 + 라스트오리진 표 복호화 (DES-CBC, 키·IV "smArtjoy").
load_table(path) -> 표 행(dict) 목록."""
import struct

KEY = b'smArtjoy'


def decrypt(data):
    from cryptography.hazmat.primitives.ciphers import Cipher, modes
    try:
        from cryptography.hazmat.decrepit.ciphers.algorithms import TripleDES
    except ImportError:
        from cryptography.hazmat.primitives.ciphers.algorithms import TripleDES
    d = Cipher(TripleDES(KEY * 3), modes.CBC(KEY)).decryptor()
    out = d.update(data) + d.finalize()
    return out[:-out[-1]]


class Ref:
    __slots__ = ('id',)

    def __init__(self, i):
        self.id = i


class Obj(dict):
    cls = ''


class Reader:
    def __init__(self, b):
        self.b, self.p = b, 0
        self.objs, self.meta = {}, {}

    def u8(self):
        v = self.b[self.p]; self.p += 1; return v

    def i32(self):
        v = struct.unpack_from('<i', self.b, self.p)[0]; self.p += 4; return v

    def s(self):
        n, sh = 0, 0
        while True:
            c = self.u8(); n |= (c & 0x7f) << sh; sh += 7
            if c < 0x80: break
        v = self.b[self.p:self.p + n].decode('utf8'); self.p += n; return v

    def prim(self, t):
        fmt = {1: '<?', 2: '<B', 6: '<d', 7: '<h', 8: '<i', 9: '<q', 10: '<b', 11: '<f', 12: '<q', 13: '<q', 14: '<H', 15: '<I', 16: '<Q'}
        if t == 18: return self.s()
        if t == 5: return self.s()
        if t == 3:  # utf8 문자 하나
            c = self.b[self.p]; n = 1 if c < 0x80 else 2 if c < 0xe0 else 3 if c < 0xf0 else 4
            v = self.b[self.p:self.p + n].decode('utf8'); self.p += n; return v
        f = fmt[t]; v = struct.unpack_from(f, self.b, self.p)[0]; self.p += struct.calcsize(f); return v

    def classinfo(self):
        oid = self.i32(); name = self.s(); n = self.i32()
        return oid, name, [self.s() for _ in range(n)]

    def typeinfo(self, n):
        bt = [self.u8() for _ in range(n)]
        extra = []
        for t in bt:
            if t in (0, 7): extra.append(self.u8())
            elif t == 3: extra.append(self.s())
            elif t == 4: extra.append((self.s(), self.i32()))
            else: extra.append(None)
        return list(zip(bt, extra))

    def values(self, oid, name, names, types):
        o = Obj(); o.cls = name
        self.objs[oid] = o
        for nm, (bt, ex) in zip(names, types):
            o[nm] = self.prim(ex) if bt == 0 else self.record()
        return o

    def array(self, oid, n, read):
        arr = []
        self.objs[oid] = arr
        while len(arr) < n:
            v = read()
            if isinstance(v, tuple) and v[0] == 'nulls': arr.extend([None] * v[1])
            else: arr.append(v)
        return arr

    def record(self):
        rt = self.u8()
        if rt == 0: self.p += 16; return self.record()
        if rt == 1:
            oid = self.i32(); mid = self.i32()
            name, names, types = self.meta[mid]
            return self.values(oid, name, names, types)
        if rt in (4, 5):
            oid, name, names = self.classinfo()
            types = self.typeinfo(len(names))
            if rt == 5: self.i32()
            self.meta[oid] = (name, names, types)
            return self.values(oid, name, names, types)
        if rt in (2, 3):
            oid, name, names = self.classinfo()
            if rt == 3: self.i32()
            types = [(2, None)] * len(names)
            self.meta[oid] = (name, names, types)
            return self.values(oid, name, names, types)
        if rt == 6:
            oid = self.i32(); v = self.s(); self.objs[oid] = v; return v
        if rt == 7:
            oid = self.i32(); at = self.u8(); rank = self.i32()
            lens = [self.i32() for _ in range(rank)]
            if at in (3, 4, 5): [self.i32() for _ in range(rank)]
            t = self.u8()
            ex = self.u8() if t in (0, 7) else self.s() if t == 3 else (self.s(), self.i32()) if t == 4 else None
            n = 1
            for l in lens: n *= l
            return self.array(oid, n, (lambda: self.prim(ex)) if t == 0 else self.record)
        if rt == 8: return self.prim(self.u8())
        if rt == 9: return Ref(self.i32())
        if rt == 10: return None
        if rt == 11: return ('end',)
        if rt == 12: self.i32(); self.s(); return self.record()
        if rt == 13: return ('nulls', self.u8())
        if rt == 14: return ('nulls', self.i32())
        if rt == 15:
            oid = self.i32(); n = self.i32(); t = self.u8()
            return self.array(oid, n, lambda: self.prim(t))
        if rt in (16, 17):
            oid = self.i32(); n = self.i32()
            return self.array(oid, n, self.record)
        raise ValueError('알 수 없는 기록 %d @%d' % (rt, self.p))

    def resolve(self, v, seen=None):
        if isinstance(v, Ref): v = self.objs.get(v.id)
        return v


def load_table(path):
    r = Reader(decrypt(open(path, 'rb').read()))
    while r.p < len(r.b):
        v = r.record()
        if isinstance(v, tuple) and v[0] == 'end': break
    rows = []
    for o in r.objs.values():
        if isinstance(o, Obj) and o.cls.startswith('Table_'):
            row = {}
            for k, v in o.items():
                if k.startswith('<'): k = k[1:k.index('>')]
                v = r.resolve(v)
                if isinstance(v, Obj) and '_items' in v:  # List<string>
                    items = r.resolve(v['_items']) or []
                    v = [r.resolve(x) for x in items[:v['_size']]]
                row[k] = v
            rows.append(row)
    return rows
