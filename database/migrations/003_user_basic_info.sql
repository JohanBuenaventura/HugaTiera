-- Migration 003: Add optional middle_name and date_of_birth (18+ verification) to users

ALTER TABLE users
  ADD COLUMN middle_name VARCHAR(100) NULL AFTER first_name,
  ADD COLUMN date_of_birth DATE NULL AFTER phone;
