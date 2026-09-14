function required(name: string, value: string | undefined): string {
  if (!value) {
    console.warn(`Missing env var ${name} - related features will be disabled.`);
  }
  return value ?? "";
}

export const config = {
  apiBaseUrl: required("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL),
  mapboxToken: required("VITE_MAPBOX_TOKEN", import.meta.env.VITE_MAPBOX_TOKEN),
  awsRegion: required("VITE_AWS_REGION", import.meta.env.VITE_AWS_REGION),
  iotEndpoint: required("VITE_IOT_ENDPOINT", import.meta.env.VITE_IOT_ENDPOINT),
  iotTopic: import.meta.env.VITE_IOT_TOPIC || "emidss/live-tracking",
  cognitoIdentityPoolId: required(
    "VITE_COGNITO_IDENTITY_POOL_ID",
    import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID,
  ),
};
