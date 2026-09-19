import { readFile as fsReadFile } from "node:fs/promises";
import type { Config } from "../../config.js";
import type { PlatformAdapter } from "../types.js";
import { sanitizeUpstreamMessage } from "../../util/sanitize.js";
import {
  buildAuthorizationUrl,
  buildPostPayload,
  createPost,
  exchangeAuthorizationCode,
  fetchUserinfo,
  initializeImageUpload,
  uploadImageBytes,
} from "./client.js";

type FetchImpl = typeof fetch;

/** Distinguishes an image-stage failure from a post-creation failure, so callers can map it to IMAGE_UPLOAD_FAILED specifically. */
export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageUploadError";
  }
}

export interface LinkedInAdapterDeps {
  initializeImageUpload?: typeof initializeImageUpload;
  uploadImageBytes?: typeof uploadImageBytes;
  createPost?: typeof createPost;
  exchangeAuthorizationCode?: typeof exchangeAuthorizationCode;
  fetchUserinfo?: typeof fetchUserinfo;
  readFile?: (path: string) => Promise<Buffer>;
  fetchImpl?: FetchImpl;
}

/**
 * `postUrl` construction: LinkedIn's Posts API documentation states a
 * published UGC post is viewable at
 * `https://www.linkedin.com/feed/update/urn:li:ugcPost:<id>/`. The modern
 * Posts API returns `urn:li:share:<id>` for member posts; LinkedIn's docs
 * don't separately spell out a share-URN URL, but the same `/feed/update/`
 * viewer path is used site-wide for both URN kinds, so this is a documented
 * pattern extended by (reasonable, not 100%-confirmed) analogy - ASSUMPTION,
 * not a guarantee, flagged here and in the README.
 */
function buildPostUrl(postId: string): string {
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`;
}

export function createLinkedInAdapter(config: Config, deps: LinkedInAdapterDeps = {}): PlatformAdapter {
  const initUpload = deps.initializeImageUpload ?? initializeImageUpload;
  const doUploadBytes = deps.uploadImageBytes ?? uploadImageBytes;
  const doCreatePost = deps.createPost ?? createPost;
  const doExchangeCode = deps.exchangeAuthorizationCode ?? exchangeAuthorizationCode;
  const doFetchUserinfo = deps.fetchUserinfo ?? fetchUserinfo;
  const readFile = deps.readFile ?? ((path: string) => fsReadFile(path));

  return {
    name: "linkedin",

    buildAuthorizationUrl(state: string): string {
      return buildAuthorizationUrl(config, state);
    },

    async exchangeAuthorizationCode(code: string) {
      return doExchangeCode(config, code, deps.fetchImpl);
    },

    async fetchIdentity(accessToken: string) {
      const { sub, name } = await doFetchUserinfo(config, accessToken, deps.fetchImpl);
      return {
        externalAccountId: sub,
        authorUrn: `urn:li:person:${sub}`,
        displayName: name,
      };
    },

    async publishPost({ accessToken, authorUrn, content }) {
      let imageUrn: string | undefined;

      if (content.mediaAbsolutePath) {
        // Any failure in this block is deliberately re-thrown as ImageUploadError
        // and we never reach createPost below - the draft stays out of a
        // "published" state (see tools/publish.ts), which is how partial
        // failure (image uploaded, post not created) is handled without
        // misleadingly marking the draft published.
        try {
          const { uploadUrl, image } = await initUpload(config, accessToken, authorUrn, deps.fetchImpl);
          const bytes = await readFile(content.mediaAbsolutePath);
          await doUploadBytes(uploadUrl, accessToken, bytes, deps.fetchImpl);
          imageUrn = image;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Image upload failed";
          throw new ImageUploadError(sanitizeUpstreamMessage(message));
        }
      }

      const payload = buildPostPayload({ authorUrn, text: content.text, imageUrn });
      const { postId } = await doCreatePost(config, accessToken, payload, deps.fetchImpl);

      return { postId, postUrl: buildPostUrl(postId) };
    },
  };
}
