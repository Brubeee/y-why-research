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
                         'canceled_rows':1,'canceled_rows_in_naive_selection':1})

    def test_cosmetic_cleaning_preserves_split_digits_and_errors(self):
        self.assertEqual(normalize(' 4t −  2 = 20 '), '4t-2=20')
        self.assertNotEqual(normalize('x=2 0'), normalize('x=20'))
        self.assertNotEqual(normalize('4t−2=20'), normalize('4t−8=20'))
