-- Development fixture accounts only. Never run this file against a production database.
INSERT OR IGNORE INTO users VALUES ('alice','Alice'), ('bob','Bob'), ('outsider','非项目成员');
INSERT OR IGNORE INTO teams VALUES ('demo-team','ColloSys 本地团队');
INSERT OR IGNORE INTO projects VALUES ('demo-project','demo-team','双成员协作项目');
INSERT OR IGNORE INTO project_members VALUES ('demo-project','alice','owner'),('demo-project','bob','editor');

INSERT OR IGNORE INTO team_members VALUES ('demo-team','alice','owner'),('demo-team','bob','member');
