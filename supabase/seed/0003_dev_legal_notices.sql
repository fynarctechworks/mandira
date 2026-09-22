-- Development legal notices (PRD-PRIV-005, 0054).
--
-- Sign-in is closed until the consent notice and the grievance contact are published,
-- which is the point of the requirement — but it would also close sign-in on every
-- developer machine and in the E2E suite, where nobody is consenting to anything.
--
-- So this seed publishes obviously-fake text, and says so IN the text. Seeds never run
-- against production (`supabase db reset` is a local command), and a notice that says
-- "development placeholder" cannot be mistaken for the company's undertaking if it ever
-- somehow appeared in front of a person. The real wording is written by the founder in
-- Ops → Legal notices before launch.

update legal_notices
   set body_i18n = jsonb_build_object(
         'en', 'Development placeholder — not a real notice. Mandhira keeps the journeys you build, who you are travelling with, and your language. It is never shared with the people who maintain our content.',
         'hi', 'डेवलपमेंट प्लेसहोल्डर — यह असली सूचना नहीं है।',
         'te', 'డెవలప్‌మెంట్ ప్లేస్‌హోల్డర్ — ఇది నిజమైన నోటీసు కాదు.')
 where key = 'consent_notice';

update legal_notices
   set body_i18n = jsonb_build_object(
         'en', 'Development placeholder — not a real contact. Grievance Officer, grievance@example.invalid',
         'hi', 'डेवलपमेंट प्लेसहोल्डर — यह असली संपर्क नहीं है।',
         'te', 'డెవలప్‌మెంట్ ప్లేస్‌హోల్డర్ — ఇది నిజమైన సంప్రదింపు కాదు.')
 where key = 'grievance_contact';

do $$
begin
  raise notice 'Seeded development legal notices. Real wording is published in Ops before launch.';
end;
$$;
