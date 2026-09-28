# Regenerates src/lib/encoder/__fixtures__/reference.json (golden matrices).
# Usage: uv run --with segno --with rmqrcode python scripts/gen-reference.py > /dev/null && node scripts/pack-reference.mjs
# The raw output is written to reference.json in the current directory.
import json, segno
from rmqrcode import rMQR, ErrorCorrectionLevel
from rmqrcode import encoder as E
import segno.encoder as SE
from segno import consts as SC
# segno appends a full zero byte when the stream is already byte aligned, and pads
# M1/M3 with zeros instead of pad codewords; patch both to follow ISO/IEC 18004 7.4.10.
def _padding_bits(buff, version, length):
    if version in (SC.VERSION_M1, SC.VERSION_M3):
        return
    if length % 8:
        buff.extend([0] * (8 - length % 8))
_orig_pad = SE.write_pad_codewords
def _pad_codewords(buff, version, capacity, length):
    if version in (SC.VERSION_M1, SC.VERSION_M3):
        full = capacity // 8 * 8
        if length < full:
            buff.extend([0] * ((8 - length % 8) % 8))
            length += (8 - length % 8) % 8
            pads = [(1,1,1,0,1,1,0,0),(0,0,0,1,0,0,0,1)]
            i = 0
            while length < full:
                buff.extend(pads[i % 2]); length += 8; i += 1
        buff.extend([0] * (capacity - length))
        return
    return _orig_pad(buff, version, capacity, length)
SE.write_padding_bits = _padding_bits
SE.write_pad_codewords = _pad_codewords
from rmqrcode import rmqrcode as RQ
def _final(self, blocks):
    out = []
    for i in range(max(b.data_length() for b in blocks)):
        for b in blocks:
            if i < b.data_length(): out.append(b.get_data_at(i))
    for i in range(max(b.ecc_length() for b in blocks)):
        for b in blocks:
            if i < b.ecc_length(): out.append(b.get_ecc_at(i))
    return out
RQ.rMQR._make_final_codewords = _final
cases = []
def add_segno(kind, data, version, error, mask, mode, **kw):
    if kind == 'micro':
        q = segno.make_micro(data, version=version, error=error, mask=mask, mode=mode, boost_error=False)
    else:
        q = segno.make_qr(data, version=version, error=error, mask=mask, mode=mode, boost_error=False, **kw)
    m = [[1 if v else 0 for v in row] for row in q.matrix]
    cases.append(dict(type=kind, data=data, version=version, ecLevel=error.upper() if error else 'L', mask=mask, mode=mode, eci=kw.get('eci', False), matrix=m))
for v, e, mk in [(1,'l',0),(1,'h',3),(2,'m',5),(5,'q',7),(7,'l',2),(10,'h',1),(21,'m',4),(40,'l',6)]:
    add_segno('model2', '0123456789'*v, v, e, mk, 'numeric')
for v, e, mk in [(3,'m',1),(9,'q',6),(27,'h',0)]:
    add_segno('model2', 'HELLO WORLD $%*+-./:'*(v), v, e, mk, 'alphanumeric')
for v, e, mk in [(4,'l',2),(15,'m',3)]:
    add_segno('model2', 'Hello, world! abc'*v, v, e, mk, 'byte')
add_segno('model2', '漢字テスト'*3, 3, 'm', 4, 'kanji')
for v, e, mk, data, mode in [('M1',None,0,'12345','numeric'),('M1',None,3,'1','numeric'),('M2','l',1,'HELLO','alphanumeric'),('M2','m',2,'0123456','numeric'),('M3','l',0,'HELLO WORLD','alphanumeric'),('M3','m',3,'abcdef','byte'),('M4','l',1,'abcdefghij','byte'),('M4','m',2,'0123456789012345','numeric'),('M4','q',0,'漢字','kanji')]:
    add_segno('micro', data, v, e, mk, mode)
names = ['R7x43','R7x59','R7x77','R7x99','R7x139','R9x43','R9x59','R9x77','R9x99','R9x139','R11x27','R11x43','R11x59','R11x77','R11x99','R11x139','R13x27','R13x43','R13x59','R13x77','R13x99','R13x139','R15x43','R15x59','R15x77','R15x99','R15x139','R17x43','R17x59','R17x77','R17x99','R17x139']
for i, n in enumerate(names):
    for ecl in ['M','H']:
        if (n, ecl) in (('R13x27','M'), ('R17x43','M')): continue  # known table typos in rmqrcode-python
        q = rMQR(n, ErrorCorrectionLevel.M if ecl=='M' else ErrorCorrectionLevel.H, with_quiet_zone=False)
        q.add_segment('12', encoder_class=E.NumericEncoder)
        q.make()
        m = q.to_list(with_quiet_zone=False)
        cases.append(dict(type='rmqr', data='12', version=i, ecLevel=ecl, mask=4, mode='numeric', eci=False, matrix=m))
json.dump(cases, open('reference.json','w'))
print(len(cases))
