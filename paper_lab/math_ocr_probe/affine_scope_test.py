import json
from pathlib import Path
import subprocess
import unittest


class AffineAudit(unittest.TestCase):
    def test_scope_controls(self):
        controls = [
            ['x+4=7', '3'],
            [r'\frac{x-2}{\frac{6}{2}}=4', '14'],
            [r'\left(x-2\right)\div3=4', '14'],
            ['7=7', 'no-variable'],
            ['1<x=7', 'layout-outside-scope'],
            ['x=1=2', 'not-one-equality'],
            [r'\sum_{i=1}^n x_i', 'layout-outside-scope'],
            [r'\frac{3}{x}=1', 'checker-unsupported'],
            [r'\frac{x}{0}=4', 'checker-unsupported'],
            ['x+y=2', 'checker-unsupported'],
            ['x*x=9', 'checker-unsupported'],
            [r'\frac{x=1}{2}', 'layout-outside-scope'],
            [r'\frac{}{2}=x', 'layout-outside-scope'],
            [r'2\frac{1}{3}=x', 'layout-outside-scope'],
            [r'\frac{1}{3}(x+1)=3', 'layout-outside-scope'],
            [r'\frac{1}{3}\,(x+1)=3', 'layout-outside-scope'],
            [r'\frac{1\,2}{2}=x', 'checker-unsupported'],
        ]
        path = Path(__file__).resolve().parent
        runner = '''
import { affineReference } from './affine_scope.mjs';
import { readFileSync } from 'node:fs';
console.log(JSON.stringify(JSON.parse(readFileSync(0, 'utf8')).map(label => {
  const r = affineReference(label);
  return r.reason ?? r.parsed.solution.value;
})));
'''
        got = subprocess.run(['node','--input-type=module','-e',runner], cwd=path,
                             input=json.dumps([c[0] for c in controls]), capture_output=True,
                             text=True, check=True, timeout=15)
        self.assertEqual(json.loads(got.stdout), [c[1] for c in controls])


if __name__ == '__main__':
    unittest.main()
