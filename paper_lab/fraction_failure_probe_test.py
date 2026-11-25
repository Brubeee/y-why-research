from unittest import TestCase
from fraction_failure_probe import compact, score


def row(text, x, y, w=20, h=10):
    return {'text': text, 'box': {'x': x, 'y': y, 'width': w, 'height': h}}


class FractionFailureProbeTest(TestCase):
    def test_preserves_q_and_digits_and_signs(self):
        self.assertEqual(compact('q / 5 − 2'), 'q/5-2')
        self.assertNotEqual(compact('9 / 5'), compact('q / 5'))
        self.assertNotEqual(compact('1 3/20'), compact('13/20'))
        self.assertNotEqual(compact('| q/5'), compact('q/5'))

    def test_crop_translation_and_order(self):
        truth = [row('q/5', 105, 205), row('q = 2', 105, 225)]
        draft = [row('q/5', 5, 5), row('q=2', 5, 25)]
        complete = score(truth, draft, 100, 200)
        self.assertTrue(complete['consecutive_complete'])
        self.assertEqual(complete['exact_active'], [1, 2])
        self.assertFalse(score(truth, draft[::-1], 100, 200)['consecutive_complete'])
        self.assertEqual(score(truth, draft, 0, 0)['missing_active'], [1, 2])

    def test_does_not_turn_split_merge_or_omission_into_a_match(self):
        truth = [row('q/5 = 2/5', 15, 5), row('q = 2', 15, 25)]
        split = score(truth, [row('q/5', 15, 5), row('= 2/5', 27, 5)], 0, 0)
        self.assertEqual((split['ambiguous_active'], split['missing_active']), ([1], [2]))
        self.assertFalse(split['consecutive_complete'])
        merged = score(truth, [row('q/5 = 2/5', 15, 5, h=30)], 0, 0)
        self.assertEqual(merged['ambiguous_active'], [1, 2])
        self.assertEqual(merged['exact_active'], [])
