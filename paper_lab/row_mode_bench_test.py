import shutil
import unittest
from row_mode_bench import build, run
from ocr_bench import verdict_for

class RowMode(unittest.TestCase):
    def test_recompression_and_truth_frozen(self):
        page,jpeg=build('cancel',216)
        self.assertEqual((page,jpeg),build('cancel',216))
        self.assertEqual([r['status'] for r in page['rows']],['active','canceled','active'])
        self.assertEqual(page['rows'][-1]['text'],'x=−3')
        self.assertTrue(page['rows'][-1]['mark'])

    @unittest.skipUnless(shutil.which('node'),'Node required')
    def test_verifier_sentinels_detect_each_flip_direction(self):
        pages=[]
        for kind,after,want in [('false_pass','x=2','ok'),('false_error','2x=6','changed')]:
            page,_=build(kind,40)
            rows=page['rows']
            for i,r in enumerate(rows):
                r.update(reference=r['text'],candidate=r['text'] if i==0 else after,index=i,uncertain=False)
            pages.append(page)
        control=verdict_for(pages,gate_confidence=False)
        self.assertEqual(control['counts']['referenceMismatch'],0)
        self.assertEqual(control['counts']['verdictFlips'],2)
        self.assertEqual([(r['reference']['verdict'],r['observed']['verdict']) for r in control['cases']],
                         [('changed','ok'),('ok','changed')])

    @unittest.skipUnless(shutil.which('node') and shutil.which('tesseract'),'offline Node and Tesseract required')
    def test_oracle_comparison_runs_all_fixed_cases(self):
        d=run()
        self.assertEqual(len(d['image_hashes']),9)
        for name in ('psm3','psm7','psm13'):
            v=d[name]
            self.assertEqual(v['counts']['active_rows'],18)
            self.assertEqual(v['counts']['cancel_rows'],3)
            self.assertEqual(v['counts']['mark_rois'],0 if name=='psm3' else 9)
            self.assertEqual(v['verdicts']['counts']['referenceMismatch'],0)
            self.assertEqual(v['counts']['written_error_cases'],3)
            self.assertEqual(v['counts']['written_pass_cases'],6)
