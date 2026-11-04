// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accessFromRoom,
  agoraConfig,
  buildJoin,
  deriveMediaKey,
  SESSION_UIDS,
  tokenLifetime,
  TOKEN_LIFETIME_SECONDS,
} from "@/lib/aviv/agora.server";
import { sessionWindow } from "@/lib/aviv/session-schema";

const config = { appId: "a".repeat(32), certificate: "b".repeat(32) };
const channel = `aviv-${"c".repeat(32)}`;
const inAnHour = () => new Date(Date.now() + 3600000).toISOString();

describe("Agora configuration", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("stays off until both values are present and well formed", () => {
    vi.stubEnv("AGORA_APP_ID", "");
    vi.stubEnv("AGORA_APP_CERTIFICATE", "");
    expect(agoraConfig()).toBeNull();
    vi.stubEnv("AGORA_APP_ID", config.appId);
    expect(agoraConfig()).toBeNull();
    vi.stubEnv("AGORA_APP_CERTIFICATE", "your-app-certificate");
    expect(agoraConfig()).toBeNull();
    vi.stubEnv("AGORA_APP_CERTIFICATE", config.certificate);
    expect(agoraConfig()).toEqual(config);
  });
});

describe("session tokens", () => {
  it("are short-lived and never outlast the room", () => {
    const now = Date.parse("2027-03-15T10:00:00Z");
    expect(tokenLifetime("2027-03-15T12:00:00Z", now)).toBe(TOKEN_LIFETIME_SECONDS);
    expect(tokenLifetime("2027-03-15T10:05:00Z", now)).toBe(300);
    expect(tokenLifetime("2027-03-15T10:00:01Z", now)).toBe(30);
  });
  it("are valid Agora tokens bound to the room and the seat", async () => {
    const join = await buildJoin(config, channel, SESSION_UIDS.client, inAnHour());
    expect(join.token.startsWith("007")).toBe(true);
    // @ts-expect-error The package ships no types for its token parser.
    const { AccessToken2 } = (await import("agora-token/src/AccessToken2")) as unknown as {
      AccessToken2: new () => {
        from_string(token: string): boolean;
        appId: string;
        expire: number;
        services: Record<number, { __channel_name: string; __uid: string }>;
      };
    };
    const parsed = new AccessToken2();
    expect(parsed.from_string(join.token)).toBe(true);
    expect(String(parsed.appId)).toBe(config.appId);
    expect(parsed.expire).toBe(TOKEN_LIFETIME_SECONDS);
    const rtc = Object.values(parsed.services)[0]!;
    expect(String(rtc.__channel_name)).toBe(channel);
    expect(String(rtc.__uid)).toBe(String(SESSION_UIDS.client));
    expect(JSON.stringify(join)).not.toContain(config.certificate);
  });
  it("gives the two seats different uids", () => {
    expect(SESSION_UIDS.client).not.toBe(SESSION_UIDS.counsellor);
  });
});

describe("media encryption key", () => {
  it("is shared within a room, different between rooms and hides the certificate", async () => {
    const first = await deriveMediaKey(config.certificate, channel);
    expect(await deriveMediaKey(config.certificate, channel)).toEqual(first);
    // A secret over 62 bytes can't be encrypted by the SDK, and every join then fails.
    expect(first.secret.length).toBeLessThanOrEqual(62);
    expect(atob(first.secret)).toHaveLength(32);
    expect(first.salt).toMatch(/^[a-f0-9]{64}$/);
    expect(first.secret).not.toBe(first.salt);
    expect((await deriveMediaKey(config.certificate, `aviv-${"d".repeat(32)}`)).secret).not.toBe(
      first.secret,
    );
    expect(JSON.stringify(first)).not.toContain(config.certificate);
  });
});

describe("room decisions", () => {
  it("only gives credentials for an open room", async () => {
    const access = await accessFromRoom(
      config,
      {
        state: "open",
        room: channel,
        service: "Individual session",
        start: "2027-03-15T09:00:00Z",
        end: "2027-03-15T10:00:00Z",
        closes_at: inAnHour(),
      },
      SESSION_UIDS.counsellor,
    );
    expect(access.status).toBe("ready");
    if (access.status === "ready") expect(access.join.uid).toBe(SESSION_UIDS.counsellor);
    expect(await accessFromRoom(config, { state: "early", opens_at: "x" }, 1)).toEqual({
      status: "early",
      opensAt: "x",
    });
    expect(await accessFromRoom(config, { state: "ended" }, 1)).toEqual({ status: "ended" });
    expect(await accessFromRoom(config, { state: "rate_limited" }, 1)).toEqual({
      status: "rate_limited",
    });
    expect(await accessFromRoom(config, { state: "unavailable" }, 1)).toEqual({
      status: "unavailable",
    });
    expect(await accessFromRoom(config, null, 1)).toEqual({ status: "infrastructure" });
  });
});

describe("session window", () => {
  it("opens 15 minutes before the start and closes 15 minutes after the end", () => {
    const { opensAt, closesAt } = sessionWindow("2027-03-15T09:00:00Z", "2027-03-15T10:00:00Z");
    expect(opensAt.toISOString()).toBe("2027-03-15T08:45:00.000Z");
    expect(closesAt.toISOString()).toBe("2027-03-15T10:15:00.000Z");
  });
});
