import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tokenCookies } from "@/lib/cookies";
import { HttpClient } from "../HttpClient";

const nowSec = () => Math.floor(Date.now() / 1000);

const jwt = (exp: number, iat = nowSec()) =>
  `x.${btoa(JSON.stringify({ sub: "u-1", iat, exp }))}.y`;

type Reply = { status: number; data: unknown };
type Seen = { url?: string; auth?: string; body?: unknown };

let seen: Seen[] = [];
let reply: (config: InternalAxiosRequestConfig) => Reply;
const originalAdapter = axios.defaults.adapter;
const originalLocation = window.location;

const respond = async (config: InternalAxiosRequestConfig) => {
  seen.push({
    url: config.url,
    auth: config.headers?.Authorization as string | undefined,
    body: typeof config.data === "string" ? JSON.parse(config.data) : config.data,
  });
  const { status, data } = reply(config);
  const response = { status, data, statusText: "", headers: {}, config };
  if (status >= 400) {
    throw new AxiosError("failed", String(status), config, null, response);
  }
  return response;
};

const isRefresh = (config: InternalAxiosRequestConfig) =>
  String(config.url).endsWith("/api/v1/auth/refresh");

describe("HttpClient session renewal", () => {
  beforeEach(() => {
    seen = [];
    sessionStorage.clear();
    axios.defaults.adapter = respond;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { pathname: "/cashier", href: "/cashier", protocol: "http:" },
    });
  });

  afterEach(() => {
    axios.defaults.adapter = originalAdapter;
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("renews a sign-in about to run out before sending the request", async () => {
    tokenCookies.setToken(jwt(nowSec() + 60));
    tokenCookies.setRefreshToken("refresh-1");
    const fresh = jwt(nowSec() + 3600);
    reply = (config) =>
      isRefresh(config)
        ? { status: 201, data: { data: { access_token: fresh, refresh_token: "refresh-2" } } }
        : { status: 200, data: { ok: true } };

    await new HttpClient("http://api").get("/api/v1/rooms");

    expect(seen[0]).toMatchObject({ body: { refresh_token: "refresh-1" } });
    expect(seen[1]).toMatchObject({ url: "/api/v1/rooms", auth: `Bearer ${fresh}` });
    expect(tokenCookies.getToken()).toBe(fresh);
    expect(tokenCookies.getRefreshToken()).toBe("refresh-2");
  });

  it("asks for one renewal however many requests are waiting", async () => {
    tokenCookies.setToken(jwt(nowSec() + 60));
    tokenCookies.setRefreshToken("refresh-1");
    reply = (config) =>
      isRefresh(config)
        ? { status: 201, data: { access_token: jwt(nowSec() + 3600), refresh_token: "r" } }
        : { status: 200, data: {} };
    const client = new HttpClient("http://api");

    await Promise.all([client.get("/a"), client.get("/b"), client.get("/c")]);

    expect(seen.filter((item) => item.url?.endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("renews and sends the request again when the server says the sign-in ran out", async () => {
    tokenCookies.setToken(jwt(nowSec() + 3600));
    tokenCookies.setRefreshToken("refresh-1");
    const fresh = jwt(nowSec() + 7200);
    let calls = 0;
    reply = (config) => {
      if (isRefresh(config)) return { status: 201, data: { access_token: fresh } };
      calls += 1;
      return calls === 1
        ? { status: 401, data: { message: "Unauthorized" } }
        : { status: 200, data: { rooms: 3 } };
    };

    const result = await new HttpClient("http://api").get("/api/v1/rooms");

    expect(result).toEqual({ rooms: 3 });
    expect(seen.at(-1)).toMatchObject({ auth: `Bearer ${fresh}` });
    expect(window.location.href).toBe("/cashier");
  });

  it("signs out saying another device took over, without trying to renew", async () => {
    tokenCookies.setToken(jwt(nowSec() + 3600));
    tokenCookies.setRefreshToken("refresh-1");
    reply = () => ({
      status: 401,
      data: { message: "This account was signed in on another device." },
    });

    await expect(new HttpClient("http://api").get("/api/v1/rooms")).rejects.toThrow();

    expect(seen.some((item) => item.url?.endsWith("/auth/refresh"))).toBe(false);
    expect(window.location.href).toBe("/login?reason=signed_in_elsewhere");
  });

  it("signs out when the server will not renew the sign-in", async () => {
    tokenCookies.setToken(jwt(nowSec() + 3600));
    tokenCookies.setRefreshToken("refresh-1");
    reply = () => ({ status: 401, data: { message: "Your session has ended." } });

    await expect(new HttpClient("http://api").get("/api/v1/rooms")).rejects.toThrow();

    expect(window.location.href).toBe("/login?reason=session_expired");
    expect(tokenCookies.getToken()).toBeNull();
  });

  it("keeps the staff signed in when the renewal fails for lack of network", async () => {
    tokenCookies.setToken(jwt(nowSec() + 60));
    tokenCookies.setRefreshToken("refresh-1");
    reply = (config) =>
      isRefresh(config) ? { status: 503, data: {} } : { status: 200, data: { ok: true } };

    await expect(new HttpClient("http://api").get("/api/v1/rooms")).resolves.toEqual({ ok: true });

    expect(window.location.href).toBe("/cashier");
    expect(tokenCookies.getRefreshToken()).toBe("refresh-1");
  });

  it("trusts the server's clock over a tablet clock that runs fast", async () => {
    const serverNow = nowSec() - 2 * 3600;
    tokenCookies.setToken(jwt(serverNow + 3600, serverNow));
    tokenCookies.setRefreshToken("refresh-1");
    reply = () => ({ status: 200, data: {} });

    await new HttpClient("http://api").get("/api/v1/rooms");

    expect(seen.map((item) => item.url)).toEqual(["/api/v1/rooms"]);
  });
});
