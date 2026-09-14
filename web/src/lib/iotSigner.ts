import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { config } from "./config";

/**
 * Presigns a wss:// URL for AWS IoT Core using guest credentials from a
 * Cognito Identity Pool, per AWS's documented "connect from a browser"
 * pattern. The security token is appended after signing (it must not be
 * part of the signed request).
 */
export async function getSignedIotWssUrl(): Promise<string> {
  const { awsRegion, iotEndpoint, cognitoIdentityPoolId } = config;

  const credentialsProvider = fromCognitoIdentityPool({
    clientConfig: { region: awsRegion },
    identityPoolId: cognitoIdentityPoolId,
  });
  const credentials = await credentialsProvider();

  const signer = new SignatureV4({
    credentials,
    region: awsRegion,
    service: "iotdevicegateway",
    sha256: Sha256,
  });

  const presigned = await signer.presign(
    {
      method: "GET",
      protocol: "wss:",
      hostname: iotEndpoint,
      path: "/mqtt",
      headers: { host: iotEndpoint },
      query: {},
    },
    { expiresIn: 300 },
  );

  const query = new URLSearchParams(presigned.query as Record<string, string>).toString();
  let url = `wss://${iotEndpoint}/mqtt?${query}`;
  if (credentials.sessionToken) {
    url += `&X-Amz-Security-Token=${encodeURIComponent(credentials.sessionToken)}`;
  }
  return url;
}
