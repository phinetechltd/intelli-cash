"use client";

import React, { useState, type ImgHTMLAttributes } from "react";
import { DEFAULT_IMAGE_PLACEHOLDER } from "../lib/placeholders";

interface FallbackImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  fallbackSrc?: string;
  src?: string | null;
}

export function FallbackImage({
  alt,
  fallbackSrc = DEFAULT_IMAGE_PLACEHOLDER,
  onError,
  src,
  ...props
}: FallbackImageProps) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = src && !failed ? src : fallbackSrc;

  return (
    <img
      {...props}
      alt={alt}
      data-placeholder={resolvedSrc === fallbackSrc ? "true" : undefined}
      onError={(event) => {
        if (resolvedSrc !== fallbackSrc) setFailed(true);
        onError?.(event);
      }}
      src={resolvedSrc}
    />
  );
}
