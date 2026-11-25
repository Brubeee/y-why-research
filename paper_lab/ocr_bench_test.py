import unittest

from ocr_bench import align, normalize, score_page, totals


def box(x, y, w=60, h=20):
    return dict(x=x, y=y, width=w, height=h)


def line(text, rect, confidence=95):
    return dict(text=text, box=rect, words=[dict(confidence=confidence)])


def row(id_, text, rect, *, canceled=False):
    return dict(id=id_, text=text, box=rect, status='canceled' if canceled else 'active',
                transition='ignored' if canceled else 'valid')


class ScoringTests(unittest.TestCase):
    def test_match_never_uses_recognized_text(self):
        rows = [row('a', 'x=1', box(0, 0)), row('b', 'x=2', box(100, 0))]
        lines = [line('x=2', box(0, 0)), line('x=1', box(100, 0))]
        self.assertEqual(align(rows, lines), {'a': 0, 'b': 1})

    def test_merged_columns_and_fragments_are_not_silently_joined(self):
        rows = [row('a', 'x=1', box(0, 0)), row('b', 'x=2', box(60, 0))]
        self.assertEqual(align(rows, [line('x=1 x=2', box(0, 0, 120))]), {})
        self.assertEqual(align(rows, [line('x=', box(0, 0, 35)), line('1', box(40, 0, 10))]), {})

    def test_confidence_order_and_crossed_out_metrics_are_separate(self):
        page = {'id':'synthetic','support':'bounded_linear','layout_cohort':'single','condition':'clean',
                'rows':[row('a','2x=4',box(0,0)),row('b','x=3',box(0,40),canceled=True),row('c','x=2',box(0,80))]}
        scores = score_page(page, [line('x=2', box(0,80), 69), line('x=3', box(0,40)), line('2x=4', box(0,0))])
        self.assertFalse(scores['all_active_found_in_order'])
        self.assertEqual(totals([scores]), {'pages':1,'active_rows':2,'active_exact':2,'active_covered':1,
                         'active_exact_when_covered':1,'pages_all_active_found_in_order':0,
                         'pages_raw_chain_eligible':1,'pages_raw_chain_exact':0,
                         'canceled_rows':1,'canceled_rows_in_naive_selection':1})

    def test_cosmetic_cleaning_preserves_split_digits_and_errors(self):
        self.assertEqual(normalize(' 4t −  2 = 20 '), '4t-2=20')
        self.assertNotEqual(normalize('x=2 0'), normalize('x=20'))
        self.assertNotEqual(normalize('4t−2=20'), normalize('4t−8=20'))

    def test_exact_raw_chain_preserves_written_math_errors(self):
        page = {'id':'negative','support':'bounded_linear','layout_cohort':'single','condition':'clean',
                'rows':[row('a','2x=4',box(0,20)),row('b','x=−2',box(0,60))]}
        page['rows'][1]['transition'] = 'invalid'
        inputs = [line('2x=4',box(0,20)),line('x=-2',box(0,60),29)]
        self.assertTrue(score_page(page,inputs)['raw_chain_exact'])
        wrong = score_page(page,[inputs[0],line('x=2',box(0,60))])
        self.assertTrue(wrong['all_active_found_in_order'])
        self.assertFalse(wrong['raw_chain_exact'])

    def test_extra_rows_fail_even_when_all_active_rows_match(self):
        page = {'id':'extra','support':'bounded_linear','layout_cohort':'single','condition':'clean',
                'rows':[row('a','2x=4',box(0,20)),row('b','x=2',box(0,80))]}
        report = score_page(page,[line('2x=4',box(0,20)),line('x=4',box(0,50)),line('x=2',box(0,80))])
        self.assertTrue(report['all_active_found_in_order'])
        self.assertEqual(report['unmatched_in_scope_indexes'],[1])
        self.assertFalse(report['raw_chain_exact'])

    def test_only_spatially_bound_out_of_scope_ink_is_excluded(self):
        page = {'id':'heading','support':'bounded_linear','layout_cohort':'single','condition':'clean',
                'rows':[dict(row('h','Heading',box(0,0)),status='context'),
                        row('a','2x=4',box(0,30)),row('c','x=3',box(0,60),canceled=True),
                        row('b','x=2',box(0,90))]}
        heading = line('misspelled heading',box(0,0))
        exact = [heading,line('2x=4',box(0,30)),line('x=8',box(0,60)),line('x=2',box(0,90))]
        report = score_page(page,exact)
        self.assertTrue(report['raw_chain_exact'])
        self.assertEqual([l['out_of_scope'] for l in report['raw_lines']],[True,False,True,False])
        merged = [heading,line('2x=4 x=3',box(0,30,h=50)),exact[3]]
        self.assertFalse(score_page(page,merged)['raw_chain_exact'])
        self.assertFalse(score_page(page,[*exact,line('Heading',box(80,120))])['raw_chain_exact'])
        self.assertIsNone(score_page(dict(page,support='unsupported'),exact)['raw_chain_exact'])
