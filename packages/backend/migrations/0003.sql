-- Immutable upload generation; legacy objects retain their original object key.
CREATE TABLE IF NOT EXISTS backup_generations(id TEXT PRIMARY KEY, generation TEXT NOT NULL);
INSERT OR IGNORE INTO backup_generations SELECT id,'legacy' FROM backup_objects;
CREATE TRIGGER IF NOT EXISTS backup_generation_insert AFTER INSERT ON backup_objects
BEGIN INSERT INTO backup_generations VALUES(NEW.id,lower(hex(randomblob(16)))); END;
CREATE TRIGGER IF NOT EXISTS backup_generation_delete AFTER DELETE ON backup_objects
BEGIN DELETE FROM backup_generations WHERE id=OLD.id; END;
