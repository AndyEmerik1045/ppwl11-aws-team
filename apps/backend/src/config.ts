import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({ region: "us-east-1" });

const SSM_PARAMS = [
  "/asdos/GOOGLE_CLIENT_ID",
  "/asdos/GOOGLE_CLIENT_SECRET",
  "/asdos/GOOGLE_REDIRECT_URI",
  "/asdos/FRONTEND_URL",
  "/asdos/JWT_SECRET",
  "/monorepo/DATABASE_URL",
  "/monorepo/API_KEY",
];

let isLoaded = false;

export const loadConfig = async () => {
  if (isLoaded) return;
  const command = new GetParametersCommand({
    Names: SSM_PARAMS,
    WithDecryption: true,
  });
  const response = await ssm.send(command);
  response.Parameters?.forEach((param) => {
    const n = param.Name;
    const v = param.Value;
    if (!n || !v) return;
    const key = n.split("/").pop();
    if (key) process.env[key] = v;
  });
  isLoaded = true;
};
