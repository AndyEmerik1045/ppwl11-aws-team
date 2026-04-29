import { createApp } from "./index";
import { loadConfig } from "./config";       // SSM loader
import { getPrisma } from "../prisma/dbPostgres"; // PostgreSQL

let app: ReturnType<typeof createApp>;

export const handler = async (event: any) => {
  // DEBUG: log seluruh event untuk lihat apakah OPTIONS masuk
  console.log("[EVENT] method:", event.requestContext?.http?.method);
  console.log("[EVENT] path:", event.rawPath);
  console.log("[EVENT] headers:", JSON.stringify(event.headers));

  await loadConfig(); // load SSM sekali, lalu di-cache

  if (!app) {
    app = createApp(getPrisma); // buat app setelah env ready
  }

  // DEBUG ENV
  console.log("[DATABASE_URL]:", process.env.DATABASE_URL);
  console.log("[FRONTEND_URL] env:", process.env.FRONTEND_URL);
  console.log("[API_KEY] env:", process.env.API_KEY);
  console.log("[JWT_SECRET] env:", process.env.JWT_SECRET);

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

  // Handle preflight OPTIONS langsung di handler — sebelum masuk Elysia
  // Lambda URL CORS config tidak reliable, jadi kita handle manual
  if (event.requestContext.http.method === "OPTIONS") {
    console.log("[OPTIONS] preflight handled for:", event.rawPath);
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": frontendUrl,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
      body: "",
    };
  }

  const url = `https://${event.headers.host}${event.rawPath}${event.rawQueryString ? "?" + event.rawQueryString : ""
    }`;

  const response = await app.handle(
    new Request(url, {
      method: event.requestContext.http.method,
      headers: event.headers,
      body: event.body
        ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
        : undefined,
    })
  );

  // Inject CORS headers ke semua response dari Elysia
  const resHeaders = Object.fromEntries(response.headers);

  // DEBUG — log headers sebelum inject
  console.log("[RESPONSE] status:", response.status);
  console.log("[RESPONSE] headers before inject:", JSON.stringify(resHeaders));

  resHeaders["Access-Control-Allow-Origin"] = frontendUrl;
  resHeaders["Access-Control-Allow-Credentials"] = "true";

  // DEBUG — log headers setelah inject  
  console.log("[RESPONSE] headers after inject:", JSON.stringify(resHeaders));

  return {
    statusCode: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      "Access-Control-Allow-Origin": frontendUrl,
      "Access-Control-Allow-Credentials": "true",
    },
    body: await response.text(),
    isBase64Encoded: false,
  };
};
