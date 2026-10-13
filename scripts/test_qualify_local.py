import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('qualify_local', Path(__file__).with_name('qualify-local.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class StrictReadTest(unittest.TestCase):
    marker = 'fixture-1234567890abcdef'

    def events(self, answer, status='completed'):
        return '\n'.join(map(json.dumps, [
            {'type': 'tool_use', 'part': {'tool': 'read', 'state': {'status': status}}},
            {'type': 'text', 'part': {'text': answer}},
        ]))

    def test_completed_read_and_exact_answer(self):
        self.assertTrue(probe.evaluate(self.events(self.marker), self.marker))

    def test_explanation_is_not_exact_answer(self):
        self.assertFalse(probe.evaluate(self.events('Marker: ' + self.marker), self.marker))

    def test_failed_tool_does_not_pass(self):
        self.assertFalse(probe.evaluate(self.events(self.marker, 'error'), self.marker))

    def test_claim_without_tool_does_not_pass(self):
        answer = json.dumps({'type': 'text', 'part': {'text': self.marker}})
        self.assertFalse(probe.evaluate(answer, self.marker))

    def test_empty_or_malformed_output_does_not_pass(self):
        self.assertFalse(probe.evaluate('', self.marker))
        self.assertFalse(probe.evaluate('invalid json', self.marker))


if __name__ == '__main__':
    unittest.main()
