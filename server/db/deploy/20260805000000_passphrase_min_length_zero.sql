DROP PROCEDURE IF EXISTS migrate_passphrase_min_length_zero;
DELIMITER $$
CREATE PROCEDURE migrate_passphrase_min_length_zero()
BEGIN
  UPDATE auth_policy SET passphrase_min_length = 0 WHERE id = 'default';
  ALTER TABLE auth_policy MODIFY passphrase_min_length INT NOT NULL DEFAULT 0;
END$$
DELIMITER ;
CALL migrate_passphrase_min_length_zero();
DROP PROCEDURE migrate_passphrase_min_length_zero;
