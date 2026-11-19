/** Messages between extension parts. Typed so content scripts never trust unknown shapes. */

export interface Ping {
  type: "anchor:ping";
}

export interface PingReply {
  ok: true;
}

export function isPing(message: unknown): message is Ping {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "anchor:ping"
  );
}
