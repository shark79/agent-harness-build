/**
 * LinkedIn endpoint/scope constants, verified against LinkedIn's current developer
 * documentation (learn.microsoft.com/en-us/linkedin/...) at build time:
 * - Posts API (current generation, replaces the deprecated ugcPosts API)
 * - Images API (current generation, replaces the deprecated Assets API)
 * - Sign In with LinkedIn using OpenID Connect
 *
 * LINKEDIN_VERSION itself is never hardcoded here - it's always read from config
 * (src/config.ts), which reads it from the LINKEDIN_VERSION env var.
 */
export const LINKEDIN_AUTHORIZATION_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const LINKEDIN_POSTS_URL = "https://api.linkedin.com/rest/posts";
export const LINKEDIN_IMAGES_INITIALIZE_UPLOAD_URL =
  "https://api.linkedin.com/rest/images?action=initializeUpload";

/** Exact scopes required by this workflow - never request more. */
export const LINKEDIN_OAUTH_SCOPES = "openid profile w_member_social";
