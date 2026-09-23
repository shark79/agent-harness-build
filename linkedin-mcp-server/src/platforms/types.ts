/**
 * Generic platform-adapter interface. LinkedIn is the only implementation
 * today (src/platforms/linkedin/adapter.ts); a future Meta/Instagram/TikTok
 * adapter would implement this same shape without touching LinkedIn's code.
 */
export interface PlatformPostContent {
  text: string;
  /** Absolute, already-validated path to a local media file, if any. */
  mediaAbsolutePath?: string;
  mediaMimeType?: string;
}

export interface PublishedPost {
  postId: string;
  /** null when the platform's response doesn't reliably give us enough to construct a real URL. */
  postUrl: string | null;
}

export interface PlatformIdentity {
  externalAccountId: string;
  authorUrn: string;
  displayName: string;
}

export interface PlatformTokenResponse {
  accessToken: string;
  expiresIn: number;
  scope: string;
}

export interface PlatformAdapter {
  readonly name: string;
  buildAuthorizationUrl(state: string): string;
  exchangeAuthorizationCode(code: string): Promise<PlatformTokenResponse>;
  fetchIdentity(accessToken: string): Promise<PlatformIdentity>;
  publishPost(input: {
    accessToken: string;
    authorUrn: string;
    content: PlatformPostContent;
  }): Promise<PublishedPost>;
}
