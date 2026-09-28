// Converts reference.json produced by gen-reference.py into the compact fixture format.
import fs from 'node:fs';

const cases = JSON.parse(fs.readFileSync('reference.json', 'utf8'));
for (const c of cases) {
  c.rows = c.matrix.map((r) => r.join(''));
  delete c.matrix;
  delete c.eci;
}
fs.writeFileSync('src/lib/encoder/__fixtures__/reference.json', JSON.stringify(cases));
fs.rmSync('reference.json');
