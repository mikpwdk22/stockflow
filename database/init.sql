-- Combine migration and seed for docker-entrypoint-initdb.d
\i /docker-entrypoint-initdb.d/000001_init_schema.up.sql
\i /docker-entrypoint-initdb.d/01_seed_data.sql
