"""Serves telemetry history to the mission-control web app.

GET /telemetry                        -> most recent flight's records
GET /telemetry?flight_id=<imei>       -> a specific flight's records
GET /telemetry?flight_id=..&limit=N   -> cap record count (default 200, max 1000)
GET /telemetry?start=<epoch>&end=<epoch>
    -> all records (any flight_id) with start <= timestamp <= end, e.g. to
       review one manually-picked test flight's date range independent of
       which physical flight_id it landed under. Implemented as a table
       Scan with a FilterExpression rather than an indexed Query, since
       there's no GSI on timestamp - fine at this project's scale (a
       handful of flights, a few hundred records each); revisit with a GSI
       if the table grows to the point a full scan gets expensive.
"""
import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["DYNAMODB_TABLE"])

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
}


def lambda_handler(event, context):
    params = event.get("queryStringParameters") or {}
    limit = min(_to_int(params.get("limit")) or 200, 1000)

    start = _to_int(params.get("start"))
    end = _to_int(params.get("end"))
    if start is not None and end is not None:
        records = _records_in_range(start, end, limit)
        return _response(200, {"flight_id": None, "records": records})

    flight_id = params.get("flight_id") or _latest_flight_id()
    if not flight_id:
        return _response(200, {"flight_id": None, "records": []})

    result = table.query(
        KeyConditionExpression=Key("flight_id").eq(flight_id),
        ScanIndexForward=False,
        Limit=limit,
    )
    records = sorted(result.get("Items", []), key=lambda r: r["timestamp"])
    return _response(200, {"flight_id": flight_id, "records": records})


def _records_in_range(start, end, limit):
    items = []
    scan_kwargs = {"FilterExpression": Attr("timestamp").between(start, end)}
    while True:
        result = table.scan(**scan_kwargs)
        items.extend(result.get("Items", []))
        if "LastEvaluatedKey" not in result or len(items) >= limit:
            break
        scan_kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]
    return sorted(items, key=lambda r: r["timestamp"])[:limit]


def _latest_flight_id():
    """Return the flight_id of the item with the highest timestamp.

    A plain scan can't sort across partitions, so this pages through the
    whole table comparing timestamps. Fine at this project's scale (a
    handful of flights, a few hundred records each); if that changes,
    replace with a GSI keyed on a constant partition + timestamp sort key
    so "latest" is a single indexed query instead of a full scan.
    """
    latest = None
    scan_kwargs = {
        "ProjectionExpression": "flight_id, #ts",
        "ExpressionAttributeNames": {"#ts": "timestamp"},
    }
    while True:
        result = table.scan(**scan_kwargs)
        for item in result.get("Items", []):
            if latest is None or item["timestamp"] > latest["timestamp"]:
                latest = item
        if "LastEvaluatedKey" not in result:
            break
        scan_kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]
    return latest["flight_id"] if latest else None


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _default(value):
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"not JSON serializable: {value!r}")


def _response(status, body):
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, default=_default),
    }
