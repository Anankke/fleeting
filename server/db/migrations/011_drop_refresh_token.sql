-- 011_drop_refresh_token.sql
-- EVE tokens are now obtained via the in-house OIDC passthrough endpoint
-- (POST <issuer>/oauth/passthrough/<character_id>) which returns no refresh_token.
-- The in-house OIDC refresh_token is kept in the session, not per-character.
ALTER TABLE eve_characters DROP COLUMN IF EXISTS refresh_token;
