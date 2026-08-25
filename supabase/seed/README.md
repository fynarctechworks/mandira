# Local dev seed

`supabase db reset` loads every `*.sql` here, in filename order, **after** migrations.

Fixtures only — never anything production depends on. Reference data that the product
requires (launch locales, for example) belongs in a migration, not here, so that
production gets it too.

Empty until B-013 seeds the first destination.
