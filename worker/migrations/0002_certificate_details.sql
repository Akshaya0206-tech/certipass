-- What a student tells us about a certificate when they upload it, so people can find it again without opening it.
-- All optional: certificates attached to an achievement (the long submission form) carry no separate title.

ALTER TABLE certificate_files ADD COLUMN title TEXT CHECK (title IS NULL OR length(title) BETWEEN 1 AND 120);
ALTER TABLE certificate_files ADD COLUMN issuer TEXT CHECK (issuer IS NULL OR length(issuer) BETWEEN 1 AND 120);
-- YYYY-MM-DD
ALTER TABLE certificate_files ADD COLUMN issue_date TEXT CHECK (issue_date IS NULL OR (length(issue_date) = 10 AND issue_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'));

CREATE INDEX certificate_files_batch_idx ON certificate_files (admission_batch);
CREATE INDEX certificate_files_uploaded_idx ON certificate_files (uploaded_at) WHERE storage_status = 'stored';