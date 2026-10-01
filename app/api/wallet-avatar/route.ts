import { ImageResponse } from "next/og";
import { createElement } from "react";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
]);

export async function GET(request: Request) {
  try {
    const requestURL = new URL(request.url);
    const avatar = requestURL.searchParams.get("url") ?? "";
    const sizeValue = Number(requestURL.searchParams.get("size") ?? "90");
    const size = [90, 180, 270].includes(sizeValue) ? sizeValue : 90;

    const avatarURL = new URL(avatar);
    if (avatarURL.protocol !== "https:" || !ALLOWED_HOSTS.has(avatarURL.hostname)) {
      return new Response("Unsupported avatar", { status: 400 });
    }

    return new ImageResponse(
      createElement(
        "div",
        {
          style: {
            width: "100%",
            height: "100%",
            display: "flex",
            overflow: "hidden",
            borderRadius: "18%",
            background: "rgb(9, 16, 29)",
          },
        },
        createElement("img", {
          src: avatarURL.toString(),
          width: size,
          height: size,
          style: {
            width: "100%",
            height: "100%",
            objectFit: "cover",
          },
        }),
      ),
      {
        width: size,
        height: size,
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  } catch {
    return new Response("Unable to prepare avatar", { status: 400 });
  }
}
