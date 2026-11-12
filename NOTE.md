Before using the updated HugaTiera project, update your local database schema.

1. Back up your existing HugaTiera database.
2. Check whether your database has already been updated with Migration 001.
3. If it is still using the old schema, execute `database/migrations/001_unified_requests_and_agreements.sql` exactly once.
4. Verify that the migration completed successfully before starting the updated application.
5. If your database is already migrated or the migration previously failed, do not execute the SQL again. Ask me first.

Do not use the production database or overwrite existing data without a backup.