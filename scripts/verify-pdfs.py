import json
import re
from pathlib import Path
from pypdf import PdfReader
root=Path(__file__).resolve().parent.parent/'qa-artifacts'
short=' '.join(page.extract_text() for page in PdfReader(root/'receipt.pdf').pages)
assert 'Print-check Candle' in short, short
assert re.search(r'2\s*×\s*\$?12\.50',short), short
assert '12.50' in short and '23.63' in short, short
assert 'Subtotal' in short and 'Discount' in short and 'Tax' in short, short
expected=json.loads((root/'expected.json').read_text())
reader=PdfReader(root/'long-receipt.pdf')
long=' '.join(page.extract_text() for page in reader.pages)
assert len(reader.pages)<=2, 'Long receipt should fit on two A4 pages.'
assert 'Total' in reader.pages[-1].extract_text() and 'THANK YOU' in reader.pages[-1].extract_text(), 'Keep totals and footer together.'
assert expected['lastName'] in long, (expected['lastName'],long)
assert 'THANK YOU FOR SHOPPING WITH US.' in long, long
print(f'PASS: receipt PDFs contain item names, prices, totals and final lines; long receipt has {len(reader.pages)} pages.')
