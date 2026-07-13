-- Rename Store.logoUrl to Store.coverUrl (repurposed as store cover image)
ALTER TABLE `Store` RENAME COLUMN `logoUrl` TO `coverUrl`;
