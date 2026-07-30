export const MAX_WEBSOCKET_PAYLOAD_BYTES = 2_048;

export function isWebSocketOriginAllowed(
  suppliedOrigin: string | undefined,
  expectedOrigin: string,
): boolean {
  return suppliedOrigin !== undefined && suppliedOrigin === expectedOrigin;
}
