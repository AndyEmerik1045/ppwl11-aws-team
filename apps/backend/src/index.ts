import { Elysia } from "elysia";
import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import { createOAuthClient, getAuthUrl } from "./auth";
import { getCourses, getCourseWorks, getSubmissions } from "./classroom";
import type { ApiResponse, HealthCheck, User } from "shared";
import type { DbClient } from "./types";

const makeAuthMiddleware = (jwtInstance: any) =>
  async ({ headers, set }: any) => {
    const authHeader = headers.authorization;
    if (!authHeader) { set.status = 401; return null; }
    const token = authHeader.replace("Bearer ", "");
    const payload = await jwtInstance.verify(token);
    if (!payload) { set.status = 401; return null; }
    return payload;
  };

export const createApp = (getPrisma: () => DbClient) => {
  const app = new Elysia()
    .use(cookie())
    .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET!, exp: "1d" }))
    .onRequest(({ request, set }) => {
      const url = new URL(request.url);
      console.log(`[DEBUG] [${request.method}] ${url.pathname}`);
      if (request.method === "OPTIONS") return;
      if (!url.pathname.startsWith("/users")) return;
      const origin = request.headers.get("origin");
      const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
      const key = url.searchParams.get("key");
      if (origin === frontendUrl) return;
      if (key !== process.env.API_KEY) {
        set.status = 401;
        return { message: "Unauthorized: Access denied without valid API Key" };
      }
    })
    .get("/", (): ApiResponse<HealthCheck> => ({
      data: { status: "ok" },
      message: "server running",
    }))
    .get("/users", async () => {
      const users = await getPrisma().user.findMany();
      const response: ApiResponse<User[]> = { data: users, message: "User list retrieved" };
      return response;
    })
    .get("/auth/login", ({ redirect }) => {
      const oauth2Client = createOAuthClient();
      const url = getAuthUrl(oauth2Client);
      return redirect(url);
    })
    .get("/auth/callback", async ({ query, jwt, redirect }) => {
      const { code } = query as any;
      const oauth2Client = createOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);
      const token = await jwt.sign({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      return redirect(`${process.env.FRONTEND_URL}/classroom?token=${token}`);
    })
    .get("/auth/me", async ({ headers, jwt, set }) => {
      const auth = makeAuthMiddleware(jwt);
      const user = await auth({ headers, set });
      if (!user) return { loggedIn: false };
      return { loggedIn: true, user };
    })
    .get("/classroom/courses", async ({ headers, jwt, set }) => {
      const auth = makeAuthMiddleware(jwt);
      const user = await auth({ headers, set });
      if (!user) return;
      const courses = await getCourses(user.access_token);
      return { data: courses };
    })
    .get("/classroom/courses/:courseId/submissions", async ({ params, headers, jwt, set }) => {
      const auth = makeAuthMiddleware(jwt);
      const user = await auth({ headers, set });
      if (!user) return;
      const { courseId } = params;
      const [courseWorks, submissions] = await Promise.all([
        getCourseWorks(user.access_token, courseId),
        getSubmissions(user.access_token, courseId),
      ]);
      return {
        data: courseWorks.map((cw) => ({
          courseWork: cw,
          submission: submissions.find((s) => s.courseWorkId === cw.id) ?? null,
        })),
      };
    });

  return app;
};
