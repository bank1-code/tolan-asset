"""Normalize PDF Arabic search mappings without changing displayed glyphs."""
from pathlib import Path
import json
import re
import unicodedata
from pypdf import PdfReader, PdfWriter

root = Path('output/pdf')
results = []
for name, expected in [('tolan-operating-guide', 61), ('tolan-quick-guide', 8)]:
    source = root / f'{name}.pdf'
    reader = PdfReader(source)
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    seen = set()
    replacements = 0
    for page in writer.pages:
        for font in page['/Resources'].get('/Font', {}).values():
            font = font.get_object()
            if '/ToUnicode' not in font:
                continue
            stream = font['/ToUnicode'].get_object()
            if id(stream) in seen:
                continue
            seen.add(id(stream))
            mapping = stream.get_data().decode('ascii')
            def normalize_target(hex_text):
                global replacements
                text = bytes.fromhex(hex_text).decode('utf-16-be')
                normalized = unicodedata.normalize('NFKC', text)
                # Tahoma shares a few Arabic glyphs with Persian forms.
                normalized = normalized.translate(str.maketrans({'\u06cc':'\u064a', '\u06be':'\u0647', '\u06a9':'\u0643'}))
                if text != normalized:
                    replacements += 1
                return normalized.encode('utf-16-be').hex().upper()
            def block(match):
                return re.sub(r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', lambda row: f'<{row.group(1)}> <{normalize_target(row.group(2))}>', match.group(0))
            normalized = re.sub(r'\d+ beginbfchar[\s\S]*?endbfchar', block, mapping)
            def range_block(match):
                entries = []
                for row in re.finditer(r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', match.group(0)):
                    first, last, target = [int(x,16) for x in row.groups()]
                    for offset, glyph in enumerate(range(first,last+1)):
                        glyph_hex = f'{glyph:0{len(row.group(1))}X}'
                        target_hex = f'{target+offset:0{len(row.group(3))}X}'
                        entries.append(f'<{glyph_hex}> <{normalize_target(target_hex)}>')
                assert '[' not in match.group(0), 'Unexpected array range'
                return f'{len(entries)} beginbfchar\n'+'\n'.join(entries)+'\nendbfchar'
            normalized = re.sub(r'\d+ beginbfrange[\s\S]*?endbfrange', range_block, normalized)
            stream.set_data(normalized.encode('ascii'))
    temporary = root / f'{name}.normalized.pdf'
    with temporary.open('wb') as handle:
        writer.write(handle)
    temporary.replace(source)
    verified = PdfReader(source)
    assert len(verified.pages) == expected
    texts = [p.extract_text() for p in verified.pages]
    assert all(len(t) > 80 for t in texts)
    total = '\n'.join(texts)
    plain = re.sub(r'[\u064b-\u065f\u0670]', '', total)
    required = ['مجمع الإهلاك', 'الملفات المالية', 'القسط الثابت']
    if name == 'tolan-operating-guide':
        required += ['العمر المتبقي بالأشهر', 'النسبة السنوية', 'فروقات الجرد']
    found = {term: term in plain for term in required}
    assert all(found.values()), found
    links = sum(len(p.get('/Annots', [])) for p in verified.pages)
    assert links >= 6
    results.append({'file':name, 'pages':len(texts), 'textCharacters':len(total), 'arabicSearchTerms':found, 'normalizedMappings':replacements, 'internalLinks':links})

output = Path('tmp/pdfs/operating-guide/pdf-structural-verification.json')
output.write_text(json.dumps({'status':'PASS', 'results':results}, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'status':'PASS', 'results':results}, ensure_ascii=True))
