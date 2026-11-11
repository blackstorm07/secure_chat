import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

const optionalText = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    REALTIME_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    MONGODB_URI: z.string().min(1),
    APP_URL: z.url(),
    ALLOWED_ORIGINS: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    REDIS_URL: optionalText,
    CLOUDINARY_CLOUD_NAME: optionalText,
    CLOUDINARY_API_KEY: optionalText,
    CLOUDINARY_API_SECRET: optionalText,
    CLOUDINARY_URL_EXPIRY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(30).max(3600).default(300)),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .superRefine((value, context) => {
    const origins = value.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
    if (origins.length === 0) {
      context.addIssue({ code: "custom", path: ["ALLOWED_ORIGINS"], message: "At least one origin is required" });
    }
    for (const origin of origins) {
      const parsed = z.url().safeParse(origin);
      if (!parsed.success) {
        context.addIssue({ code: "custom", path: ["ALLOWED_ORIGINS"], message: "ALLOWED_ORIGINS contains an invalid URL" });
      }
    }

    const cloudinaryValues = [value.CLOUDINARY_CLOUD_NAME, value.CLOUDINARY_API_KEY, value.CLOUDINARY_API_SECRET];
    const cloudinaryCount = cloudinaryValues.filter(Boolean).length;
    if (cloudinaryCount > 0 && cloudinaryCount < cloudinaryValues.length) {
      context.addIssue({
        code: "custom",
        path: ["CLOUDINARY_CLOUD_NAME"],
        message: "Cloudinary requires the cloud name, API key, and API secret together",
      });
    }
    if (value.CLOUDINARY_CLOUD_NAME && !/^[a-z0-9][a-z0-9-]{0,62}$/i.test(value.CLOUDINARY_CLOUD_NAME)) {
      context.addIssue({
        code: "custom",
        path: ["CLOUDINARY_CLOUD_NAME"],
        message: "CLOUDINARY_CLOUD_NAME must be the cloud name from the Cloudinary console",
      });
    }

    if (value.NODE_ENV === "production") {
      if (!value.APP_URL.startsWith("https://")) {
        context.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL must use https in production" });
      }
      if (origins.some((origin) => !origin.startsWith("https://"))) {
        context.addIssue({
          code: "custom",
          path: ["ALLOWED_ORIGINS"],
          message: "Production origins must use https",
        });
      }
      if (!value.MONGODB_URI.startsWith("mongodb://") && !value.MONGODB_URI.startsWith("mongodb+srv://")) {
        context.addIssue({ code: "custom", path: ["MONGODB_URI"], message: "MONGODB_URI must be a MongoDB connection string" });
      }
      if (cloudinaryCount !== cloudinaryValues.length) {
        context.addIssue({
          code: "custom",
          path: ["CLOUDINARY_CLOUD_NAME"],
          message: "Production requires Cloudinary configuration",
        });
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema> & { origins: string[] };

let cached: AppEnv | null = null;

export function resetEnvCache(): void {
  cached = null;
}

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".") || "environment").join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  cached = {
    ...parsed.data,
    origins: parsed.data.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  };
  return cached;
}
