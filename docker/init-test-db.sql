-- Vitest runs against a separate database in the same instance so that a test
-- run never truncates the tables you are looking at in the browser.
CREATE DATABASE clipping_marketplace_test;
