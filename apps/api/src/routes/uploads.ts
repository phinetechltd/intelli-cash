import { mkdirSync } from "node:fs";
import { extname } from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import type { Permission } from "@intellicash/shared";
import { requireAuth } from "../middleware/auth";
import { ApiHttpError, ok } from "../lib/http";
import { publicUploadUrl, uploadRoot } from "../lib/uploads";

const router = Router();

const uploadKinds = ["avatar", "image", "file", "store-image"] as const;
type UploadKind = (typeof uploadKinds)[number];

const kindPermissions: Record<UploadKind, Permission | null> = {
  avatar: null,
  image: "programmes:write",
  file: "programmes:write",
  "store-image": "store:write"
};

const allowedMimeTypes: Record<UploadKind, string[]> = {
  avatar: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  "store-image": ["image/jpeg", "image/png", "image/webp", "image/gif"],
  file: [
    "application/pdf",
    "text/csv",
    "text/plain",
    "application/json",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
    "image/webp"
  ]
};

function uploadKind(value: string): UploadKind {
  if (uploadKinds.includes(value as UploadKind)) return value as UploadKind;
  throw new ApiHttpError(404, "UPLOAD_KIND_NOT_FOUND", "Upload target does not exist.");
}

function safeExtension(file: Express.Multer.File) {
  const originalExtension = extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (originalExtension) return originalExtension;
  if (file.mimetype === "image/jpeg") return ".jpg";
  if (file.mimetype === "image/png") return ".png";
  if (file.mimetype === "image/webp") return ".webp";
  if (file.mimetype === "application/pdf") return ".pdf";
  if (file.mimetype === "text/csv") return ".csv";
  return "";
}

const storage = multer.diskStorage({
  destination(req, _file, callback) {
    try {
      const kind = uploadKind(String(req.params.kind ?? ""));
      const destination = `${uploadRoot}/${kind}`;
      mkdirSync(destination, { recursive: true });
      callback(null, destination);
    } catch (error) {
      callback(error as Error, "");
    }
  },
  filename(_req, file, callback) {
    callback(null, `${Date.now()}-${randomUUID()}${safeExtension(file)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  },
  fileFilter(req, file, callback) {
    try {
      const kind = uploadKind(String(req.params.kind ?? ""));
      if (!allowedMimeTypes[kind].includes(file.mimetype)) {
        callback(new ApiHttpError(400, "UPLOAD_TYPE_NOT_ALLOWED", "This file type is not allowed for this upload target."));
        return;
      }

      callback(null, true);
    } catch (error) {
      callback(error as Error);
    }
  }
});

router.post("/uploads/:kind", requireAuth(), (req, res, next) => {
  const kind = uploadKind(String(req.params.kind ?? ""));
  const requiredPermission = kindPermissions[kind];
  if (requiredPermission && !req.user?.permissions.includes(requiredPermission)) {
    next(new ApiHttpError(403, "FORBIDDEN", "You do not have permission to upload this file."));
    return;
  }

  upload.single("file")(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }

    if (!req.file) {
      next(new ApiHttpError(400, "UPLOAD_FILE_REQUIRED", "Choose a file to upload."));
      return;
    }

    ok(res.status(201), {
      kind,
      url: publicUploadUrl(`${kind}/${req.file.filename}`),
      path: `/uploads/${kind}/${req.file.filename}`,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });
  });
});

export { router as uploadsRouter };
