import { describe, expect, it } from "vitest";
import { isPrivateNetworkHost, isPrivateNetworkOrigin } from "@/lib/security";

describe("private network origins", () => {
  it("accepts LAN hosts and rejects public hosts", () => {
    expect(isPrivateNetworkHost("192.168.0.129")).toBe(true);
    expect(isPrivateNetworkHost("10.1.2.3")).toBe(true);
    expect(isPrivateNetworkHost("172.16.0.4")).toBe(true);
    expect(isPrivateNetworkHost("localhost")).toBe(true);
    expect(isPrivateNetworkHost("phone.local")).toBe(true);
    expect(isPrivateNetworkHost("8.8.8.8")).toBe(false);
    expect(isPrivateNetworkHost("172.15.0.1")).toBe(false);
    expect(isPrivateNetworkOrigin("http://192.168.1.20:3000")).toBe(true);
    expect(isPrivateNetworkOrigin("https://example.com")).toBe(false);
  });
});
