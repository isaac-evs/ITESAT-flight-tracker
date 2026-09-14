import os
import sys
import unittest
from unittest.mock import MagicMock

os.environ.setdefault("DYNAMODB_TABLE", "test-table")
os.environ.setdefault("IOT_TOPIC", "emidss/live-tracking")
sys.modules["boto3"] = MagicMock()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "webhook_parser"))
import handler  # noqa: E402


class DecodeSensorPayloadTests(unittest.TestCase):
    def test_decodes_temperature_humidity_pressure(self):
        # "T29.15 H40.05 P878.91" hex-encoded, as sent by the EMIDSS-8 flight computer.
        data_hex = "5432392e3135204834302e303520503837382e3931"
        result = handler._decode_sensor_payload(data_hex)
        self.assertEqual(result["temperature_c"], 29.15)
        self.assertEqual(result["humidity_pct"], 40.05)
        self.assertEqual(result["pressure_hpa"], 878.91)
        self.assertEqual(result["decoded_text"], "T29.15 H40.05 P878.91")

    def test_decodes_colon_separated_variant(self):
        # Some firmware revisions emit "T:24.33 H:74.69 P:702.95" instead.
        data_hex = "543a32342e333320483a37342e363920503a3730322e3935"
        result = handler._decode_sensor_payload(data_hex)
        self.assertEqual(result["temperature_c"], 24.33)
        self.assertEqual(result["humidity_pct"], 74.69)
        self.assertEqual(result["pressure_hpa"], 702.95)

    def test_empty_payload_returns_empty_dict(self):
        self.assertEqual(handler._decode_sensor_payload(""), {})

    def test_malformed_hex_returns_empty_dict(self):
        self.assertEqual(handler._decode_sensor_payload("zz"), {})


class ParseBodyTests(unittest.TestCase):
    def test_parses_form_urlencoded(self):
        event = {"body": "imei=301434061309000&momsn=303"}
        body = handler._parse_body(event)
        self.assertEqual(body["imei"], "301434061309000")
        self.assertEqual(body["momsn"], "303")

    def test_parses_json(self):
        event = {"body": '{"imei": "301434061309000"}'}
        self.assertEqual(handler._parse_body(event)["imei"], "301434061309000")


if __name__ == "__main__":
    unittest.main()
