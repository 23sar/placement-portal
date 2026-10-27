-- Migration 009: Track read state per student for published announcements
-- Scoped per authenticated student account.
-- Usage: mysql -u root -p placement_portal < database/migrations/009_create_announcement_reads.sql

USE placement_portal;

CREATE TABLE IF NOT EXISTS announcement_reads (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  announcement_id INT UNSIGNED NOT NULL,
  read_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_announcement_user_read UNIQUE (user_id, announcement_id),
  CONSTRAINT fk_announcement_reads_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_announcement_reads_announcement
    FOREIGN KEY (announcement_id) REFERENCES announcements(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_announcement_reads_user (user_id),
  INDEX idx_announcement_reads_announcement (announcement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
