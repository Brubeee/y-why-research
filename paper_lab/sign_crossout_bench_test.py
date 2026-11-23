import shutil
import unittest
from sign_crossout_bench import fixture, run, summarize

class SignCrossout(unittest.TestCase):
    def test_fixture_determinism_and_ground_truth_do_not_depend_on_ocr(self):
        p,a=fixture('rhs',216,'single')
        self.assertEqual((p,a),fixture('rhs',216,'single'))
        q,b=fixture('rhs',39,'scribble')
        self.assertNotEqual(a,b)
        self.assertEqual([r['text'] for r in p['rows']],[r['text'] for r in q['rows']])
        self.assertEqual([r['status'] for r in p['rows']],['active','canceled','active'])

    def test_missing_or_fragmented_is_not_counted_as_exact_sign_omission(self):
        rows=[
            dict(status='active',transition='valid',sign_side='rhs',reference='x=−4',candidate='x=4',uncertain=False,exact=False),
            dict(status='active',transition='valid',sign_side='rhs',reference='x=−4',candidate=None,uncertain=True,exact=False),
            dict(status='active',transition='invalid',sign_side='lhs',reference='−x=4',candidate='−x=4',uncertain=False,exact=True),
            dict(status='canceled',reference='x=4',overlapping_drafts=['*4']),
        ]
        v=summarize([{'rows':rows}])
        self.assertEqual((v['rhs_sign_only_dropped'],v['rhs_sign_total']),(1,2))
        self.assertEqual((v['written_error_exact'],v['canceled_with_draft'],v['canceled_exact_draft']),(1,1,0))

    @unittest.skipUnless(shutil.which('tesseract') and shutil.which('node'),'offline Tesseract and Node required')
    def test_end_to_end_recognizer_controls(self):
        d=run()
        self.assertEqual(len(d['manifest']['images']),12)
        for result in d['strategies'].values():
            s=result['summary']
            self.assertEqual([s[k] for k in ('active_total','rhs_sign_total','lhs_sign_total','written_error_total','canceled_total')],
                             [30,18,12,6,12])
            self.assertEqual(result['verdict']['gated']['counts']['referenceMismatch'],0)
            self.assertEqual(result['verdict']['ungated']['counts']['referenceMismatch'],0)
