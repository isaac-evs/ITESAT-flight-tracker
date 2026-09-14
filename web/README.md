# ITESAT-8 Mission Control Web

React + TypeScript + Tailwind + Mapbox mission-control dashboard. Dark by
default. Shows the flight's live position on a map, a manually-selectable
date range for reviewing a specific past test flight, and a raw telemetry
feed with CSV export.

## Features

- **Live map**: independent position dots with a translucent Iridium CEP
  uncertainty circle around each one (a connected line would overstate GPS
  precision for live tracking). The most recent fix is highlighted; a
  pulsing marker follows it as new data arrives.
- **Basemap toggle**: satellite (default) or flat map style, independent of
  light/dark theme.
- **Duplicate-fix grouping**: the Iridium network occasionally redelivers
  the same message a few seconds apart, landing two fixes on the exact
  same coordinate. Rather than drawing them on top of each other (or
  nudging them apart, which would misleadingly suggest movement that never
  happened), these collapse into one dot whose popup lists every recording
  made at that position.
- **Date-range review**: pick a start/end date to see every fix in that
  window across all flight IDs (useful when a balloon test spans a
  different physical device than another test). Switches the map to
  fit-to-range framing instead of following the live position, and enables
  step-through playback (skip to start/end, prev/next, play/pause, and a
  scrub slider) that moves a marker through the fixes in order.
- **Telemetry feed**: a collapsible table of raw records. Click a row to
  fly the map to that fix's position. Export the currently-displayed
  record set (live feed, or the selected date range) as CSV.
- **Dark/light theme toggle**, defaulting to dark, persisted in
  `localStorage`.

## Data flow

- **Historical**: polls `GET {VITE_API_BASE_URL}/telemetry` every 15
  seconds when no date range is selected. When a date range is applied, it
  fetches once (no polling) via `GET /telemetry?start=<epoch>&end=<epoch>`.
- **Live**: connects directly to AWS IoT Core over MQTT/WSS using
  temporary guest credentials from a Cognito Identity Pool
  (`src/lib/iotSigner.ts` SigV4-presigns the connection URL), and
  subscribes to the live-tracking topic for instant updates. Live updates
  are merged into the displayed record set only when no date range is
  selected — reviewing a past flight shouldn't have unrelated live data
  blended in.

## Setup

```bash
cp .env.example .env   # fill in values from `terraform output` in ../infra
npm install
npm run dev
```

Required environment variables (see `.env.example`): `VITE_API_BASE_URL`,
`VITE_IOT_ENDPOINT`, `VITE_IOT_TOPIC`, `VITE_COGNITO_IDENTITY_POOL_ID`,
`VITE_AWS_REGION`, `VITE_MAPBOX_TOKEN`. Missing values disable the
corresponding feature (a warning is logged to the console) rather than
crashing the app.

## Structure

- `src/App.tsx` — top-level state: merges live + historical records,
  owns the selected date range and the feed-row "focus" request.
- `src/hooks/useTelemetryHistory.ts` — REST polling (or one-shot fetch for
  a date range) for historical records.
- `src/hooks/useLiveTelemetry.ts` — MQTT/WSS subscription for live updates.
- `src/hooks/useTheme.ts` — dark/light theme state, persisted and applied
  before first paint (see the inline script in `index.html`) to avoid a
  flash of the wrong theme.
- `src/lib/iotSigner.ts` — SigV4-presigns the IoT Core WebSocket URL.
- `src/lib/csv.ts` — builds and triggers download of a CSV from a record
  set.
- `src/components/MapView.tsx` — Mapbox GL map: position dots, uncertainty
  circles, basemap toggle, date-range review mode, and playback controls.
- `src/components/DateRangeFilter.tsx` — the date-range picker control.
- `src/components/TelemetryDrawer.tsx` / `TelemetryTable.tsx` — the
  collapsible raw feed table, CSV export button, and row click-to-locate.
- `src/components/Header.tsx` / `ThemeToggle.tsx` — top bar and theme
  switch.

## Deploy

Deploys automatically via GitHub Actions on push to `main` — see the
"Deployment" section in the repository root `README.md` for how that's
wired up. To deploy manually instead (e.g. from a machine without CI
access):

```bash
npm run build
aws s3 sync dist/ s3://<web_app_bucket_name> --delete
aws cloudfront create-invalidation --distribution-id <cloudfront_distribution_id> --paths "/*"
```

`<web_app_bucket_name>` and `<cloudfront_distribution_id>` come from the
matching Terraform outputs in `../infra`.
