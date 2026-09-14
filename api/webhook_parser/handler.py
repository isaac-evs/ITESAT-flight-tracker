"""Receives the Rock7/RockBLOCK SBD delivery webhook, decodes the onboard
sensor payload, persists a clean telemetry record to DynamoDB, and
republishes it as a live-tracking MQTT event on AWS IoT Core.

Rock7 posts `application/x-www-form-urlencoded` fields such as:
    imei, momsn, transmit_time, iridium_latitude, iridium_longitude,
    iridium_cep, iridium_session_status, data (hex-encoded ASCII)

The `data` field on EMIDSS-8 is hex-encoded ASCII in the form
"T<temp> H<humidity> P<pressure>", e.g. hex "5432392e31352048..."
decodes to "T29.15 H40.05 P878.91". Some firmware revisions emit
"T:29.15 H:40.05 P:878.91" (colon after the field letter) instead -
both are accepted.
"""
import base64
import json
import os
import time
from decimal import Decimal
from urllib.parse import parse_qsl

import boto3

dynamodb = boto3.resource("dynamodb")
iot_data = boto3.client("iot-data")

table = dynamodb.Table(os.environ["DYNAMODB_TABLE"])
IOT_TOPIC = os.environ["IOT_TOPIC"]
TTL_DAYS = int(os.environ.get("TTL_DAYS", "90"))

SENSOR_FIELDS = {
    "T": "temperature_c",
    "H": "humidity_pct",
    "P": "pressure_hpa",
}


def lambda_handler(event, context):
    body = _parse_body(event)

    imei = str(body.get("imei") or "unknown")
    data_hex = body.get("data") or ""

    record = {
        "flight_id": imei,
        "timestamp": int(time.time()),
        "momsn": _to_int(body.get("momsn")),
        "transmit_time": body.get("transmit_time"),
        "latitude": _to_float(body.get("iridium_latitude")),
        "longitude": _to_float(body.get("iridium_longitude")),
        "cep": _to_float(body.get("iridium_cep")),
        "session_status": _to_int(body.get("iridium_session_status")),
        "data_hex": data_hex,
        "expires_at": int(time.time()) + TTL_DAYS * 86400,
        **_decode_sensor_payload(data_hex),
    }
    record = {k: v for k, v in record.items() if v is not None}

    table.put_item(Item=_floats_to_decimal(record))

    iot_data.publish(
        topic=IOT_TOPIC,
        qos=0,
        payload=json.dumps(record, default=str),
    )

    return _response(200, {"status": "ok", "flight_id": imei})


def _decode_sensor_payload(data_hex):
    """Decode the hex-encoded "T.. H.. P.." string into named readings."""
    if not data_hex:
        return {}
    try:
        text = bytes.fromhex(data_hex).decode("ascii", errors="ignore")
    except ValueError:
        return {}

    readings = {"decoded_text": text}
    for token in text.split():
        key, field = token[0], SENSOR_FIELDS.get(token[0])
        if field is None:
            continue
        # Some flight computer firmware revisions emit "T:24.33" instead of
        # "T24.33" - strip the separator so both decode the same reading.
        value = _to_float(token[1:].lstrip(":"))
        if value is not None:
            readings[field] = value
    return readings


def _parse_body(event):
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return dict(parse_qsl(raw))


def _to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _floats_to_decimal(obj):
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _floats_to_decimal(v) for k, v in obj.items()}
    return obj


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
