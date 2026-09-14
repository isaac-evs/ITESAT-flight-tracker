import importlib.util
import os
import sys
import unittest
from unittest.mock import MagicMock

os.environ.setdefault("DYNAMODB_TABLE", "test-table")
sys.modules.setdefault("boto3", MagicMock())
sys.modules.setdefault("boto3.dynamodb", MagicMock())
sys.modules.setdefault("boto3.dynamodb.conditions", MagicMock(Key=MagicMock(), Attr=MagicMock()))

# Loaded under a unique module name (not "handler") so this doesn't collide
# with webhook_parser's own handler.py if both test modules run in the same
# process (e.g. `python3 -m unittest discover`).
_handler_path = os.path.join(os.path.dirname(__file__), "..", "telemetry_reader", "handler.py")
_spec = importlib.util.spec_from_file_location("telemetry_reader_handler", _handler_path)
handler = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(handler)


class FakeTable:
    """Simulates a paginated DynamoDB scan across two pages."""

    def __init__(self, pages):
        self._pages = pages
        self.calls = 0

    def scan(self, **kwargs):
        page = self._pages[self.calls]
        self.calls += 1
        return page


class LatestFlightIdTests(unittest.TestCase):
    def test_picks_highest_timestamp_not_first_scanned_item(self):
        # The old implementation just returned Items[0] from a Limit=1 scan,
        # so it never actually checked which flight was most recent.
        handler.table = FakeTable([
            {
                "Items": [
                    {"flight_id": "old-flight", "timestamp": 100},
                    {"flight_id": "new-flight", "timestamp": 999},
                ],
            },
        ])
        self.assertEqual(handler._latest_flight_id(), "new-flight")

    def test_paginates_across_multiple_scan_pages(self):
        handler.table = FakeTable([
            {
                "Items": [{"flight_id": "flight-a", "timestamp": 500}],
                "LastEvaluatedKey": {"flight_id": "flight-a", "timestamp": 500},
            },
            {
                "Items": [{"flight_id": "flight-b", "timestamp": 700}],
            },
        ])
        self.assertEqual(handler._latest_flight_id(), "flight-b")

    def test_empty_table_returns_none(self):
        handler.table = FakeTable([{"Items": []}])
        self.assertIsNone(handler._latest_flight_id())


class RecordsInRangeTests(unittest.TestCase):
    def test_aggregates_and_sorts_across_pages(self):
        handler.table = FakeTable([
            {
                "Items": [{"flight_id": "a", "timestamp": 300}],
                "LastEvaluatedKey": {"flight_id": "a", "timestamp": 300},
            },
            {
                "Items": [{"flight_id": "b", "timestamp": 100}, {"flight_id": "c", "timestamp": 200}],
            },
        ])
        result = handler._records_in_range(0, 1000, limit=200)
        self.assertEqual([r["timestamp"] for r in result], [100, 200, 300])

    def test_stops_paginating_once_limit_reached(self):
        handler.table = FakeTable([
            {
                "Items": [{"flight_id": "a", "timestamp": 1}, {"flight_id": "b", "timestamp": 2}],
                "LastEvaluatedKey": {"flight_id": "b", "timestamp": 2},
            },
            {
                "Items": [{"flight_id": "c", "timestamp": 3}],
            },
        ])
        result = handler._records_in_range(0, 1000, limit=2)
        self.assertEqual(len(result), 2)
        self.assertEqual(handler.table.calls, 1)

    def test_empty_range_returns_empty_list(self):
        handler.table = FakeTable([{"Items": []}])
        self.assertEqual(handler._records_in_range(0, 1000, limit=200), [])


if __name__ == "__main__":
    unittest.main()
