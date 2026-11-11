import { describe, expect, it } from "vitest";
import { decodeChatMessage, decodeChatText, encodeChatMessage, encodeChatText } from "@/lib/chat-text";

describe("chat text", () => {
  it("keeps a text message readable", () => {
    const encoded = encodeChatText("hello");
    expect(decodeChatText(encoded)).toBe("hello");
    expect(decodeChatMessage(encoded)?.file).toBeNull();
  });

  it("carries an image key inside the message without changing a text-only message", () => {
    const encoded = encodeChatMessage("caption", {
      attachmentId: "6af218531d3a2a0817fc6a83",
      name: "photo.png",
      mimeType: "image/png",
      size: 128,
      key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    });
    const decoded = decodeChatMessage(encoded);
    expect(decoded?.text).toBe("caption");
    expect(decoded?.file?.name).toBe("photo.png");
    expect(decoded?.file?.key).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    expect(decodeChatText(encodeChatText("hello"))).toBe("hello");
  });
});
