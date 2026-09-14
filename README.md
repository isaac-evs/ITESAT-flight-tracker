# ITESAT-8 Flight Tracker

A high-altitude balloon ("ITESAT-8") mission-control system: ingests
telemetry sent over the Iridium Short Burst Data (SBD) network via a
Rock7/RockBLOCK modem, stores it, and displays it live on a web dashboard
with a map, historical review, and CSV export.

See `Architecture.png` at the repo root for a diagram of the full data flow.

## How it works

1. The onboard flight computer reads temperature, humidity, and pressure,
   encodes them as a short ASCII string (e.g. `T24.33 H74.69 P702.95`, with
   a minor firmware variant using colons: `T:24.33 H:74.69 P:702.95` — both
   are supported), hex-encodes it, and sends it over Iridium SBD along with
   its GPS fix.
2. Rock7 receives the message and POSTs a webhook (`imei`, `momsn`,
   `transmit_time`, `iridium_latitude`/`iridium_longitude`, and the
   hex-encoded `data` field) to an AWS API Gateway endpoint.
3. A Lambda (`api/webhook_parser`) decodes the payload, writes a clean
   record to DynamoDB, and republishes it to an AWS IoT Core MQTT topic for
   real-time delivery.
4. The web dashboard (`web/`) shows:
   - The live position on a Mapbox map (subscribed directly to the IoT
     Core topic over MQTT/WSS, using temporary guest credentials from a
     Cognito Identity Pool — no server round-trip needed for live updates).
   - Historical telemetry, fetched from a second Lambda
     (`api/telemetry_reader`) that reads from DynamoDB.
   - A manually-selectable date range for reviewing a specific past test
     flight, with step-through playback of every fix in order.
   - A raw telemetry feed table, with CSV export and click-to-locate
     (clicking a row flies the map to that fix).

## Repository layout

- `infra/` — Terraform for the entire AWS backend: API Gateway, the two
  Lambdas, DynamoDB, IoT Core + Cognito, S3 + CloudFront for the web app,
  and cost guardrails (a budget alert + automatic spend cutoff). See
  `infra/README.md` for details on running it.
- `api/` — Lambda application code.
  - `webhook_parser/` — receives the Rock7 webhook, decodes the sensor
    payload, writes to DynamoDB, publishes to IoT Core.
  - `telemetry_reader/` — serves telemetry history to the web app, either
    for a specific `flight_id` or across a `start`/`end` date range.
  - `tests/` — Python `unittest` suite for both Lambdas (mocks `boto3`, no
    AWS credentials needed to run). Run with:
    ```bash
    cd api && python3 -m unittest discover -s tests -v
    ```
- `web/` — the React + TypeScript + Tailwind + Mapbox dashboard. See
  `web/README.md` for its structure and local dev setup.

## Data model

Telemetry records are stored in a single DynamoDB table, partitioned by
`flight_id` (the modem's IMEI) with `timestamp` (epoch seconds) as the
sort key. Each item includes: `momsn`, `transmit_time`, `latitude`,
`longitude`, `cep` (Iridium's position uncertainty estimate, in km),
`session_status`, the raw `data_hex`, the `decoded_text`, and the three
parsed sensor readings (`temperature_c`, `humidity_pct`, `pressure_hpa`).
Records expire automatically after 90 days via DynamoDB TTL.

### Known data quirks

- **Duplicate deliveries**: the Iridium SBD network occasionally redelivers
  the exact same message a few seconds apart (would share one `momsn` in
  live data). Both deliveries are kept in the data — nothing is discarded —
  but the web dashboard groups fixes that land on the exact same
  coordinate into a single map dot, listing every recording for that spot
  in its popup, rather than either hiding one or misleadingly suggesting
  the balloon moved.
- **Two payload formats**: depending on flight computer firmware revision,
  the decoded sensor string may or may not have a colon after each field
  letter (`T24.33` vs `T:24.33`). `_decode_sensor_payload` in
  `webhook_parser/handler.py` handles both.
- **`telemetry_reader`'s "no flight_id given" default** picks the flight
  with the highest `timestamp` across the whole table (a full scan, since
  there's no secondary index on timestamp — acceptable at this project's
  scale of a handful of flights and a few hundred records each; if that
  changes, add a GSI keyed on a constant partition and a `timestamp` sort
  key instead).
- The `start`/`end` date-range query is also a table `Scan` with a
  `FilterExpression`, for the same reason: no GSI, fine at current scale.

## Deployment

### Infrastructure (`infra/`)

Provisioned once via Terraform — see `infra/README.md` for the full
walkthrough, cost guardrail details, and required variables.

### Web app (`web/`)

Deploys automatically: a GitHub Actions workflow
(`.github/workflows/deploy.yml`) builds `web/` and pushes it to the S3
bucket + CloudFront distribution on every push to `main` that touches
`web/`. It authenticates to AWS via OIDC (an IAM role trust policy scoped
to this exact repository and branch — no long-lived AWS keys stored in
GitHub). The build reads its configuration from repository secrets:

| Secret | Source |
| --- | --- |
| `AWS_ROLE_ARN` | the IAM role's ARN |
| `AWS_REGION` | e.g. `us-east-1` |
| `S3_BUCKET` | `web_app_bucket_name` Terraform output |
| `CLOUDFRONT_DISTRIBUTION_ID` | `cloudfront_distribution_id` Terraform output |
| `VITE_API_BASE_URL` | `api_base_url` Terraform output |
| `VITE_IOT_ENDPOINT` | `iot_data_endpoint` Terraform output |
| `VITE_IOT_TOPIC` | the MQTT topic (see `iot_topic` Terraform variable) |
| `VITE_COGNITO_IDENTITY_POOL_ID` | `cognito_identity_pool_id` Terraform output |
| `VITE_MAPBOX_TOKEN` | a Mapbox access token |

To deploy manually instead (e.g. from a machine without CI access), see
the "Deploy" section in `web/README.md`.

## Backfilling historic data

If you have a CSV export of past messages from the Rock7 console (rather
than a live webhook payload), there is no committed script for this —
intentionally: a one-off backfill script depends on decisions specific to
the data at hand (what `flight_id` to assign when the true device IMEI
isn't confirmed, how to handle TTL, etc.) that shouldn't be baked into the
repository as a general-purpose tool. Write one on top of
`api/webhook_parser/handler.py`'s `_decode_sensor_payload` and
`_floats_to_decimal` helpers to keep the item shape schema-consistent with
what the live Lambda produces, and keep the CSV and script itself out of
version control (see `.gitignore`'s `/data` entry).

## Credits

Built by [isaac-evs](https://github.com/isaac-evs).
