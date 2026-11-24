-- Rollback Migration 004: Remove password reset tokens.

DROP TABLE password_reset_tokens;
